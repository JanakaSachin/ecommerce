/**
 * Secure cookies need HTTPS (localhost is the exception).
 * Set COOKIE_SECURE="false" only when demoing over plain http on a LAN IP.
 */
export const secureCookies =
  process.env.COOKIE_SECURE !== undefined
    ? process.env.COOKIE_SECURE === "true"
    : process.env.NODE_ENV === "production";
