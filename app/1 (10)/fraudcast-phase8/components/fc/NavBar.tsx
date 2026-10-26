"use client";
// Apple-style segmented navigation with an active state.

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/cases", label: "Cases" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/evaluation", label: "Evaluation" },
  { href: "/safety", label: "Safety" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/audit", label: "Audit" },
  { href: "/status", label: "Status" },
];

export default function NavBar() {
  const path = usePathname() ?? "/";
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label="Main" className="max-w-full overflow-x-auto">
      <ul className="flex w-max items-center gap-0.5 rounded-full bg-black/[0.05] p-1">
        {NAV.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active(n.href) ? "page" : undefined}
              className={`block whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                active(n.href) ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
