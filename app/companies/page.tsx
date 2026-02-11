"use client";
import { useState } from "react";

export default function CompaniesPage() {
  const [q, setQ] = useState("");
  const [source, setSource] = useState<"gleif"|"companies_house">("gleif");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function runSearch() {
    setLoading(true);
    const r = await fetch(`/api/companies/search?q=${encodeURIComponent(q)}&source=${source}`);
    const j = await r.json();
    setRows(j.results || []);
    setLoading(false);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Companies</h1>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <select value={source} onChange={(e)=>setSource(e.target.value as any)} style={{ padding: 10 }}>
          <option value="gleif">Global (GLEIF)</option>
          <option value="companies_house">UK (Companies House)</option>
        </select>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search (e.g., revolut)" style={{ flex: 1, padding: 10 }} />
        <button onClick={runSearch} disabled={!q.trim() || loading} style={{ padding: "10px 14px" }}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>
      <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: "1px solid #ddd" }}>
          <th align="left" style={{ padding: 8 }}>Name</th>
          <th align="left" style={{ padding: 8 }}>Location</th>
          <th align="left" style={{ padding: 8 }}>Description</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{r.name}</td>
              <td style={{ padding: 8 }}>{[r.city, r.region, r.country].filter(Boolean).join(", ") || "—"}</td>
              <td style={{ padding: 8 }}>{r.description_short || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
