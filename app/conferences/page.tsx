"use client";
import { useState } from "react";

export default function ConferencesPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function runSearch() {
    setLoading(true);
    const r = await fetch(`/api/conferences/search?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    setRows(j.results || []);
    setLoading(false);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Conferences</h1>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search (e.g., data center)" style={{ flex: 1, padding: 10 }} />
        <button onClick={runSearch} disabled={!q.trim() || loading} style={{ padding: "10px 14px" }}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>
      <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: "1px solid #ddd" }}>
          <th align="left" style={{ padding: 8 }}>Name</th>
          <th align="left" style={{ padding: 8 }}>Dates</th>
          <th align="left" style={{ padding: 8 }}>Location</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{r.website_url ? <a href={r.website_url} target="_blank" rel="noreferrer">{r.name}</a> : r.name}</td>
              <td style={{ padding: 8 }}>{[r.start_date, r.end_date].filter(Boolean).join(" → ") || "—"}</td>
              <td style={{ padding: 8 }}>{[r.city, r.region, r.country].filter(Boolean).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
