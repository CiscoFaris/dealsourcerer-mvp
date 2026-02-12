import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const industry_slug = (searchParams.get("industry_slug") || "").trim();

  // Always return industry list
  const inds = await supabaseAdmin
    .from("cisco_industries")
    .select("slug,name,url")
    .order("name", { ascending: true });

  if (inds.error) return NextResponse.json({ error: inds.error.message }, { status: 500 });

  if (!industry_slug) {
    return NextResponse.json({ industries: inds.data ?? [] });
  }

  const topics = await supabaseAdmin
    .from("cisco_priority_topics")
    .select("topic,source_url")
    .eq("industry_slug", industry_slug);

  if (topics.error) return NextResponse.json({ error: topics.error.message }, { status: 500 });

  const usecases = await supabaseAdmin
    .from("cisco_use_cases")
    .select("category,sub_use_case,source_url")
    .eq("industry_slug", industry_slug)
    .order("category", { ascending: true });

  if (usecases.error) return NextResponse.json({ error: usecases.error.message }, { status: 500 });

  return NextResponse.json({
    industries: inds.data ?? [],
    industry_slug,
    priority_topics: topics.data ?? [],
    use_cases: usecases.data ?? []
  });
}
