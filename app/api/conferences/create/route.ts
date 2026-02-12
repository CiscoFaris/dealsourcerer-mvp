import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const name = (body?.name || "").trim();
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const row: any = {
    source: "manual",
    source_id: crypto.randomUUID(),
    name,
    start_date: body?.start_date || null,
    end_date: body?.end_date || null,
    city: body?.city || null,
    region: body?.region || null,
    country: body?.country || null,
    description_short: body?.description_short || null,
    website_url: body?.website_url || null,
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin
    .from("conferences")
    .insert(row)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, conference: data });
}
