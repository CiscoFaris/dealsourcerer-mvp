export default function SourcingPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Sourcing</h1>
      <p style={{ color: "#444" }}>
        One site for Corporate Development sourcing: search/enrich companies, browse conferences, and map companies to Cisco use-cases.
      </p>

      <ul>
        <li><a href="/companies">Companies</a> — search, autofill, enrich, export TSV</li>
        <li><a href="/conferences">Conferences</a> — DB-based for now (manual add/import later)</li>
        <li><a href="/mapping">Product Mapping</a> — Cisco Portfolio Explorer taxonomy + company mapping</li>
        <li><a href="/thesis">Opportunity Thesis</a> — next (investment + alliance + GTM thesis)</li>
      </ul>
    </main>
  );
}
