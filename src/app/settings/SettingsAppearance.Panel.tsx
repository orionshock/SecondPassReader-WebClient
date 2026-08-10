import type { AppTheme } from "../../storage/appTheme";

export function SettingsAppearancePanel({
  appTheme,
  onAppThemeChange,
}: {
  appTheme: AppTheme;
  onAppThemeChange: (theme: AppTheme) => void;
}) {
  return (
    <section className="panel settingsCard" role="tabpanel" aria-label="Appearance settings">
      <div className="settingsSectionHeader">
        <h2 className="panelTitle">Appearance</h2>
      </div>
      <div className="settingsRow">
        <div>
          <div className="settingsLabel">Theme</div>
        </div>
        <div className="segmentedControl" role="radiogroup" aria-label="Theme">
          {(["system", "light", "dark"] as AppTheme[]).map((theme) => (
            <button
              key={theme}
              type="button"
              className={`segmentedButton${appTheme === theme ? " segmentedButtonActive" : ""}`}
              role="radio"
              aria-checked={appTheme === theme}
              onClick={() => onAppThemeChange(theme)}
            >
              {theme[0].toUpperCase() + theme.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
