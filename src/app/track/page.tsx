import Link from "next/link";
import { getSession } from "@/lib/session";
import TrackForm from "@/components/TrackForm";

export const metadata = { title: "Track Your Order – ChronoLK" };

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ tn?: string }>;
}) {
  const { tn } = await searchParams;
  const session = await getSession();

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-lg bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Track your order</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter your ChronoLK order number or SwiftDrop tracking number, along with the email used at checkout.
        </p>
        <div className="mt-6">
          <TrackForm defaultRef={tn ?? ""} />
        </div>
      </div>
      {session && (
        <p className="mt-4 text-center text-sm text-gray-500">
          Logged in? View all your orders in{" "}
          <Link
            href="/account/orders"
            className="font-semibold text-accent hover:underline"
          >
            My Orders
          </Link>
          .
        </p>
      )}
    </div>
  );
}

