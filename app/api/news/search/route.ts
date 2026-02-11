import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const days = Math.max(1, Math.min(Number(searchParams.get("days") || "14"), 90));
  if (!q) return NextResponse.json({ results: [] });

  const timespan = `${days}d`;
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=ArtList&format=json&timespan=${timespan}&maxrecords=25&sort=HybridRel`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return NextResponse.json({ error: "GDELT request failed" }, { status: 502 });

  const j = await r.json();
  const articles = Array.isArray(j?.articles) ? j.articles : [];

  const now = new Date().toISOString();
  const rows = articles.map((a: any) => ({
    url: a.url,
    title: a.title || "Untitled",
    publisher: a.domain || a.sourceCountry || null,
    published_at: a.seendate ? new Date(a.seendate).toISOString() : null,
    retrieved_at: now
  }));

  if (rows.length) await supabaseAdmin.from("news_articles").upsert(rows, { onConflict: "url" });
  return NextResponse.json({ results: rows });
}
