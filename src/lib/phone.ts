/**
 * Normalizes Sri Lankan phone numbers:
 * "0711234567", "711234567", "+94 71 123 4567", "94711234567" -> "+94711234567".
 * Returns null if not a valid Sri Lankan 9-digit subscriber number (which starts with [1-9]).
 */
export function normalizeLkPhone(input: string): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  const m = digits.match(/^(?:\+94|0094|94|0)?([1-9]\d{8})$/);
  return m ? `+94${m[1]}` : null;
}
