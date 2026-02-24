/**
 * WATI phone number targeting and E.164 normalization.
 */

/**
 * Normalize a phone number to E.164 format.
 * Strips common prefixes (wati:, whatsapp:, +) and non-digit characters,
 * then prepends "+".
 */
export function normalizeE164(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/^(wati|whatsapp):/i, "")
    .trim();
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    return `+${digits.slice(1).replace(/\D/g, "")}`;
  }
  if (!digits) {
    return "";
  }
  return `+${digits}`;
}

/**
 * Check if a value looks like a WATI phone target (E.164 phone number).
 */
export function looksLikeWatiTarget(raw: string): boolean {
  const normalized = normalizeE164(raw);
  // E.164: + followed by 7-15 digits
  return /^\+\d{7,15}$/.test(normalized);
}

/**
 * Normalize a WATI target. Returns null if invalid.
 */
export function normalizeWatiTarget(raw: string): string | null {
  const normalized = normalizeE164(raw);
  if (!normalized || !looksLikeWatiTarget(normalized)) {
    return null;
  }
  return normalized;
}

/**
 * Check if a phone number is in the allowlist.
 */
export function isPhoneAllowed(
  phone: string,
  allowFrom: Array<string | number>,
): boolean {
  if (allowFrom.includes("*")) {
    return true;
  }
  const normalizedPhone = normalizeE164(phone);
  if (!normalizedPhone) {
    return false;
  }
  return allowFrom.some((entry) => {
    const entryStr = String(entry).trim();
    if (entryStr === "*") return true;
    const normalizedEntry = normalizeE164(entryStr);
    return normalizedEntry === normalizedPhone;
  });
}
