"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

export function LoginSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-monday-violet px-5 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-70"
    >
      {pending ? (
        <>
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          로그인 중...
        </>
      ) : (
        <>
          로그인
          <ArrowRight className="h-4 w-4" aria-hidden />
        </>
      )}
    </button>
  );
}
