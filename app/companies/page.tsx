"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

type Row = any;

export default function CompaniesPage() {
  const [q, setQ] = useState("");
  const [source, setSource] = useState<"gleif" | "companies_house">("gleif");
  const [rows, setRows] = useState<Row[]>([]);
  const [peersInDb, setPeersInDb] = useState<Row[]>([]);
  const [peersSuggested, setPeersSuggested] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [manualName, setManualName] = useState("");

  async function addCompany(name: string) {
    const trimmed = (name || "").trim();
    if (!trimmed) return;

    const r = await apiFetch("/api/companies/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, auto_discover: true, auto_enrich: true })
    });
    const j = await r.json();
    if (!r.ok) {
      alert(j?.error || "Add failed");
      return;
    }
    // After adding, search for it in DB
    await runSearch(trimmed);
  }

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    params.set("limit", "500");
    return `/api/companies/export?${params.toString()}`;
  }, [q]);

  async function runSearch(nextQ?: string) {
    const query = (nextQ ?? q).trim();
    if (!query) return;

    setLoading(true);
    try {
      const r = await apiFetch(`/api/companies/search?q=${encodeURIComponent(query)}&source=${source}`);
      const j = await r.json();
      setRows(j.results || []);
      setPeersInDb(j.peers_in_db || []);
      setPeersSuggested(j.peers_suggested || []);
      if (nextQ !== undefined) setQ(nextQ);
    } finally {
      setLoading(false);
    }
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveWebsite(id: string) {
    const row = rows.find(r => r.id === id);
    if (!row?.website_url) {
      alert("Set a website URL first.");
      return;
    }
    setBusyId(id);
    try {
      const r = await apiFetch("/api/companies/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, website_url: row.website_url })
      });
      const j = await r.json();
      if (!r.ok) alert(j?.error || "Save failed");
      else alert("Saved website URL.");
    } finally {
      setBusyId(null);
    }
  }

  async function autofillAndEnrich(id: string) {
    setBusyId(id);
    try {
      const r = await apiFetch("/api/companies/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const j = await r.json();
      if (!r.ok) alert(j?.error || "Autofill failed");
      else {
        // Pull latest by re-searching this company name
        const row = rows.find(x => x.id === id);
        if (row?.name) await runSearch(row.name);
        alert(j.website_autofilled ? "Website found + enriched." : "No website found; enriched if possible.");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function enrich(id: string) {
    setBusyId(id);
    try {
      const r = await apiFetch("/api/companies/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const j = await r.json();
      if (!r.ok) alert(j?.error || "Enrich failed");
      else {
        updateRow(id, {
          products_services: j?.patch?.products_services,
          competitors: j?.patch?.competitors,
          recent_news: j?.patch?.recent_news,
          cisco_product_alignment: j?.patch?.cisco_product_alignment,
          cisco_gtm_alignment: j?.patch?.cisco_gtm_alignment,
          enriched_at: j?.patch?.enriched_at
        });
        alert("Enriched.");
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Companies</h1>

      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <select value={source} onChange={(e) => setSource(e.target.value as any)} style={{ padding: 10 }}>
          <option value="gleif">Global (GLEIF)</option>
          <option value="companies_house">UK (Companies House)</option>
        </select>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search (e.g., Cisco, neocloud, CoreWeave)"
          style={{ flex: 1, padding: 10 }}
        />

        <button onClick={() => runSearch()} disabled={loading || !q.trim()} style={{ padding: "10px 14px" }}>
          {loading ? "Searching…" : "Search"}
        </button>

        <a href={exportUrl} style={{ padding: "10px 14px", border: "1px solid #ccc", textDecoration: "none" }}>
          Export TSV
        </a>
      </div>

      {(peersInDb.length || peersSuggested.length) ? (
        <div style={{ marginTop: 12, border: "1px solid #eee", padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Peers / Competitors</div>

          {peersInDb.length ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Found in your database</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {peersInDb.slice(0, 30).map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => runSearch(p.name)}
                    style={{ padding: "6px 10px", border: "1px solid #ccc", background: "white", cursor: "pointer" }}
                    title="Click to search this company"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {peersSuggested.length ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Suggested peers (not yet in DB)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {peersSuggested.slice(0, 40).map((name) => (
                  <div key={name} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      onClick={() => runSearch(name)}
                      style={{ padding: "6px 10px", border: "1px dashed #666", background: "white", cursor: "pointer" }}
                      title="Search this peer"
                    >
                      {name}
                    </button>
                    <button
                      onClick={() => addCompany(name)}
                      style={{ padding: "6px 10px", border: "1px solid #ccc", background: "white", cursor: "pointer" }}
                      title="Create a placeholder record in your DB"
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                Note: suggested peers are seed list items; they become “Found in your database” once they exist in Supabase.
              </div>
            </div>
          ) : null}
        </div>
      ) : null}


      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          placeholder="Manual add (e.g., Massed Compute, Lambda)"
          style={{ flex: 1, padding: 10 }}
        />
        <button onClick={() => addCompany(manualName)} style={{ padding: "10px 14px" }}>
          Add to DB
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "#444" }}>
        Workflow: Search → set Website URL → Save → Enrich → Export TSV.
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {rows.map((r) => {
          const isBusy = busyId === r.id;
          const newsLinks = Array.isArray(r.recent_news) ? r.recent_news.slice(0, 3) : [];

          return (
            <div key={r.id} style={{ border: "1px solid #ddd", padding: 12 }}>
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                {[r.city, r.region, r.country].filter(Boolean).join(", ") || "—"}
              </div>

              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "160px 1fr 260px", gap: 8, alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "#333" }}>Website URL</div>
                <input
                  value={r.website_url || ""}
                  onChange={(e) => updateRow(r.id, { website_url: e.target.value })}
                  placeholder="https://..."
                  style={{ padding: 8 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => saveWebsite(r.id)} disabled={isBusy} style={{ padding: "8px 10px" }}>
                    Save
                  </button>
                  <button onClick={() => autofillAndEnrich(r.id)} disabled={isBusy} style={{ padding: "8px 10px" }}>
                    AutoFill+Enrich
                  </button>
                  <button onClick={() => enrich(r.id)} disabled={isBusy} style={{ padding: "8px 10px" }}>
                    {isBusy ? "Working…" : "Enrich"}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Products & Services</div>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>
                  {r.products_services || "— (Enrich to generate)"}
                </pre>
              </div>

              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Recent News (links)</div>
                {newsLinks.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {newsLinks.map((n: any, idx: number) => (
                      <li key={idx}>
                        <a href={n.url} target="_blank" rel="noreferrer">{n.title || n.url}</a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: 12 }}>— (Enrich to fetch)</div>
                )}
              </div>

              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Cisco Product Alignment</div>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>
                  {r.cisco_product_alignment || "— (Enrich to generate)"}
                </pre>
              </div>

              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Cisco GTM Alignment</div>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>
                  {r.cisco_gtm_alignment || "— (Enrich to generate)"}
                </pre>
              </div>

              <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
                Enriched at: {r.enriched_at || "—"}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
