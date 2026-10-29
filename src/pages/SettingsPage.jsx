import { useEffect, useState } from "react";
import { AlertTriangle, LoaderCircle, LogOut, RotateCcw, Save, Settings2 } from "lucide-react";
import { AppShell } from "@/components/appraisal/AppShell";
import { Button } from "@/components/ui/button";
import { useSettings, DEFAULT_SETTINGS } from "@/lib/settings-store";
import { useCatalystSignOut } from "@/lib/catalyst-auth";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

export function SettingsPage() {
  const { settings, saveSettings, resetSettings } = useSettings();
  const signOut = useCatalystSignOut();
  const [draft, setDraft] = useState(settings);
  const [directorFixLoading, setDirectorFixLoading] = useState(false);
  const [directorFixResult, setDirectorFixResult] = useState("");
  useEffect(() => setDraft(settings), [settings]);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = () => saveSettings(draft);
  const reset = () => { resetSettings(); setDraft(DEFAULT_SETTINGS); };
  const runTemporaryDirectorFix = async () => {
    const confirmed = window.confirm(
      "Temporary one-time data update: copy Employee_Master.appraiser_tech_ed into Employee_Master.director for all rows with a source value. Continue?"
    );
    if (!confirmed) return;

    setDirectorFixLoading(true);
    setDirectorFixResult("");
    try {
      const response = await catalystFetch(
        `${catalystFunctionUrl("employeesapi")}temporary-fill-director`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: "COPY_APPRAISER_TECH_ED_TO_DIRECTOR" }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || `Request failed (${response.status})`);
      }
      setDirectorFixResult(
        `Completed. Updated: ${result.updated}; already same: ${result.skippedAlreadySame}; empty source skipped: ${result.skippedEmptySource}; total rows: ${result.totalRows}.`
      );
    } catch (error) {
      setDirectorFixResult(error?.message || "Temporary update failed.");
    } finally {
      setDirectorFixLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Settings2 className="size-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Settings & Configuration</h2>
              <p className="text-xs text-muted-foreground">Change the navigation layout.</p>
            </div>
          </div>
        </div>
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Navigation</h3>
          <p className="mt-1 text-xs text-muted-foreground">Select where the main project navigation should appear.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              ["top", "Top Header", "Current default layout with the project heading and menu across the top."],
              ["left", "Left / Vertical", "Places the project heading and navigation in a vertical sidebar."],
            ].map(([id, label, description]) => (
              <button key={id} type="button" onClick={() => update("menuPosition", id)}
                className={"rounded-lg border p-4 text-left transition " + (draft.menuPosition === id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50")}>
                <p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p>
              </button>
            ))}
          </div>
          {draft.menuPosition === "left" && (
            <p className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              The vertical sidebar starts collapsed to preserve screen space. Hover over it to reveal labels, or use the pin control to keep it permanently expanded.
            </p>
          )}
        </section>
        <section className="rounded-lg border border-amber-300 bg-amber-50/50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">Temporary Director Data Fix</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                One-time action: copy Appraiser Tech-Ed into Director in Employee Master. HR access is required.
                This temporary control and its backend endpoint must be removed after the update is confirmed.
              </p>
              <Button
                type="button"
                onClick={runTemporaryDirectorFix}
                disabled={directorFixLoading}
                className="mt-3 gap-2"
                variant="destructive"
              >
                {directorFixLoading ? <LoaderCircle className="size-3.5 animate-spin" /> : <AlertTriangle className="size-3.5" />}
                {directorFixLoading ? "Updating Employee Master..." : "Copy Appraiser Tech-Ed to Director"}
              </Button>
              {directorFixResult && (
                <p role="status" className="mt-3 break-words text-xs font-medium text-foreground">
                  {directorFixResult}
                </p>
              )}
            </div>
          </div>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"><RotateCcw className="size-3.5" />Reset to Default</button>
          <button type="button" onClick={signOut} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"><LogOut className="size-3.5" />Sign Out</button>
          <Button type="button" onClick={save} className="gap-2"><Save className="size-3.5" />Save Changes</Button>
        </div>
      </div>
    </AppShell>
  );
}