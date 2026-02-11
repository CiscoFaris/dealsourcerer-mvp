import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function suggestSectorFromQuery(q: string): string | null {
  const s = q.toLowerCase();
  if (/(cloud|server|servers|data center|datacenter|gpu|compute|hosting|colo)/.test(s)) return "Information Technology";
  if (/(energy|power|grid|oil|gas|renewable|solar|wind)/.test(s)) return "Energy";
  if (/(bank|insurance|lending|payments|fintech)/.test(s)) return "Financials";
  if (/(health|hospital|pharma|biotech|medtech)/.test(s)) return "Health Care";
  if (/(telecom|fiber|wireless|5g|tower)/.test(s)) return "Communication Services";
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const source = (searchParams.get("source") || "gleif").trim(); // gleif | companies_house
  if (!q) return NextResponse.json({ results: [] });

  const now = new Date().toISOString();
  const gics_sector = suggestSectorFromQuery(q);

  if (source === "gleif") {
    const url = `https://api.gleif.org/api/v1/lei-records?filter[fulltext]=${encodeURIComponent(q)}&page[size]=20`;
    const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: "GLEIF request failed" }, { status: 502 });

    const j = await r.json();
    const data = Array.isArray(j?.data) ? j.data : [];

    const rows = data.map((row: any) => {
      const lei = row?.attributes?.lei;
      const name = row?.attributes?.entity?.legalName?.name || "Unknown";
      const addr = row?.attributes?.entity?.legalAddress || {};
      return {
        source: "gleif",
        source_id: String(lei),
        name,
        city: addr.city || null,
        region: addr.region || null,
        country: addr.country || null,
        description_short: "LEI registry record (GLEIF).",
        gics_sector,
        gics_industry_group: null,
        gics_industry: null,
        gics_sub_industry: null,
        keywords: null,
        status: "unknown",
        status_confidence: 0.3,
        last_checked_at: now,
        updated_at: now
      };
    });

    const { data: upserted, error } = await supabaseAdmin
      .from("companies")
      .upsert(rows, { onConflict: "source,source_id" })
      .select("*");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ results: upserted });
  }

  if (source === "companies_house") {
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing COMPANIES_HOUSE_API_KEY" }, { status: 400 });

    const endpoint = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=20`;
    const auth = Buffer.from(`${apiKey}:`).toString("base64");

    const r = await fetch(endpoint, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      cache: "no-store"
    });
    if (!r.ok) return NextResponse.json({ error: "Companies House request failed" }, { status: 502 });

    const j = await r.json();
    const items = Array.isArray(j?.items) ? j.items : [];

    const rows = items.map((it: any) => {
      const companyType = (it.company_type || "").toLowerCase();
      const isPlc = companyType === "plc";
      return {
        source: "companies_house",
        source_id: String(it.company_number),
        name: it.title || "Unknown",
        city: it.address?.locality || null,
        region: it.address?.region || null,
        country: "United Kingdom",
        description_short: it.description || "Companies House record.",
        gics_sector,
        gics_industry_group: null,
        gics_industry: null,
        gics_sub_industry: null,
        keywords: null,
        status: isPlc ? "public" : "private",
        status_confidence: isPlc ? 0.9 : 0.7,
        last_checked_at: now,
        updated_at: now
      };
    });

    const { data: upserted, error } = await supabaseAdmin
      .from("companies")
      .upsert(rows, { onConflict: "source,source_id" })
      .select("*");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ results: upserted });
  }

  return NextResponse.json({ error: "Invalid source. Use gleif or companies_house." }, { status: 400 });
}
