"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Settings,
} from "lucide-react";
import { signOutAction } from "@/app/(auth)/login/actions";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { useLocalApiStatus } from "@/hooks/use-local-api-status";

const navItems = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/consultations", label: "상담일지", icon: ClipboardList },
  { href: "/recalls", label: "리콜관리", icon: CalendarClock },
  { href: "/reports", label: "KPI 요약 리포트", icon: BarChart3 },
  { href: "/kpi-results", label: "KPI 결과 리포트", icon: BarChart3 },
];

const adminNavItem = { href: "/settings", label: "관리자모드", icon: Settings };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { activeClinic } = useAdminSettings();
  const localApiStatus = useLocalApiStatus();
  const isDenseWorkspace = ["/consultations", "/recalls", "/reports", "/kpi-results", "/settings"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const localApiStatusLabel =
    localApiStatus.state === "connected"
      ? "서버 저장"
      : localApiStatus.state === "unauthorized"
        ? "승인 필요"
        : localApiStatus.state === "fallback"
          ? "로컬 백업"
          : "확인 전";
  const localApiStatusClass =
    localApiStatus.state === "connected"
      ? "border-[#b7edc4] bg-[#f0fff4] text-[#146c2e]"
      : localApiStatus.state === "unauthorized"
        ? "border-[#ffd0d0] bg-[#fff5f5] text-[#ad1f3d]"
        : localApiStatus.state === "fallback"
          ? "border-[#ffe1b8] bg-[#fff7ed] text-[#a85b15]"
          : "border-pebble bg-cloud text-slate";

  return (
    <div className="min-h-screen bg-cloud text-ink">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-72 border-r border-mist bg-snow px-5 py-6 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-monday-violet text-white shadow-[rgba(97,97,255,0.24)_0_12px_26px]">
            <Activity className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block whitespace-nowrap text-sm font-bold text-ink">Dental Consult CRM</span>
            <span className="block truncate text-xs font-medium text-slate">{activeClinic.name}</span>
          </span>
        </Link>

        <nav className="mt-10 space-y-2" aria-label="주요 메뉴">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-3 rounded-full px-4 py-3 text-sm font-bold transition",
                  isActive
                    ? "bg-monday-violet text-white shadow-[rgba(97,97,255,0.28)_0_14px_32px]"
                    : "text-slate hover:bg-periwinkle hover:text-ink",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className={`absolute bottom-36 left-5 right-5 rounded-[18px] border px-4 py-3 ${localApiStatusClass}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold">저장소 상태</span>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">{localApiStatusLabel}</span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs font-bold leading-5">{localApiStatus.message}</p>
          {localApiStatus.baseUrl ? (
            <p className="metric-number mt-1 truncate text-[11px] font-bold opacity-80">
              {localApiStatus.baseUrl}
            </p>
          ) : null}
        </div>

        <form action={signOutAction} className="absolute bottom-20 left-5 right-5">
          <button
            type="submit"
            className="flex w-full cursor-pointer items-center gap-3 rounded-full border border-pebble px-4 py-3 text-sm font-bold text-slate transition hover:border-monday-violet hover:bg-periwinkle hover:text-ink"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            로그아웃
          </button>
        </form>

        <Link
          href={adminNavItem.href}
          className={[
            "absolute bottom-6 left-5 right-5 flex items-center gap-3 rounded-full px-4 py-3 text-sm font-bold transition",
            pathname === adminNavItem.href || pathname.startsWith(`${adminNavItem.href}/`)
              ? "bg-monday-violet text-white shadow-[rgba(97,97,255,0.28)_0_14px_32px]"
              : "border border-pebble text-slate hover:border-monday-violet hover:bg-periwinkle hover:text-ink",
          ].join(" ")}
        >
          <Settings className="h-4 w-4" aria-hidden />
          {adminNavItem.label}
        </Link>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-mist bg-snow/90 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-monday-violet text-white shadow-[rgba(97,97,255,0.2)_0_8px_18px]">
                <Activity className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">Dental Consult CRM</span>
                <span className="block truncate text-xs font-medium text-slate">{activeClinic.name}</span>
              </span>
            </div>

            <nav className="hidden items-center gap-1 lg:flex" aria-label="빠른 이동">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "rounded-full px-4 py-2 text-sm font-bold transition",
                      isActive ? "bg-periwinkle text-ink" : "text-slate hover:bg-cloud hover:text-ink",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="hidden lg:block" aria-hidden />
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {[...navItems, adminNavItem].map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "shrink-0 rounded-full px-4 py-2 text-sm font-bold",
                    isActive ? "bg-monday-violet text-white" : "bg-cloud text-slate",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className={`mt-2 rounded-2xl border px-3 py-2 lg:hidden ${localApiStatusClass}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold">저장소 상태</span>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">{localApiStatusLabel}</span>
            </div>
            <p className="mt-1 text-xs font-bold leading-5">{localApiStatus.message}</p>
          </div>
          <form action={signOutAction} className="mt-2 lg:hidden">
            <button
              type="submit"
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-pebble bg-white px-3 text-xs font-bold text-slate"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              로그아웃
            </button>
          </form>
        </header>

        <main
          className={[
            "mx-auto w-full px-4 py-5 sm:px-5 lg:px-6 lg:py-6",
            isDenseWorkspace ? "max-w-none" : "max-w-[1440px]",
          ].join(" ")}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
