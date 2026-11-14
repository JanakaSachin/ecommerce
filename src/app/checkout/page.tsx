import Link from "next/link";
import { redirect } from "next/navigation";
import { getCart, summarizeCart } from "@/lib/cart";
import { getSession } from "@/lib/session";
import CheckoutForm from "@/components/CheckoutForm";

export const metadata = { title: "Checkout – StrideLK" };

export default async function CheckoutPage() {
  const { items, subtotal, hasStockIssue } = summarizeCart(await getCart());
  if (items.length === 0 || hasStockIssue) redirect("/cart");

  const session = await getSession();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
      {!session && (
        <p className="mt-1 text-sm text-gray-500">
          Checking out as guest ·{" "}
          <Link
            href="/login?next=/checkout"
            className="font-medium text-accent hover:underline"
          >
            Log in
          </Link>{" "}
          to link this order to your account
        </p>
      )}
      <CheckoutForm
        items={items.map((i) => ({
          id: i.id,
          name: i.variant.product.name,
          sizeUk: i.variant.name,
          quantity: i.quantity,
          lineTotal: i.variant.price * i.quantity,
        }))}
        subtotal={subtotal}
        pickupDistrict={process.env.STORE_PICKUP_DISTRICT ?? "Colombo"}
        defaults={{
          customerName: session?.name,
          email: session?.email,
        }}
      />
    </div>
  );
}

