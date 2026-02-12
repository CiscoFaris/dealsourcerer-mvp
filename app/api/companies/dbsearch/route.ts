import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") || "").trim();
  if (!qRaw) return NextResponse.json({ results: [] });

  const q = `%${qRaw}%`;
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id,name,website_url,enriched_at")
    .or(`name.ilike.${q}`)
    .order("enriched_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data ?? [] });
}
