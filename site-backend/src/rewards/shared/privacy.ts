const sensitiveMetadataKey = /(?:curp|nss|password|credential|secret|token|authorization|email|phone|address|raw[_-]?payload|original[_-]?payload|sisca[_-]?payload)/i;
const curpValue = /\b[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]\b/i;
const emailValue = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const credentialValue = /\b(?:bearer\s+\S+|(?:password|token|secret|credential|authorization)\s*[:=]\s*\S+)/i;
const rawSiscaValue = /["'](?:found|tipo_movimiento|estatus_sf|fecha_traspaso)["']\s*:/i;

export function assertSafeMetadata(value: unknown, path = "metadata"): void {
  if (typeof value === "string") {
    assertSafeText(path, value, 2_000);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeMetadata(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    // This is a business-policy flag, not an authorization header or secret.
    if (key === "requiresAuthorization" && typeof nested === "boolean") {
      continue;
    }
    if (sensitiveMetadataKey.test(key)) {
      throw new Error(`Sensitive metadata is not allowed at ${path}.${key}`);
    }
    assertSafeMetadata(nested, `${path}.${key}`);
  }
}

export function assertSafeText(label: string, value: string, maximumLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} cannot be empty`);
  if (normalized.length > maximumLength) {
    throw new Error(`${label} cannot exceed ${maximumLength} characters`);
  }
  if (curpValue.test(normalized)
    || emailValue.test(normalized)
    || credentialValue.test(normalized)
    || rawSiscaValue.test(normalized)) {
    throw new Error(`${label} contains customer-sensitive or credential-sensitive data`);
  }
  return normalized;
}
