import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canViewOrder } from "@/lib/order-access";
import { toStatusDTO } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const num = Number((await params).orderNumber);
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!Number.isInteger(num) || num <= 0 || num > 2_147_483_647) {
    return notFound();
  }

  const order = await db.order.findUnique({
    where: { orderNumber: num },
    select: { id: true, orderNumber: true, userId: true },
  });

  if (!order || !(await canViewOrder(order))) {
    return notFound();
  }

  // Load the current shipment attempt with all delivery events
  const shipment = await db.shipment.findFirst({
    where: { orderId: order.id },
    orderBy: { attempt: "desc" },
    include: { events: true },
  });

  return NextResponse.json(toStatusDTO(order.orderNumber, shipment), {
    headers: { "Cache-Control": "no-store" },
  });
}

