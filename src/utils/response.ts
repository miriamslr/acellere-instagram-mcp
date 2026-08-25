import type { RateLimit } from "../services/meta-client.js";

export interface McpToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface FormatResponseOptions {
  /**
   * Token-management tools intentionally return a newly issued access token.
   * All other tool responses should keep this disabled so unexpected secret
   * fields from Meta never cross the MCP boundary.
   */
  allowSensitiveFields?: boolean;
}

const SENSITIVE_FIELD_NAMES = new Set([
  "access_token",
  "appsecret_proof",
  "client_secret",
  "app_secret",
]);

function isSensitiveFieldName(name: string): boolean {
  return SENSITIVE_FIELD_NAMES.has(name.toLowerCase());
}

function sanitizeUrlString(value: string): string {
  // Avoid normalizing every URL/string. Only touch values that may contain a
  // sensitive query parameter.
  if (!/(?:[?&])(?:access_token|appsecret_proof|client_secret|app_secret)=/i.test(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    const keysToDelete = [...url.searchParams.keys()].filter(isSensitiveFieldName);
    for (const key of keysToDelete) url.searchParams.delete(key);
    return url.toString();
  } catch {
    // Defensive fallback for malformed URL-like strings. Redact rather than
    // echoing the credential if URL parsing is not possible.
    return value.replace(
      /([?&])((?:access_token|appsecret_proof|client_secret|app_secret))=[^&#\s]*/gi,
      "$1$2=[REDACTED]"
    );
  }
}

export function sanitizeResponseData(
  value: unknown,
  options: FormatResponseOptions = {}
): unknown {
  if (typeof value === "string") return sanitizeUrlString(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeResponseData(item, options));
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveFieldName(key) && !options.allowSensitiveFields) continue;
      sanitized[key] = sanitizeResponseData(child, options);
    }
    return sanitized;
  }

  return value;
}

export function formatResponse(
  data: Record<string, unknown>,
  rateLimit?: RateLimit,
  options: FormatResponseOptions = {}
): McpToolResult {
  const sanitizedData = sanitizeResponseData(data, options) as Record<string, unknown>;
  const payload = rateLimit === undefined
    ? sanitizedData
    : { ...sanitizedData, _rateLimit: rateLimit };

  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}
