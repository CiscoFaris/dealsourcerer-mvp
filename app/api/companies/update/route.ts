import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function domainFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const patch: any = { updated_at: new Date().toISOString() };

  if (typeof body.website_url === "string" && body.website_url.trim()) {
    const website_url = body.website_url.trim();
    const domain = domainFromUrl(website_url);
    if (!domain) return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });

    // Dedup guard: does this domain already exist on another row?
    const { data: existing, error: findErr } = await supabaseAdmin
      .from("companies")
      .select("id,name,website_url")
      .eq("website_domain_lc", domain.toLowerCase())
      .limit(1)
      .maybeSingle();

    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

    if (existing && existing.id !== body.id) {
      return NextResponse.json(
        {
          error: "duplicate_domain",
          message: `That website domain already exists on another company record.`,
          existing_id: existing.id,
          existing_name: existing.name,
          existing_website_url: existing.website_url
        },
        { status: 409 }
      );
    }

    patch.website_url = website_url;
    patch.website_domain = domain;
  }

  const { error } = await supabaseAdmin.from("companies").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
