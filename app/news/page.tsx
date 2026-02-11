"use client";
import { useState } from "react";

export default function NewsPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function runSearch() {
    setLoading(true);
    const r = await fetch(`/api/news/search?q=${encodeURIComponent(q)}&days=14`);
    const j = await r.json();
    setRows(j.results || []);
    setLoading(false);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>News</h1>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search (company or keyword)" style={{ flex: 1, padding: 10 }} />
        <button onClick={runSearch} disabled={!q.trim() || loading} style={{ padding: "10px 14px" }}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>
      <ul style={{ marginTop: 16, paddingLeft: 18 }}>
        {rows.map((r: any) => (
          <li key={r.url} style={{ marginBottom: 10 }}>
            <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
            <div style={{ fontSize: 12, color: "#444" }}>
              {r.publisher || "—"} {r.published_at ? `| ${new Date(r.published_at).toLocaleString()}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
