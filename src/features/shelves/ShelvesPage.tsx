import { navigateTo } from "../../app/navigation";

export function ShelvesPage() {
  return (
    <section className="panel">
      <h2 className="panelTitle">Shelves</h2>
      <p className="muted">Shelves are not wired in this client yet.</p>
      <button type="button" className="button buttonCompact" onClick={() => navigateTo({ kind: "home" })}>
        Back to Home
      </button>
    </section>
  );
}

