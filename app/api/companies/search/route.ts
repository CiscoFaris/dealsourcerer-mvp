import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import * as fs from "fs";
import * as path from "path";

export const runtime = "nodejs";

type PeerSets = { queries: { keyword: string; peers: string[] }[] };

function readPeerSets(): PeerSets {
  const p = path.join(process.cwd(), "data/peer_sets.json");
  return JSON.parse(fs.readFileSync(p, "utf8")) as PeerSets;
}

async function dbSearch(qRaw: string) {
  const q = `%${qRaw}%`;
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id,name,city,country,website_url,enriched_at,products_services,recent_news,cisco_product_alignment,cisco_gtm_alignment,source,source_id")
    .or(`name.ilike.${q},products_services.ilike.${q},country.ilike.${q}`)
    .limit(50);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") || "").trim();
  const source = (searchParams.get("source") || "gleif").trim(); // gleif | companies_house
  if (!qRaw) return NextResponse.json({ results: [], peers_in_db: [], peers_suggested: [] });

  const qLower = qRaw.toLowerCase();
  const now = new Date().toISOString();

  // Peer expansion from seed lists
  const peerSets = readPeerSets();
  const matchedSets = peerSets.queries.filter(x => qLower.includes(x.keyword));
  const suggestedPeers = Array.from(new Set(matchedSets.flatMap(x => x.peers)));

  // 1) Always return DB matches first (manual + previously sourced + enriched)
  let dbResults: any[] = [];
  try {
    dbResults = await dbSearch(qRaw);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  // 2) Pull from external source and upsert into DB (optional)
  // If external source returns nothing, DB results still populate the UI.
  if (source === "gleif") {
    const url = `https://api.gleif.org/api/v1/lei-records?filter[fulltext]=${encodeURIComponent(qRaw)}&page[size]=20`;
    const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (r.ok) {
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
          country: addr.country || null,
          description_short: "LEI registry record (GLEIF).",
          status: "unknown",
          status_confidence: 0.3,
          last_checked_at: now,
          updated_at: now
        };
      });
      if (rows.length) {
        await supabaseAdmin.from("companies").upsert(rows, { onConflict: "source,source_id" });
        dbResults = await dbSearch(qRaw); // refresh DB results so ids exist
      }
    }
  } else if (source === "companies_house") {
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing COMPANIES_HOUSE_API_KEY" }, { status: 400 });

    const endpoint = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(qRaw)}&items_per_page=20`;
    const auth = Buffer.from(`${apiKey}:`).toString("base64");

    const r = await fetch(endpoint, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      cache: "no-store"
    });
    if (r.ok) {
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
          country: "United Kingdom",
          description_short: it.description || "Companies House record.",
          status: isPlc ? "public" : "private",
          status_confidence: isPlc ? 0.9 : 0.7,
          last_checked_at: now,
          updated_at: now
        };
      });
      if (rows.length) {
        await supabaseAdmin.from("companies").upsert(rows, { onConflict: "source,source_id" });
        dbResults = await dbSearch(qRaw);
      }
    }
  }

  // 3) Peers in DB and suggested peers not in DB
  let peers_in_db: any[] = [];
  if (suggestedPeers.length) {
    const orClause = suggestedPeers.map(n => `name.ilike.%${n.replace(/%/g, "")}%`).join(",");
    const { data } = await supabaseAdmin
      .from("companies")
      .select("id,name,city,country,website_url,enriched_at")
      .or(orClause)
      .limit(50);
    peers_in_db = data ?? [];
  }

  const peers_suggested = suggestedPeers.filter(p =>
    !peers_in_db.some((k: any) => String(k.name || "").toLowerCase().includes(p.toLowerCase()))
  );

  return NextResponse.json({
    results: dbResults,
    peers_in_db,
    peers_suggested
  });
}
