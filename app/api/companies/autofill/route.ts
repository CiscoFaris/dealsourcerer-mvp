import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

function cleanName(name: string): string {
  return name
    .replace(/\b(inc|inc\.|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|ag|pte|sas|sarl)\b/gi, "")
    .replace(/[^a-z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(name: string): string {
  return cleanName(name).toLowerCase().replace(/\s+/g, "");
}
function slugifyHyphen(name: string): string {
  return cleanName(name).toLowerCase().replace(/\s+/g, "-");
}

async function fetchHtml(url: string, timeoutMs = 6000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "DealSourcererMVP/1.0", "Accept": "text/html,*/*" }
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    const html = await r.text();
    return html.slice(0, 200000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function scoreHomepage(html: string, name: string): number {
  const $ = cheerio.load(html);
  const title = ($("title").text() || "").toLowerCase();
  const h1 = ($("h1").first().text() || "").toLowerCase();
  const tokens = cleanName(name).toLowerCase().split(" ").filter(Boolean).slice(0, 3);

  let score = 0;
  for (const tok of tokens) {
    if (tok.length < 3) continue;
    if (title.includes(tok)) score += 2;
    if (h1.includes(tok)) score += 3;
  }
  return score;
}

async function serpSearchOfficialWebsite(companyName: string): Promise<string | null> {
  const provider = (process.env.WEB_SEARCH_PROVIDER || "").toLowerCase();
  if (provider !== "serpapi") return null;

  const key = process.env.SERPAPI_API_KEY;
  if (!key) return null;

  const q = `${companyName} official website`;
  const url = "https://serpapi.com/search.json?" + new URLSearchParams({
    engine: "google",
    q,
    api_key: key,
    num: "5"
  }).toString();

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;
  const j: any = await r.json();

  const organic = Array.isArray(j?.organic_results) ? j.organic_results : [];
  for (const item of organic) {
    const link = item?.link;
    if (typeof link === "string" && link.startsWith("http")) return link;
  }
  return null;
}

async function guessWebsite(name: string): Promise<{ website_url: string; website_domain: string } | null> {
  const base1 = slugify(name);
  const base2 = slugifyHyphen(name);
  const bases = Array.from(new Set([base1, base2])).filter(Boolean);

  const tlds = [".com", ".ai", ".io", ".net", ".co"];
  const candidates: string[] = [];

  for (const b of bases) {
    for (const tld of tlds) {
      candidates.push(`https://${b}${tld}`);
      candidates.push(`https://www.${b}${tld}`);
    }
  }

  let best: { url: string; score: number } | null = null;
  for (const url of candidates) {
    const html = await fetchHtml(url);
    if (!html) continue;
    const score = scoreHomepage(html, name);
    if (score >= 2 && (!best || score > best.score)) best = { url, score };
    if (best && best.score >= 6) break;
  }

  if (!best) return null;
  const u = new URL(best.url);
  const domain = u.hostname.replace(/^www\./, "");
  return { website_url: best.url, website_domain: domain };
}

async function findByDomain(domain: string) {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id,name,website_url")
    .eq("website_domain_lc", domain.toLowerCase())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: company, error: getErr } = await supabaseAdmin
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (getErr || !company) return NextResponse.json({ error: getErr?.message || "Not found" }, { status: 404 });

  // If already has website, just enrich
  if (company.website_url) {
    const enrichUrl = new URL(req.url);
    enrichUrl.pathname = "/api/companies/enrich";
    const er = await fetch(enrichUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const ej = await er.json();
    return NextResponse.json({ ok: true, website_autofilled: false, enriched: er.ok, enrich: ej });
  }

  const name = String(company.name || "").trim();
  if (!name) return NextResponse.json({ error: "Company has no name" }, { status: 400 });

  // 1) SerpAPI candidate
  let discovered: { website_url: string; website_domain: string } | null = null;
  const candidate = await serpSearchOfficialWebsite(name);
  if (candidate) {
    const html = await fetchHtml(candidate);
    if (html && scoreHomepage(html, name) >= 2) {
      const u = new URL(candidate);
      discovered = { website_url: candidate, website_domain: u.hostname.replace(/^www\./, "") };
    }
  }

  // 2) fallback guess
  if (!discovered) discovered = await guessWebsite(name);
  if (!discovered) return NextResponse.json({ ok: true, website_autofilled: false, message: "No website found" });

  // Dedupe guard: domain already exists elsewhere?
  const existing = await findByDomain(discovered.website_domain);
  if (existing && existing.id !== id) {
    return NextResponse.json(
      { error: "duplicate_domain", existing_id: existing.id, existing_name: existing.name, existing_website_url: existing.website_url },
      { status: 409 }
    );
  }

  // Save website fields
  const patch = {
    website_url: discovered.website_url,
    website_domain: discovered.website_domain,
    updated_at: new Date().toISOString()
  };

  const { error: updErr } = await supabaseAdmin.from("companies").update(patch).eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Enrich automatically
  const enrichUrl = new URL(req.url);
  enrichUrl.pathname = "/api/companies/enrich";
  const er = await fetch(enrichUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });
  const ej = await er.json();

  return NextResponse.json({ ok: true, website_autofilled: true, website_url: discovered.website_url, website_domain: discovered.website_domain, enriched: er.ok, enrich: ej });
}
