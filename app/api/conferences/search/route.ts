import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ results: [] });

  const token = process.env.EVENTBRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "EVENTBRITE_TOKEN is empty inside Next.js" }, { status: 500 });
  }

  const endpoint = `https://www.eventbriteapi.com/v3/events/search/?q=${encodeURIComponent(q)}&sort_by=date&expand=venue`;
  const r = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store"
  });

  if (!r.ok) {
    const body = await r.text();
    return NextResponse.json(
      {
        error: "Eventbrite request failed",
        upstream_status: r.status,
        upstream_body_first_500: body.slice(0, 500)
      },
      { status: 502 }
    );
  }

  const j = await r.json();
  const events = Array.isArray(j?.events) ? j.events : [];

  const now = new Date().toISOString();
  const rows = events.slice(0, 20).map((ev: any) => ({
    source: "eventbrite",
    source_id: String(ev.id),
    name: ev.name?.text || "Unknown",
    start_date: ev.start?.local ? ev.start.local.slice(0, 10) : null,
    end_date: ev.end?.local ? ev.end.local.slice(0, 10) : null,
    city: ev.venue?.address?.city || null,
    region: ev.venue?.address?.region || null,
    country: ev.venue?.address?.country || null,
    description_short: (ev.summary || ev.description?.text || "Eventbrite event").slice(0, 220),
    website_url: ev.url || null,
    last_checked_at: now,
    updated_at: now
  }));

  const { data: upserted, error } = await supabaseAdmin
    .from("conferences")
    .upsert(rows, { onConflict: "source,source_id" })
    .select("*");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: upserted });
}
