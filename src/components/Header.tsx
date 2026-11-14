import Link from "next/link";
import { getSession } from "@/lib/session";
import { logout } from "@/app/actions/auth";
import { cartCount } from "@/lib/cart";

const NAV = [
  ["Men", "men"],
  ["Women", "women"],
  ["Automatic", "automatic"],
  ["Chronograph", "chronograph"],
  ["Smartwatches", "smartwatches"],
  ["Classic", "classic"],
];

export default async function Header() {
  const [session, count] = await Promise.all([getSession(), cartCount()]);

  return (
    <header className="sticky top-0 z-40 bg-brand text-white shadow">
      <div className="bg-accent py-1 text-center text-xs font-medium tracking-wide">
        Cash on delivery · Island-wide insured delivery by SwiftDrop
      </div>

      <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <Link href="/" className="flex items-baseline gap-1 text-2xl font-extrabold tracking-tight">
          <span>Stride<span className="text-accent">LK</span></span>
          <span className="text-[10px] uppercase font-medium tracking-widest text-gray-300">
            Timepieces
          </span>
        </Link>

        <form action="/products" className="hidden max-w-md flex-1 md:flex">
          <input
            name="q"
            placeholder="Search watches, brands, straps..."
            className="w-full rounded-l-md bg-white px-3 py-2 text-sm text-gray-900 outline-none"
          />
          <button className="rounded-r-md bg-accent px-4 text-sm font-semibold hover:bg-accent-dark">
            Search
          </button>
        </form>

        <nav className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 whitespace-nowrap text-sm">
          <Link href="/track" className="hover:text-accent">
            Track Order
          </Link>

          {session ? (
            <>
              <Link href="/account/orders" className="hover:text-accent">
                My Orders
              </Link>
              {session.role === "ADMIN" && (
                <Link
                  href="/admin"
                  className="rounded bg-accent/20 px-2 py-1 text-accent hover:bg-accent/30"
                >
                  Admin
                </Link>
              )}
              <span className="hidden text-gray-300 lg:inline">
                Hi, {session.name.split(" ")[0]}
              </span>
              <form action={logout}>
                <button className="hover:text-accent">Logout</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="hover:text-accent">
              Login
            </Link>
          )}
          <Link
            href="/cart"
            className="rounded-md bg-white/10 px-3 py-2 hover:bg-white/20"
          >
            Cart
            {count > 0 && (
              <span className="ml-1 rounded-full bg-accent px-1.5 text-xs font-bold">
                {count}
              </span>
            )}
          </Link>
        </nav>
      </div>

      <nav className="bg-brand-dark border-t border-brand">
        <div className="mx-auto flex h-10 max-w-7xl items-center gap-6 overflow-x-auto px-4 text-sm">
          <Link href="/products" className="hover:text-accent font-medium">
            All Watches
          </Link>
          {NAV.map(([label, slug]) => (
            <Link
              key={slug}
              href={`/category/${slug}`}
              className="hover:text-accent whitespace-nowrap"
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
