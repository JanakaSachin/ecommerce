// Zone Synchronization Script (for Live Mode)
// Usage: npm run zones:sync
import { PrismaClient } from "@prisma/client";
import { DISTRICTS, swiftDropZoneCode } from "../src/lib/districts";

const db = new PrismaClient();
const erp = (process.env.SWIFTDROP_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");

async function main() {
  const email = process.env.SWIFTDROP_MERCHANT_EMAIL;
  const password = process.env.SWIFTDROP_MERCHANT_PASSWORD;

  if (!email || !password) {
    console.error("Error: SWIFTDROP_MERCHANT_EMAIL and SWIFTDROP_MERCHANT_PASSWORD must be set in .env");
    process.exit(1);
  }

  console.log(`[zones:sync] Authenticating as merchant user (${email}) at ${erp}...`);
  const login = await fetch(`${erp}/api/v1/auth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!login.ok) {
    throw new Error(`Merchant login failed: HTTP ${login.status} ${login.statusText}`);
  }

  const { accessToken } = (await login.json()) as { accessToken: string };

  console.log(`[zones:sync] Fetching active delivery zones from ${erp}/api/v1/zones...`);
  const res = await fetch(`${erp}/api/v1/zones`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch zones: HTTP ${res.status} ${res.statusText}`);
  }

  const zones = (await res.json()) as { id: string; code: string; name: string }[];
  console.log(`[zones:sync] Received ${zones.length} zones from SwiftDrop ERP.`);

  const now = new Date();
  for (const z of zones) {
    await db.deliveryZone.upsert({
      where: { id: z.id },
      create: { ...z, active: true, syncedAt: now },
      update: { code: z.code, name: z.name, active: true, syncedAt: now },
    });
  }

  // Deactivate any zones not listed in the latest ERP sync
  const zoneIds = zones.map((z) => z.id);
  const deactivated = await db.deliveryZone.updateMany({
    where: { id: { notIn: zoneIds } },
    data: { active: false },
  });
  if (deactivated.count > 0) {
    console.log(`[zones:sync] Deactivated ${deactivated.count} stale zones.`);
  }

  // Map each district to the zone matching its province code
  const byCode = new Map(zones.map((z) => [z.code, z.id]));
  for (const [district, code] of Object.entries(DISTRICTS)) {
    const zoneId = byCode.get(swiftDropZoneCode(code));
    if (zoneId) {
      await db.districtZone.upsert({
        where: { district },
        create: { district, zoneId },
        update: { zoneId },
      });
    } else {
      console.warn(`[zones:sync] Warning: No zone found with code ${swiftDropZoneCode(code)} for district ${district}`);
    }
  }

  console.log("[zones:sync] Synchronized delivery zones:");
  console.table(zones);
}

main()
  .catch((e) => {
    console.error("[zones:sync] Error:", (e as Error).message);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

