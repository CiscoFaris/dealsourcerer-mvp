import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function tsvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  // Replace tabs/newlines to keep TSV valid
  return s.replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
}

function newsLinks(recent_news: any): string {
  if (!Array.isArray(recent_news)) return "";
  return recent_news
    .slice(0, 5)
    .map((x: any) => x?.url)
    .filter(Boolean)
    .join(" | ");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") || "").trim();
  const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || "200"), 2000));

  let query = supabaseAdmin.from("companies").select(
    "id,name,country,city,website_url,products_services,competitors,recent_news,cisco_product_alignment,cisco_gtm_alignment,enriched_at"
  );

  if (qRaw) {
    const q = `%${qRaw}%`;
    query = query.or(`name.ilike.${q},products_services.ilike.${q},country.ilike.${q}`);
  } else {
    // Default: export the most recently enriched companies first
    query = query.order("enriched_at", { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query.limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = [
    "LegalName",
    "City",
    "Country",
    "Website",
    "ProductsServices",
    "RecentNewsLinks",
    "CompetitorsKnownInDB",
    "CompetitorsSuggested",
    "CiscoProductAlignment",
    "CiscoGTMAlignment",
    "EnrichedAt"
  ].join("\t");

  const lines = (data ?? []).map((r: any) => {
    const known = r?.competitors?.known_in_db ?? [];
    const suggested = r?.competitors?.suggested_not_in_db ?? [];

    return [
      tsvEscape(r.name),
      tsvEscape(r.city),
      tsvEscape(r.country),
      tsvEscape(r.website_url),
      tsvEscape(r.products_services),
      tsvEscape(newsLinks(r.recent_news)),
      tsvEscape(known),
      tsvEscape(suggested),
      tsvEscape(r.cisco_product_alignment),
      tsvEscape(r.cisco_gtm_alignment),
      tsvEscape(r.enriched_at)
    ].join("\t");
  });

  const body = [header, ...lines].join("\n");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/tab-separated-values; charset=utf-8",
      "Content-Disposition": `attachment; filename="companies_export.tsv"`
    }
  });
}
