"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/admin", "Dashboard"],
  ["/admin/shipments", "Shipments"],
  ["/admin/webhooks", "Webhook Log"],
  ["/admin/zones", "Delivery Zones & Rates"],
] as const;

export default function AdminTabs() {
  const path = usePathname();

  return (
    <nav className="mt-6 flex flex-wrap gap-1 border-b border-gray-200">
      {TABS.map(([href, label]) => {
        const active = href === "/admin" ? path === "/admin" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
              active
                ? "border-accent text-brand"
                : "border-transparent text-gray-500 hover:text-brand"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

