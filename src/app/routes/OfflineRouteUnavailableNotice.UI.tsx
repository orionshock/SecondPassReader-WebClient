export function OfflineRouteUnavailableNotice({
  area,
  onOpenHome,
  onOpenLibrary,
  onOpenOfflineSettings,
}: {
  area: "Reading sessions" | "Shelves";
  onOpenHome(): void;
  onOpenLibrary(): void;
  onOpenOfflineSettings(): void;
}) {
  return (
    <section className="panel workflowPanel" aria-labelledby="offline-route-title">
      <h2 id="offline-route-title" className="panelTitle">{area} are unavailable offline</h2>
      <p className="muted">
        This area uses current information from your library server. Saved reading and downloaded books remain available.
      </p>
      <div className="settingsActions">
        <button type="button" className="button" onClick={onOpenHome}>Home</button>
        <button type="button" className="button buttonPrimary" onClick={onOpenLibrary}>Offline Library</button>
        <button type="button" className="button" onClick={onOpenOfflineSettings}>Offline settings</button>
      </div>
    </section>
  );
}
