import {
  IG_BUSINESS_DISCOVERY_ALLOWED_TOP_LEVEL,
  IG_BUSINESS_DISCOVERY_UNSUPPORTED_FIELDS,
} from "../constants/fields.js";

export interface BusinessDiscoveryFieldValidation {
  valid: boolean;
  unsupportedFields: string[];
  invalidFields: string[];
  message?: string;
}

/**
 * Splits a comma-separated Graph API field selector into top-level tokens,
 * preserving nested blocks such as `media{id,caption,like_count}`.
 */
export function splitTopLevelFields(fieldsStr: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < fieldsStr.length; i++) {
    const char = fieldsStr[i];
    if (char === "{" || char === "(") {
      depth++;
      current += char;
    } else if (char === "}" || char === ")") {
      depth = Math.max(0, depth - 1);
      current += char;
    } else if (char === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed.length > 0) tokens.push(trimmed);
      current = "";
    } else {
      current += char;
    }
  }

  const remainder = current.trim();
  if (remainder.length > 0) tokens.push(remainder);

  return tokens;
}

/**
 * Extracts root field name from expressions like `media{id,caption}`, `media.limit(10)`, etc.
 */
export function extractRootFieldName(fieldToken: string): string {
  const match = fieldToken.match(/^([a-zA-Z0-9_]+)/);
  const name = match && match[1] ? match[1] : fieldToken.trim();
  return name.toLowerCase();
}

/**
 * Validates requested Business Discovery fields against the allowlist and known
 * unsupported third-party fields.
 */
export function validateBusinessDiscoveryFields(fieldsStr: string): BusinessDiscoveryFieldValidation {
  const trimmed = fieldsStr.trim();
  if (!trimmed) {
    return {
      valid: false,
      unsupportedFields: [],
      invalidFields: ["empty_fields"],
      message: "Fields parameter cannot be empty.",
    };
  }

  const tokens = splitTopLevelFields(trimmed);
  const unsupportedFields: string[] = [];
  const invalidFields: string[] = [];

  for (const token of tokens) {
    const rootName = extractRootFieldName(token);

    if (IG_BUSINESS_DISCOVERY_UNSUPPORTED_FIELDS.has(rootName)) {
      unsupportedFields.push(rootName);
    } else if (!IG_BUSINESS_DISCOVERY_ALLOWED_TOP_LEVEL.has(rootName)) {
      invalidFields.push(rootName);
    }

    // Check for nested unsupported expressions like `comments{...}`, `insights{...}`
    for (const unsupported of IG_BUSINESS_DISCOVERY_UNSUPPORTED_FIELDS) {
      if (token.includes(unsupported) && !unsupportedFields.includes(unsupported)) {
        unsupportedFields.push(unsupported);
      }
    }
  }

  if (unsupportedFields.length > 0) {
    const uniqueUnsupported = Array.from(new Set(unsupportedFields));
    return {
      valid: false,
      unsupportedFields: uniqueUnsupported,
      invalidFields,
      message: `Este campo não está disponível para contas de terceiros via Business Discovery: ${uniqueUnsupported.join(", ")}. Contas de terceiros via Business Discovery não suportam métricas privadas ou expansões restritas.`,
    };
  }

  if (invalidFields.length > 0) {
    const uniqueInvalid = Array.from(new Set(invalidFields));
    return {
      valid: false,
      unsupportedFields: [],
      invalidFields: uniqueInvalid,
      message: `Campo(s) inválido(s) ou não reconhecido(s) para Business Discovery: ${uniqueInvalid.join(", ")}. Campos suportados: ${Array.from(IG_BUSINESS_DISCOVERY_ALLOWED_TOP_LEVEL).join(", ")}.`,
    };
  }

  return {
    valid: true,
    unsupportedFields: [],
    invalidFields: [],
  };
}
