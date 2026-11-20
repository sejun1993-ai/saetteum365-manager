"use client";

// Design Ref: §2.1 — 모든 화면 위에 같은 상단 메뉴(가격표 · 매출 · 시즌)를 보여 준다.
// Plan SC: 작업 1번 (앱 기본 틀과 메뉴)

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const MENUS = [
  { href: "/tags", label: "가격표" },
  { href: "/sales", label: "매출" },
  { href: "/season", label: "시즌" },
];

export default function NavBar() {
  // 지금 보고 있는 화면의 메뉴를 강조하기 위해 주소를 읽는다
  const pathname = usePathname();
  const router = useRouter();

  // 로그인 화면에는 메뉴를 보여 주지 않는다 (Design §2.1)
  if (pathname === "/login") return null;

  // 로그아웃: 쿠키를 지우고 로그인 화면으로 이동한다
  async function logout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh(); // 로그인 상태로 받아 둔 화면 정보를 비운다
    }
  }

  return (
    // 인쇄할 때는 메뉴를 숨긴다 (no-print는 globals.css에 정의됨)
    <header className="no-print border-b border-neutral-200 bg-white">
      <nav className="mx-auto flex w-full max-w-5xl items-center gap-6 px-6 py-3">
        <Link href="/" className="font-bold text-emerald-700">
          새뜸365 매니저
        </Link>
        <ul className="flex gap-2">
          {MENUS.map((menu) => {
            const active = pathname.startsWith(menu.href);
            return (
              <li key={menu.href}>
                <Link
                  href={menu.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
                      : "rounded px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
                  }
                >
                  {menu.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={logout}
          className="ml-auto rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
        >
          로그아웃
        </button>
      </nav>
    </header>
  );
}
