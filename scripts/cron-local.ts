// Standalone local runner that hits /api/cron/swiftdrop every minute.
// Usage: npm run cron:local

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
const url = `${baseUrl.replace(/\/+$/, "")}/api/cron/swiftdrop`;

async function tick() {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    console.log(`[cron] ${new Date().toISOString()} HTTP ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.error(`[cron] ${new Date().toISOString()} tick failed:`, (e as Error).message);
  }
}

console.log(`[cron] Starting local runner targeting ${url}...`);
tick();
setInterval(tick, 60_000);
