import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { retryDueBookings } from "@/lib/swiftdrop/booking";
import { pollOpenShipments } from "@/lib/swiftdrop/poller";
import { safeEqual } from "@/lib/swiftdrop/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!safeEqual(authHeader, `Bearer ${env().CRON_SECRET}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const booking = await retryDueBookings();
  const polling = await pollOpenShipments();

  return NextResponse.json({
    booking,
    polling,
    at: new Date().toISOString(),
  });
}

