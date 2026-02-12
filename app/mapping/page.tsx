"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

type Industry = { slug: string; name: string; url: string };
type Topic = { topic: string; source_url: string | null };
type UseCase = { category: string; sub_use_case: string; source_url: string | null };

type CompanyHit = { id: string; name: string; website_url: string | null; enriched_at: string | null };

export default function MappingPage() {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [industrySlug, setIndustrySlug] = useState<string>("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [loading, setLoading] = useState(false);

  // company mapping state
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyHits, setCompanyHits] = useState<CompanyHit[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [mappingBusy, setMappingBusy] = useState(false);

  async function loadIndustries() {
    setLoading(true);
    try {
      const r = await apiFetch("/api/cisco/usecases/list");
      const j = await r.json();
      setIndustries(j.industries || []);
    } finally {
      setLoading(false);
    }
  }

  async function loadIndustry(slug: string) {
    if (!slug) return;
    setLoading(true);
    try {
      const r = await apiFetch(`/api/cisco/usecases/list?industry_slug=${encodeURIComponent(slug)}`);
      const j = await r.json();
      setTopics(j.priority_topics || []);
      setUseCases(j.use_cases || []);
    } finally {
      setLoading(false);
    }
  }

  async function searchCompany() {
    const q = companyQuery.trim();
    if (!q) return;
    const r = await apiFetch(`/api/companies/dbsearch?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    setCompanyHits(j.results || []);
  }

  async function mapCompany() {
    if (!industrySlug) {
      alert("Select an industry first.");
      return;
    }
    if (!selectedCompanyId) {
      alert("Select a company from search results first.");
      return;
    }
    setMappingBusy(true);
    try {
      const r = await apiFetch("/api/mapping/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selectedCompanyId, industry_slug: industrySlug })
      });
      const j = await r.json();
      if (!r.ok) alert(j?.error || "Mapping failed");
      else setMatchResults(j.matches || []);
    } finally {
      setMappingBusy(false);
    }
  }

  useEffect(() => {
    loadIndustries();
  }, []);

  useEffect(() => {
    if (industrySlug) loadIndustry(industrySlug);
  }, [industrySlug]);

  const grouped = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const uc of useCases) {
      if (!m.has(uc.category)) m.set(uc.category, []);
      m.get(uc.category)!.push(uc.sub_use_case);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [useCases]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Product Mapping</h1>
      <p style={{ color: "#444", marginTop: 6 }}>
        Cisco Portfolio Explorer taxonomy (industries → priority topics → use cases). Use the panel below to map a company’s
        Products/Services text to Cisco use cases (MVP keyword matching).
      </p>

      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
        <label style={{ fontWeight: 600 }}>Industry</label>
        <select
          value={industrySlug}
          onChange={(e) => setIndustrySlug(e.target.value)}
          style={{ padding: 10, minWidth: 360 }}
        >
          <option value="">Select an industry…</option>
          {industries.map((i) => (
            <option key={i.slug} value={i.slug}>
              {i.name}
            </option>
          ))}
        </select>

        {loading ? <span style={{ color: "#666" }}>Loading…</span> : null}
      </div>

      {/* Company mapping panel */}
      <section style={{ marginTop: 16, border: "1px solid #ddd", padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Map a company to use cases</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={companyQuery}
            onChange={(e) => setCompanyQuery(e.target.value)}
            placeholder="Search company in DB (e.g., CoreWeave, Runpod)"
            style={{ flex: 1, padding: 10 }}
          />
          <button onClick={searchCompany} style={{ padding: "10px 14px" }}>
            Find
          </button>
          <button onClick={mapCompany} disabled={mappingBusy} style={{ padding: "10px 14px" }}>
            {mappingBusy ? "Mapping…" : "Map Company"}
          </button>
        </div>

        {companyHits.length ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Select company</div>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              style={{ padding: 10, width: "100%" }}
            >
              <option value="">Select…</option>
              {companyHits.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.enriched_at ? "(enriched)" : "(not enriched)"}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {matchResults.length ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Top matched use cases</div>
            <ol>
              {matchResults.slice(0, 15).map((m: any, idx: number) => (
                <li key={idx}>
                  <b>{m.category}</b> — {m.sub_use_case} <span style={{ color: "#666" }}>(score {m.score})</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      {/* Taxonomy display */}
      {industrySlug ? (
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
          <section style={{ border: "1px solid #eee", padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Priority topics</div>
            {topics.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {topics.map((t, idx) => (
                  <li key={idx} style={{ marginBottom: 6 }}>
                    {t.topic}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ color: "#666" }}>No topics found.</div>
            )}
          </section>

          <section style={{ border: "1px solid #eee", padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Use cases</div>
            {grouped.length ? (
              <div style={{ display: "grid", gap: 12 }}>
                {grouped.map(([cat, subs]) => (
                  <div key={cat}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{cat}</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {subs.map((s, idx) => (
                        <li key={idx} style={{ marginBottom: 4 }}>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#666" }}>No use cases found.</div>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
