"use client";
import { useState } from "react";

type Row = any;

export default function ConferencesPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // create form
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [startDate, setStartDate] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [desc, setDesc] = useState("");

  async function runSearch() {
    setLoading(true);
    try {
      const r = await fetch(`/api/conferences/search?q=${encodeURIComponent(q)}&limit=50`);
      const j = await r.json();
      setRows(j.results || []);
    } finally {
      setLoading(false);
    }
  }

  async function addConference() {
    if (!name.trim()) {
      alert("Name required");
      return;
    }
    const r = await fetch("/api/conferences/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        website_url: website.trim() || null,
        start_date: startDate || null,
        city: city.trim() || null,
        country: country.trim() || null,
        description_short: desc.trim() || null
      })
    });
    const j = await r.json();
    if (!r.ok) {
      alert(j?.error || "Create failed");
      return;
    }
    alert("Conference added");
    setName(""); setWebsite(""); setStartDate(""); setCity(""); setCountry(""); setDesc("");
    await runSearch();
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Conferences</h1>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search conferences" style={{ flex: 1, padding: 10 }} />
        <button onClick={runSearch} disabled={loading} style={{ padding: "10px 14px" }}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      <div style={{ marginTop: 16, border: "1px solid #ddd", padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Add conference (manual)</div>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center" }}>
          <div>Name</div><input value={name} onChange={(e)=>setName(e.target.value)} style={{ padding: 8 }} />
          <div>Website</div><input value={website} onChange={(e)=>setWebsite(e.target.value)} style={{ padding: 8 }} placeholder="https://..." />
          <div>Start date</div><input value={startDate} onChange={(e)=>setStartDate(e.target.value)} style={{ padding: 8 }} placeholder="YYYY-MM-DD" />
          <div>City</div><input value={city} onChange={(e)=>setCity(e.target.value)} style={{ padding: 8 }} />
          <div>Country</div><input value={country} onChange={(e)=>setCountry(e.target.value)} style={{ padding: 8 }} />
          <div>Description</div><input value={desc} onChange={(e)=>setDesc(e.target.value)} style={{ padding: 8 }} />
        </div>
        <div style={{ marginTop: 10 }}>
          <button onClick={addConference} style={{ padding: "10px 14px" }}>Add</button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Results</div>
        {rows.length ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <th align="left" style={{ padding: 8 }}>Name</th>
                <th align="left" style={{ padding: 8 }}>Date</th>
                <th align="left" style={{ padding: 8 }}>Location</th>
                <th align="left" style={{ padding: 8 }}>Website</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>{r.name}</td>
                  <td style={{ padding: 8 }}>{r.start_date || "—"}</td>
                  <td style={{ padding: 8 }}>{[r.city, r.country].filter(Boolean).join(", ") || "—"}</td>
                  <td style={{ padding: 8 }}>{r.website_url ? <a href={r.website_url} target="_blank" rel="noreferrer">{r.website_url}</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: "#666" }}>No results yet.</div>
        )}
      </div>
    </main>
  );
}
