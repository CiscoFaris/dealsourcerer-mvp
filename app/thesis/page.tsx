export default function ThesisPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Opportunity Thesis</h1>
      <p style={{ color: "#444" }}>
        This page will take a company from your database and generate a joint GTM + product alignment thesis,
        anchored to evidence (website, news) and Cisco capability catalog.
      </p>

      <ol>
        <li>Select company from DB</li>
        <li>Generate thesis JSON (server endpoint)</li>
        <li>Render sections (GTM, product, BOM, rollout, pull-through bookings)</li>
      </ol>

      <p><b>Status:</b> Page shell only. Next step is the thesis endpoint + UI selector.</p>
    </main>
  );
}
