import { MetaConfig } from "../config.js";
import {
  MetaClient,
  type ClientResponse,
  type FormParams,
  type HttpMethod,
  type MetaClientOptions,
  type RequestOptions,
} from "./meta-client.js";

export type AcellereWriteMode = "read-only" | "write";
export type InstagramApiMode = "instagram-login" | "facebook-login";

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
  /**
   * Selects the Meta host required by the Instagram authentication flow.
   * Defaults to INSTAGRAM_API_MODE or "instagram-login" for upstream
   * compatibility. Acellere uses "facebook-login" for broader API coverage.
   */
  instagramApiMode?: InstagramApiMode;
}

export type AcellereMetaClientOptions = MetaClientOptions & AcellereSafetyOptions;

interface MetaClientInternals {
  config: MetaConfig;
  fbBase: string;
  request(
    baseUrl: string,
    token: string,
    method: HttpMethod,
    path: string,
    params?: FormParams,
    options?: RequestOptions
  ): Promise<ClientResponse>;
}

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

function parseInstagramApiMode(explicit?: InstagramApiMode): InstagramApiMode {
  if (explicit) return explicit;
  const raw = (process.env.INSTAGRAM_API_MODE ?? "instagram-login").trim().toLowerCase();
  if (raw === "instagram-login" || raw === "facebook-login") return raw;
  throw new Error(
    `INSTAGRAM_API_MODE must be "instagram-login" or "facebook-login" (got "${raw}").`
  );
}

export function assertAcellereWriteAllowed(
  method: HttpMethod,
  safety: Required<Pick<AcellereSafetyOptions, "writeMode" | "allowDestructive">>
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
 * MetaClient with server-side mutation and Instagram-host policy for Acellere.
 *
 * MCP annotations remain useful to clients for confirmation UX, but they are
 * advisory. This class enforces the write policy before a request can reach
 * Meta and routes Instagram requests to the host required by the selected
 * authentication flow.
 */
export class AcellereMetaClient extends MetaClient {
  private readonly safety: Required<Pick<AcellereSafetyOptions, "writeMode" | "allowDestructive">>;
  private readonly instagramApiMode: InstagramApiMode;

  constructor(config: MetaConfig, options?: AcellereMetaClientOptions) {
    super(config, options);
    this.safety = {
      writeMode: parseWriteMode(options?.writeMode),
      allowDestructive: parseAllowDestructive(options?.allowDestructive),
    };
    this.instagramApiMode = parseInstagramApiMode(options?.instagramApiMode);
  }

  override async ig(
    method: HttpMethod,
    path: string,
    params?: FormParams,
    options?: RequestOptions
  ): Promise<ClientResponse> {
    assertAcellereWriteAllowed(method, this.safety);

    if (this.instagramApiMode === "facebook-login") {
      // MetaClient keeps its request plumbing private. TypeScript `private` is
      // compile-time only here, so this narrow internal adapter lets the fork
      // reuse the same retry, throttling, structured logging and error handling
      // while changing only the base host required by Facebook Login.
      const internals = this as unknown as MetaClientInternals;
      if (!internals.config.instagramAccessToken) {
        throw new Error("INSTAGRAM_ACCESS_TOKEN is not configured.");
      }
      return internals.request.call(
        this,
        internals.fbBase,
        internals.config.instagramAccessToken,
        method,
        path,
        params,
        options
      );
    }

    return super.ig(method, path, params, options);
  }

  override async igExchangeToken(shortToken: string): Promise<ClientResponse> {
    if (this.instagramApiMode === "facebook-login") {
      throw new Error(
        "Instagram token exchange via graph.instagram.com is only available with INSTAGRAM_API_MODE=instagram-login. Use the Facebook Login long-lived user/page token flow instead."
      );
    }
    return super.igExchangeToken(shortToken);
  }

  override async igRefreshToken(longToken: string): Promise<ClientResponse> {
    if (this.instagramApiMode === "facebook-login") {
      throw new Error(
        "Instagram token refresh via graph.instagram.com is only available with INSTAGRAM_API_MODE=instagram-login. Refresh the Facebook Login token through the Facebook token flow instead."
      );
    }
    return super.igRefreshToken(longToken);
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
