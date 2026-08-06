import { NextResponse } from "next/server";
import { cloneAdminSettings } from "@/lib/admin-settings";
import {
  readAdminSettingsForSupabaseClient,
  type DynamicSupabaseClient,
} from "@/lib/supabase/admin-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const client = supabase as unknown as DynamicSupabaseClient;
    const { data, error } = await client.auth.getUser();

    if (error || !data.user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const settings = await readAdminSettingsForSupabaseClient(client, cloneAdminSettings());

    if (!settings) {
      return NextResponse.json({ error: "clinic_not_linked" }, { status: 404 });
    }

    return NextResponse.json(
      { userId: data.user.id, settings },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json({ error: "settings_unavailable" }, { status: 500 });
  }
}
