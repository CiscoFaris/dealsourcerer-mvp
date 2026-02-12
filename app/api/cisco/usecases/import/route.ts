import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import * as cheerio from "cheerio";

export const runtime = "nodejs";

const BASE = "https://www.cisco.com";
const START_URL = "https://www.cisco.com/c/m/en_us/solutions/industries/portfolio-explorer.html";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function slugFromUrl(u: string): string {
  const parts = u.split("/").filter(Boolean);
  return parts[parts.length - 1].replace(/\.html$/i, "");
}

function extractTextLines(html: string): string[] {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  $("br").replaceWith("\n");

  const raw = $("body").text() || "";
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parsePriorityTopics(lines: string[]): string[] {
  const out: string[] = [];
  const i = lines.findIndex((x) => x.toLowerCase() === "priority topics");
  if (i === -1) return out;

  for (let k = i + 1; k < Math.min(lines.length, i + 40); k++) {
    const line = lines[k];
    const lower = line.toLowerCase();
    if (lower === "use cases") break;
    if (lower.includes("related to other industries")) break;
    if (line.length >= 3 && line.length <= 80) out.push(line);
  }
  return Array.from(new Set(out));
}

function parseUseCases(lines: string[]): { category: string; sub: string }[] {
  const start = lines.findIndex((x) => x.toLowerCase() === "use cases");
  if (start === -1) return [];

  // We will parse within a window after "Use cases"
  const slice = lines
    .slice(start + 1, Math.min(lines.length, start + 220))
    .map((x) => x.trim())
    .filter(Boolean);

  const stopWords = new Set(["architecture map", "applied filters:", "clear all", "back"]);
  const noise = new Set([
    "close filter and search use cases to find exactly what you’re looking for.",
    "new",
    "filter and search",
    "priority topics",
    "related to other industries",
    "related to government"
  ]);

  // First pass: count repeated lines to infer category headers
  const counts = new Map<string, number>();
  for (const l of slice) {
    const lower = l.toLowerCase();
    if (stopWords.has(lower)) break;
    if (noise.has(lower)) continue;
    counts.set(l, (counts.get(l) || 0) + 1);
  }

  const categories = new Set<string>();
  for (const [k, v] of counts.entries()) {
    if (v >= 2 && k.length <= 80) categories.add(k);
  }

  const pairs: { category: string; sub: string }[] = [];
  let category: string | null = null;

  for (const l of slice) {
    const lower = l.toLowerCase();
    if (stopWords.has(lower)) break;
    if (noise.has(lower)) continue;

    if (categories.has(l)) {
      category = l;
      continue;
    }

    if (category) {
      if (l === category) continue;
      if (categories.has(l)) continue;
      if (l.length > 140) continue;
      pairs.push({ category, sub: l });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return pairs.filter((x) => {
    const k = (x.category + "||" + x.sub).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function POST(req: Request) {
  const adminKey = req.headers.get("x-admin-key") || "";
  if (!process.env.APP_ADMIN_KEY || adminKey !== process.env.APP_ADMIN_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startRes = await fetch(START_URL, { cache: "no-store" });
  if (!startRes.ok) {
    return NextResponse.json({ error: "Failed to fetch Portfolio Explorer landing" }, { status: 502 });
  }

  const startHtml = await startRes.text();
  const $ = cheerio.load(startHtml);

  // Extract industry links
  const industries: { name: string; url: string; slug: string }[] = [];
  $("a").each((_, a) => {
    const text = ($(a).text() || "").trim();
    const href = ($(a).attr("href") || "").trim();
    if (!text || !href) return;
    if (!href.includes("/portfolio-explorer/portfolio-explorer-for-")) return;

    const url = href.startsWith("http") ? href : `${BASE}${href}`;
    industries.push({ name: text, url, slug: slugFromUrl(url) });
  });

  // De-dup industries by slug
  const bySlug = new Map<string, any>();
  for (const ind of industries) bySlug.set(ind.slug, ind);
  const uniqueIndustries = Array.from(bySlug.values());

  // Upsert industries
  const up = await supabaseAdmin.from("cisco_industries").upsert(
    uniqueIndustries.map((x) => ({
      slug: x.slug,
      name: x.name,
      url: x.url,
      updated_at: new Date().toISOString()
    })),
    { onConflict: "slug" }
  );
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

  const slugs = uniqueIndustries.map((x) => x.slug);

  // Clear old for refresh
  const d1 = await supabaseAdmin.from("cisco_priority_topics").delete().in("industry_slug", slugs);
  if (d1.error) return NextResponse.json({ error: d1.error.message }, { status: 500 });

  const d2 = await supabaseAdmin.from("cisco_use_cases").delete().in("industry_slug", slugs);
  if (d2.error) return NextResponse.json({ error: d2.error.message }, { status: 500 });

  let topicsInserted = 0;
  let useCasesInserted = 0;

  for (const ind of uniqueIndustries) {
    await sleep(800);

    const r = await fetch(ind.url, { cache: "no-store" });
    if (!r.ok) continue;
    const html = await r.text();
    const lines = extractTextLines(html);

    const topics = parsePriorityTopics(lines);
    if (topics.length) {
      const ins = await supabaseAdmin.from("cisco_priority_topics").insert(
        topics.map((t) => ({ industry_slug: ind.slug, topic: t, source_url: ind.url }))
      );
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
      topicsInserted += topics.length;
    }

    const pairs = parseUseCases(lines);
    if (pairs.length) {
      const ins2 = await supabaseAdmin.from("cisco_use_cases").insert(
        pairs.map((p) => ({
          industry_slug: ind.slug,
          category: p.category,
          sub_use_case: p.sub,
          source_url: ind.url
        }))
      );
      if (ins2.error) return NextResponse.json({ error: ins2.error.message }, { status: 500 });
      useCasesInserted += pairs.length;
    }
  }

  return NextResponse.json({
    ok: true,
    industries: uniqueIndustries.length,
    priority_topics_inserted: topicsInserted,
    use_cases_inserted: useCasesInserted
  });
}
