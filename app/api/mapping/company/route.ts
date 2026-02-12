import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function tokenize(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((x) => x.length >= 3)
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const company_id = body?.company_id;
  const industry_slug = (body?.industry_slug || "").trim();

  if (!company_id) return NextResponse.json({ error: "Missing company_id" }, { status: 400 });
  if (!industry_slug) return NextResponse.json({ error: "Missing industry_slug" }, { status: 400 });

  // Pull company
  const c = await supabaseAdmin
    .from("companies")
    .select("id,name,website_url,products_services,recent_news")
    .eq("id", company_id)
    .single();

  if (c.error) return NextResponse.json({ error: c.error.message }, { status: 500 });
  const company = c.data;

  const ps = String(company.products_services || "");
  if (!ps.trim()) return NextResponse.json({ error: "Company has no products_services. Enrich first." }, { status: 400 });

  // Pull Cisco use cases for industry
  const u = await supabaseAdmin
    .from("cisco_use_cases")
    .select("category,sub_use_case,source_url")
    .eq("industry_slug", industry_slug);

  if (u.error) return NextResponse.json({ error: u.error.message }, { status: 500 });
  const useCases = u.data ?? [];

  const companyTokens = tokenize(ps);

  // Score each sub-use-case by token overlap with company tokens
  const scored = useCases
    .map((x) => {
      const ucTokens = tokenize(`${x.category} ${x.sub_use_case}`);
      const score = overlapScore(companyTokens, ucTokens);
      return { ...x, score };
    })
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  const evidence_urls = [
    company.website_url,
    ...(Array.isArray(company.recent_news) ? company.recent_news.slice(0, 5).map((n: any) => n?.url) : [])
  ].filter(Boolean);

  // Clear prior edges for this company in this industry cluster namespace
  await supabaseAdmin
    .from("tech_map_edges")
    .delete()
    .eq("company_id", company_id)
    .like("tech_cluster", `${industry_slug}:%`);

  // Insert edges
  const rows = scored.map((x) => ({
    cisco_catalog_item_id: null,
    company_id,
    tech_cluster: `${industry_slug}:${x.category}:${x.sub_use_case}`,
    evidence_urls,
    notes: `Keyword overlap score=${x.score}`
  }));

  if (rows.length) {
    const ins = await supabaseAdmin.from("tech_map_edges").insert(rows);
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, company: { id: company.id, name: company.name }, matches: scored });
}
