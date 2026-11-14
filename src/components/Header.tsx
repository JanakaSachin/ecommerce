import Link from "next/link";
import { getSession } from "@/lib/session";
import { logout } from "@/app/actions/auth";
import { cartCount } from "@/lib/cart";

const NAV = [
  ["All Watches", "/products"],
  ["Men", "/category/men"],
  ["Women", "/category/women"],
  ["Automatic & Mechanical", "/category/automatic"],
  ["Chronograph", "/category/chronograph"],
  ["Smartwatches", "/category/smartwatches"],
  ["Classic & Dress", "/category/classic"],
];

export default async function Header() {
  const [session, count] = await Promise.all([getSession(), cartCount()]);

  return (
    <header className="sticky top-0 z-40 bg-brand text-white shadow-md">
      {/* Top Announcement Bar - Bluish Green & White */}
      <div className="bg-[#073834] py-1.5 text-center text-xs font-medium text-teal-100 tracking-wide border-b border-[#0B4F4A]/60">
        <span>Cash on delivery · Island-wide insured delivery by SwiftDrop</span>
      </div>

      <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <Link href="/" className="flex items-baseline gap-1 text-2xl font-extrabold tracking-tight text-white">
          <span>
            Stride<span className="text-teal-300">LK</span>
          </span>
          <span className="text-[10px] uppercase font-semibold tracking-widest text-teal-200/90 ml-1.5 px-1.5 py-0.5 rounded bg-white/10">
            Timepieces
          </span>
        </Link>

        <form action="/products" className="hidden max-w-md flex-1 md:flex">
          <input
            name="q"
            placeholder="Search watches, dials, straps..."
            className="w-full rounded-l-md bg-white px-3.5 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            className="rounded-r-md bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-dark"
          >
            Search
          </button>
        </form>

        <nav className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 whitespace-nowrap text-sm">
          <Link href="/track" className="text-white/90 hover:text-white transition">
            Track Order
          </Link>

          {session ? (
            <>
              <Link href="/account/orders" className="text-white/90 hover:text-white transition">
                My Orders
              </Link>
              {session.role === "ADMIN" && (
                <Link
                  href="/admin"
                  className="rounded bg-white/15 px-2.5 py-1 text-xs font-semibold text-teal-200 hover:bg-white/25 transition"
                >
                  Admin
                </Link>
              )}
              <span className="hidden text-teal-100/80 lg:inline">
                Hi, {session.name.split(" ")[0]}
              </span>
              <form action={logout}>
                <button type="submit" className="text-white/90 hover:text-white transition">
                  Logout
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="text-white/90 hover:text-white transition">
              Login
            </Link>
          )}

          <Link
            href="/cart"
            className="flex items-center gap-1.5 rounded-md bg-white/10 px-3.5 py-2 font-medium text-white transition hover:bg-white/20"
          >
            <span>Cart</span>
            {count > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white shadow-sm">
                {count}
              </span>
            )}
          </Link>
        </nav>
      </div>

      {/* Category Subnav */}
      <nav className="bg-brand-dark border-t border-brand/80">
        <div className="mx-auto flex h-10 max-w-7xl items-center gap-6 overflow-x-auto px-4 text-xs font-medium text-white/90">
          {NAV.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="hover:text-teal-300 transition whitespace-nowrap py-1"
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
