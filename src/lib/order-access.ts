import { cookies } from "next/headers";
import { getSession } from "./session";
import { secureCookies } from "./cookie-options";

const ACCESS_COOKIE = "sl_order_access";

async function accessIds(): Promise<string[]> {
  return ((await cookies()).get(ACCESS_COOKIE)?.value ?? "").split(",").filter(Boolean);
}

/** Server Actions only (sets a cookie). Remembers up to 10 orders for this browser. */
export async function grantOrderAccess(orderId: string): Promise<void> {
  const ids = [orderId, ...(await accessIds()).filter((id) => id !== orderId)].slice(0, 10);
  (await cookies()).set(ACCESS_COOKIE, ids.join(","), {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function canViewOrder(order: { id: string; userId: string | null }): Promise<boolean> {
  const session = await getSession();
  if (session?.role === "ADMIN") return true;
  if (session && order.userId === session.userId) return true;
  return (await accessIds()).includes(order.id);
}

