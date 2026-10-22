"use client";
import Link from "@/components/navigation-link";
import { usePathname } from "next/navigation";

/** The main menu, in order; `active` marks the section the path belongs to. */
export function navSections(path: string) {
  return [
    {
      href: "/discover",
      label: "읽을거리",
      active: path === "/discover" || path.startsWith("/read/"),
    },
    {
      href: "/companies",
      label: "기업 리서치",
      active: path.startsWith("/companies"),
    },
    {
      href: "/jobs",
      label: "채용 공고",
      active: path.startsWith("/jobs") || path === "/csr",
    },
    { href: "/saved", label: "북마크", active: path === "/saved" },
    { href: "/about", label: "제품 소개", active: path === "/about" },
  ];
}

export function SiteNav() {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="메인 메뉴">
      {navSections(path).map((s) => (
        <Link
          key={s.href}
          href={s.href}
          aria-current={
            s.active ? (path === s.href ? "page" : "location") : undefined
          }
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
