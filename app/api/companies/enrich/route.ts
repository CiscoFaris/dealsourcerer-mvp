import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

type PeerSets = { queries: { keyword: string; peers: string[] }[] };
type CiscoCaps = { capabilities: { group: string; items: string[] }[] };

function readJson<T>(relPath: string): T {
  const p = path.join(process.cwd(), relPath);
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function extractVisibleText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();

  // Preserve structure so words don't mash together
  $("br").replaceWith("\n");
  $("p, li, h1, h2, h3, h4, h5, h6").each((_, el) => {
    const t = $(el).text();
    if (t && t.trim().length) $(el).prepend("\n");
  });

  const raw = $("body").text() || "";
  const text = raw
    .replace(/\r/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.slice(0, 20000);
}


function keywordMatchScore(text: string, keywords: string[]): number {
  const t = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (!kw) continue;
    const k = kw.toLowerCase();
    if (t.includes(k)) score += 1;
  }
  return score;
}

function summarizeProducts(text: string): string {
  const lines = text
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean);

  const offeringCues = /(product|products|solution|solutions|platform|service|services|gpu|compute|inference|training|cloud|security|network|storage|kubernetes|observability)/i;

  // Prefer short lines that look like menu items / offerings
  const picked: string[] = [];
  for (const l of lines) {
    if (l.length < 6 || l.length > 90) continue;
    if (!offeringCues.test(l)) continue;
    if (picked.includes(l)) continue;
    picked.push(l);
    if (picked.length >= 12) break;
  }

  // Fallback: sentence-based
  if (picked.length < 6) {
    const sentences = text.split(/(?<=[.!?])\s+/).slice(0, 250);
    for (const s of sentences) {
      const t = s.trim();
      if (t.length < 40 || t.length > 240) continue;
      if (!offeringCues.test(t)) continue;
      if (picked.includes(t)) continue;
      picked.push(t);
      if (picked.length >= 10) break;
    }
  }

  return picked.length
    ? picked.map((x, i) => `${i + 1}. ${x}`).join("\n")
    : "No clear products/services found from the accessible website text.";
}


function buildCiscoProductAlignment(text: string, cisco: CiscoCaps): string {
  const t = text.toLowerCase();
  const matched: { group: string; item: string }[] = [];
  for (const g of cisco.capabilities) {
    for (const item of g.items) {
      const token = item.toLowerCase();
      const token2 = token.replace(/[^a-z0-9 ]/g, "");
      if (token2 && (t.includes(token2) || t.includes(token))) {
        matched.push({ group: g.group, item });
      }
    }
  }
  const unique = Array.from(new Map(matched.map(m => [`${m.group}:${m.item}`, m])).values());
  if (!unique.length) return "No clear Cisco capability matches found from homepage text. (Needs manual review.)";

  const lines = unique.slice(0, 12).map(m => `- ${m.group}: ${m.item}`);
  return `Potential Cisco capability overlaps (from website text):\n${lines.join("\n")}\n\nJoint-solution hypothesis: bundle the company’s offering with the Cisco capabilities above (integration + co-selling), subject to technical diligence.`;
}

function buildCiscoGtmAlignment(text: string): string {
  const t = text.toLowerCase();
  const signals: string[] = [];
  if (t.includes("enterprise")) signals.push("Enterprise focus (Cisco channel relevant)");
  if (t.includes("partners") || t.includes("channel")) signals.push("Mentions partners/channel (possible co-sell motion)");
  if (t.includes("integrat")) signals.push("Mentions integrations (ecosystem leverage)");
  if (t.includes("managed service") || t.includes("msp")) signals.push("MSP/MSSP motion (Cisco partner ecosystem)");
  if (t.includes("security")) signals.push("Security-led messaging (Cisco Security GTM adjacency)");
  if (t.includes("network")) signals.push("Network adjacency (Cisco Networking GTM adjacency)");
  if (!signals.length) signals.push("Limited GTM signals detected on homepage; requires manual review.");

  return `GTM leverage signals:\n${signals.map(s => `- ${s}`).join("\n")}\n\nGTM hypothesis: if Cisco invested, Cisco’s global partner ecosystem + enterprise account access could accelerate distribution, assuming integration + positioning fit.`;
}

async function fetchHomepage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) return null;
    const html = await r.text();
    return html;
  } catch {
    return null;
  }
}

async function gdeltNews(query: string): Promise<any[]> {
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?` +
    new URLSearchParams({
      query,
      mode: "ArtList",
      format: "json",
      timespan: "365d",
      maxrecords: "10",
      sort: "HybridRel"
    }).toString();

  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  const articles = Array.isArray(j?.articles) ? j.articles : [];
  return articles.map((a: any) => ({
    title: a.title,
    url: a.url,
    domain: a.domain || null,
    seendate: a.seendate || null
  }));
}

async function gdeltNewsBestEffort(companyName: string, brand: string | null): Promise<any[]> {
  const domainQ = ""; // do not use company website domain as a publisher-domain filter
  const nameQ = companyName ? `"${companyName}"` : "";
  const brandQ = brand || "";

  const candidates = [
    domainQ,
    [domainQ, nameQ].filter(Boolean).join(" OR "),
    [nameQ, brandQ].filter(Boolean).join(" OR ")
  ].filter(Boolean);

  for (const q of candidates) {
    const items = await gdeltNews(q);
    if (items.length) return items;
  }
  return [];
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const peerSets = readJson<PeerSets>("data/peer_sets.json");
  const ciscoCaps = readJson<CiscoCaps>("data/cisco_capabilities.json");

  const { data: company, error: getErr } = await supabaseAdmin
    .from("companies")
    .select("*")
    .eq("id", body.id)
    .single();

  if (getErr || !company) return NextResponse.json({ error: getErr?.message || "Company not found" }, { status: 404 });

  const website_url: string | null = company.website_url || null;
  let homepageText = "";
  if (website_url) {
    const html = await fetchHomepage(website_url);
    if (html) homepageText = extractVisibleText(html);
  }

  const products_services = homepageText ? summarizeProducts(homepageText) : "No website text available (set website_url to enrich).";

  // Build suggested peer list from keyword triggers
  const qLower = String(company.name || "").toLowerCase() + " " + String(company.description_short || "").toLowerCase();
  const suggestedPeers = peerSets.queries
    .filter(x => qLower.includes(x.keyword))
    .flatMap(x => x.peers);

  // Find “known in DB” peers by name match against DB
  const peerNames = Array.from(new Set(suggestedPeers)).slice(0, 25);
  let knownPeers: any[] = [];
  if (peerNames.length) {
    // Supabase doesn't do IN + ilike well for many; do OR ilike
    const orClause = peerNames.map(n => `name.ilike.%${n.replace(/%/g, "")}%`).join(",");
    const { data } = await supabaseAdmin.from("companies").select("id,name,website_url,country").or(orClause).limit(25);
    knownPeers = data ?? [];
  }

  const competitors = {
    known_in_db: knownPeers,
    suggested_not_in_db: peerNames.filter(p => !knownPeers.some(k => String(k.name || "").toLowerCase().includes(p.toLowerCase())))
  };

  // Recent news: by domain if available, else by name
    const brand = company.website_domain ? String(company.website_domain).split(".")[0] : "";
  const recent_news = await gdeltNewsBestEffort(String(company.name || ""), brand || null);

  const cisco_product_alignment = homepageText
    ? buildCiscoProductAlignment(homepageText, ciscoCaps)
    : "No website text available to assess Cisco product alignment.";

  const cisco_gtm_alignment = homepageText
    ? buildCiscoGtmAlignment(homepageText)
    : "No website text available to assess Cisco GTM alignment.";

  const patch = {
    products_services,
    competitors,
    recent_news,
    cisco_product_alignment,
    cisco_gtm_alignment,
    enriched_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error: updErr } = await supabaseAdmin.from("companies").update(patch).eq("id", body.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, patch });
}
