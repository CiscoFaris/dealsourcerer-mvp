import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") || "").trim();
  const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || "50"), 200));

  if (!qRaw) {
    const { data, error } = await supabaseAdmin
      .from("conferences")
      .select("*")
      .order("start_date", { ascending: true })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ results: data ?? [] });
  }

  const q = `%${qRaw}%`;
  const { data, error } = await supabaseAdmin
    .from("conferences")
    .select("*")
    .or(`name.ilike.${q},description_short.ilike.${q},city.ilike.${q},country.ilike.${q}`)
    .order("start_date", { ascending: true })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data ?? [] });
}
