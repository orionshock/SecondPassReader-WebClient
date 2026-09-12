export function OfflineRouteUnavailableNotice({
  area,
  onOpenHome,
  onOpenLibrary,
  onOpenOfflineSettings,
}: {
  area: "Reading Sessions" | "Shelves";
  onOpenHome(): void;
  onOpenLibrary(): void;
  onOpenOfflineSettings(): void;
}) {
  return (
    <section className="panel workflowPanel" aria-labelledby="offline-route-title">
      <h2 id="offline-route-title" className="panelTitle">{area} are unavailable offline</h2>
      <p className="muted">
        This area requires a connection to Second Pass Library. Offline reading remains available.
      </p>
      <div className="settingsActions">
        <button type="button" className="button" onClick={onOpenHome}>Home</button>
        <button type="button" className="button buttonPrimary" onClick={onOpenLibrary}>Library</button>
        <button type="button" className="button" onClick={onOpenOfflineSettings}>Open Offline Settings</button>
      </div>
    </section>
  );
}
