"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getFormText(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function redirectWithMessage(type: "error" | "message", message: string) {
  redirect(`/login?${type}=${encodeURIComponent(message)}`);
}

function assertSupabaseConfigured() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    redirectWithMessage("error", "Supabase 환경변수가 아직 설정되지 않았습니다.");
  }
}

export async function signInAction(formData: FormData) {
  assertSupabaseConfigured();

  const email = getFormText(formData, "email");
  const password = getFormText(formData, "password");

  if (!email || !password) {
    redirectWithMessage("error", "이메일과 비밀번호를 입력해주세요.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirectWithMessage("error", "로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.");
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  redirect("/login");
}
