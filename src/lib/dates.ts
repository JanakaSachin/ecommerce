const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "10 Nov, 2:20 PM" in Sri Lanka time (UTC+5:30) */
export function formatDateTime(input: Date | string): string {
  const d = new Date(new Date(input).getTime() + 330 * 60_000);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

export function formatDate(input: Date | string): string {
  const d = new Date(new Date(input).getTime() + 330 * 60_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
