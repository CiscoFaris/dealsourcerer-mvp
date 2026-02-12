import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";
import * as cheerio from "cheerio";

export const runtime = "nodejs";


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
    if (typeof link === "string" && link.startsWith("http")) {
      return link;
    }
  }
  return null;
}



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
    if (score >= 2) {
      if (!best || score > best.score) best = { url, score };
    }
    if (best && best.score >= 6) break; // high confidence
  }

  if (!best) return null;
  const u = new URL(best.url);
  const domain = u.hostname.replace(/^www\./, "");
  return { website_url: best.url, website_domain: domain };
}

async function findByDomain(domain: string) {
  const domainLc = domain.toLowerCase();
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("*")
    .eq("website_domain_lc", domainLc)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function findByExactName(name: string) {
  const nameLc = name.toLowerCase();
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("*")
    .ilike("name", nameLc) // ilike exact lower-case will still match exact
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = (body?.name || "").trim();
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const auto_discover = body?.auto_discover !== false; // default true
  const auto_enrich = body?.auto_enrich === true;      // default false unless set

  // 1) Try website discovery first so we can dedupe BEFORE inserting
  let discovered: { website_url: string; website_domain: string } | null = null;
  if (auto_discover) {
    // Try real web search first (SerpAPI)
    const candidate = await serpSearchOfficialWebsite(name);
    if (candidate) {
      const html = await fetchHtml(candidate);
      if (html) {
        const score = scoreHomepage(html, name);
        if (score >= 2) {
          const u = new URL(candidate);
          const domain = u.hostname.replace(/^www\./, "");
          discovered = { website_url: candidate, website_domain: domain };
        }
      }
    }

    // Fallback to guess+validate
    if (!discovered) {
      discovered = await guessWebsite(name);
    }
    if (discovered?.website_domain) {
      const existing = await findByDomain(discovered.website_domain);
      if (existing) {
        // Optional: enrich existing if requested
        if (auto_enrich) {
          const enrichUrl = new URL(req.url);
          enrichUrl.pathname = "/api/companies/enrich";
          await fetch(enrichUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: existing.id })
          });
        }
        return NextResponse.json({ ok: true, deduped: true, company: existing });
      }
    }
  }

  // 2) If no website found, prevent obvious duplicates by exact name (manual duplicates)
  if (!discovered) {
    const existingByName = await findByExactName(name);
    if (existingByName) {
      return NextResponse.json({ ok: true, deduped: true, company: existingByName });
    }
  }

  // 3) Insert new record (with website if discovered)
  const now = new Date().toISOString();
  const row: any = {
    source: "manual",
    source_id: crypto.randomUUID(),
    name,
    country: body?.country ?? null,
    city: body?.city ?? null,
    description_short: body?.description_short ?? null,
    status: "unknown",
    status_confidence: 0.0,
    last_checked_at: now,
    updated_at: now
  };

  if (discovered) {
    row.website_url = discovered.website_url;
    row.website_domain = discovered.website_domain;
  }

  const { data: created, error: insErr } = await supabaseAdmin
    .from("companies")
    .insert(row)
    .select("*")
    .single();

  if (insErr) {
    // If unique index blocks us, return existing by domain if we have it
    if (discovered?.website_domain) {
      const existing = await findByDomain(discovered.website_domain);
      if (existing) return NextResponse.json({ ok: true, deduped: true, company: existing });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // 4) Auto-enrich new record if requested
  if (auto_enrich) {
    const enrichUrl = new URL(req.url);
    enrichUrl.pathname = "/api/companies/enrich";
    await fetch(enrichUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: created.id })
    });
  }

  return NextResponse.json({ ok: true, deduped: false, company: created });
}
