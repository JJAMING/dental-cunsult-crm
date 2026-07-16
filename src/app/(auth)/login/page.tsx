import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { signInAction } from "./actions";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchMessage(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: "error" | "message",
) {
  const value = searchParams?.[key];

  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const errorMessage = getSearchMessage(resolvedSearchParams, "error");
  const noticeMessage = getSearchMessage(resolvedSearchParams, "message");
  const isSupabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return (
    <main className="grid min-h-screen place-items-center bg-cloud px-4 py-10">
      <section className="w-full max-w-md rounded-[32px] border border-mist bg-snow p-8 shadow-card">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[16px] bg-[var(--gradient-prism)]">
            <Sparkles className="h-5 w-5 text-white" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold text-ink">Dental Consult CRM</h1>
            <p className="text-sm text-slate">
              {isSupabaseConfigured ? "관리자가 발급한 계정으로 로그인하세요" : "Supabase 환경변수 설정 전 데모 모드"}
            </p>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-[#ffd0d0] bg-[#fff5f5] px-4 py-3 text-sm font-bold text-[#ad1f3d]">
            {errorMessage}
          </div>
        ) : null}
        {noticeMessage ? (
          <div className="mt-6 rounded-2xl border border-[#b7edc4] bg-[#f0fff4] px-4 py-3 text-sm font-bold text-[#146c2e]">
            {noticeMessage}
          </div>
        ) : null}

        <form className="mt-8 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-bold text-slate">이메일</span>
            <input
              type="email"
              name="email"
              placeholder="admin@example.com"
              autoComplete="email"
              required
              className="h-12 w-full rounded-md border border-pebble px-4 outline-none transition focus:border-monday-violet"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-bold text-slate">비밀번호</span>
            <input
              type="password"
              name="password"
              placeholder="비밀번호"
              autoComplete="current-password"
              required
              className="h-12 w-full rounded-md border border-pebble px-4 outline-none transition focus:border-monday-violet"
            />
          </label>
          <button
            formAction={signInAction}
            className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-monday-violet px-5 text-sm font-bold text-white transition hover:brightness-95"
          >
            로그인
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </form>

        {!isSupabaseConfigured ? (
          <Link
            href="/dashboard"
            className="mt-5 flex h-11 items-center justify-center rounded-full border border-pebble text-sm font-bold text-slate transition hover:border-monday-violet hover:text-monday-violet"
          >
            데모 대시보드 보기
          </Link>
        ) : null}
      </section>
    </main>
  );
}
