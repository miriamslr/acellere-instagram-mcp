import { MetaConfig } from "../config.js";
import {
  MetaClient,
  type FormParams,
  type HttpMethod,
  type MetaClientOptions,
  type RequestOptions,
} from "./meta-client.js";

export type AcellereWriteMode = "read-only" | "write";

export interface AcellereSafetyOptions {
  /**
   * Global mutation gate for this fork. Defaults to ACELLERE_WRITE_MODE or
   * "read-only" when the environment variable is omitted.
   */
  writeMode?: AcellereWriteMode;
  /**
   * DELETE requests require this second opt-in even when writeMode="write".
   * Defaults to ACELLERE_ALLOW_DESTRUCTIVE=false.
   */
  allowDestructive?: boolean;
}

export type AcellereMetaClientOptions = MetaClientOptions & AcellereSafetyOptions;

function parseWriteMode(explicit?: AcellereWriteMode): AcellereWriteMode {
  if (explicit) return explicit;
  const raw = (process.env.ACELLERE_WRITE_MODE ?? "read-only").trim().toLowerCase();
  if (raw === "read-only" || raw === "write") return raw;
  throw new Error(
    `ACELLERE_WRITE_MODE must be "read-only" or "write" (got "${raw}").`
  );
}

function parseAllowDestructive(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  const raw = (process.env.ACELLERE_ALLOW_DESTRUCTIVE ?? "false").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off", ""].includes(raw)) return false;
  throw new Error(
    `ACELLERE_ALLOW_DESTRUCTIVE must be a boolean value (got "${raw}").`
  );
}

export function assertAcellereWriteAllowed(
  method: HttpMethod,
  safety: Required<AcellereSafetyOptions>
): void {
  if (method === "GET") return;

  if (safety.writeMode !== "write") {
    throw new Error(
      `Acellere safety gate blocked ${method}: server is running in read-only mode. ` +
        `Set ACELLERE_WRITE_MODE=write only when write actions are intentionally enabled.`
    );
  }

  if (method === "DELETE" && !safety.allowDestructive) {
    throw new Error(
      "Acellere safety gate blocked DELETE: destructive actions are disabled. " +
        "Set ACELLERE_ALLOW_DESTRUCTIVE=true only for an explicitly approved destructive operation."
    );
  }
}

/**
 * MetaClient with a server-side mutation gate for Acellere.
 *
 * MCP annotations remain useful to clients for confirmation UX, but they are
 * advisory. This class enforces the policy before a request can reach Meta.
 */
export class AcellereMetaClient extends MetaClient {
  private readonly safety: Required<AcellereSafetyOptions>;

  constructor(config: MetaConfig, options?: AcellereMetaClientOptions) {
    super(config, options);
    this.safety = {
      writeMode: parseWriteMode(options?.writeMode),
      allowDestructive: parseAllowDestructive(options?.allowDestructive),
    };
  }

  override async ig(
    method: HttpMethod,
    path: string,
    params?: FormParams,
    options?: RequestOptions
  ) {
    assertAcellereWriteAllowed(method, this.safety);
    return super.ig(method, path, params, options);
  }

  override async threads(
    method: HttpMethod,
    path: string,
    params?: FormParams,
    options?: RequestOptions
  ) {
    assertAcellereWriteAllowed(method, this.safety);
    return super.threads(method, path, params, options);
  }

  override async meta(
    method: HttpMethod,
    path: string,
    params?: FormParams,
    options?: RequestOptions
  ) {
    assertAcellereWriteAllowed(method, this.safety);
    return super.meta(method, path, params, options);
  }
}
