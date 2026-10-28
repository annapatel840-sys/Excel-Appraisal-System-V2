import { useEffect, useState } from "react";
import { LogOut, RotateCcw, Save, Settings2 } from "lucide-react";
import { AppShell } from "@/components/appraisal/AppShell";
import { Button } from "@/components/ui/button";
import { useSettings, DEFAULT_SETTINGS } from "@/lib/settings-store";
import { useCatalystSignOut } from "@/lib/catalyst-auth";
import { useAccess } from "@/lib/access-store";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";

export function SettingsPage() {
  const { settings, saveSettings, resetSettings } = useSettings();
  const signOut = useCatalystSignOut();
  const access = useAccess();
  const [migrationPreview, setMigrationPreview] = useState(null);
  const [migrationResult, setMigrationResult] = useState(null);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationError, setMigrationError] = useState("");
  const canRunPayrollMigration = access.canScreen("payroll", "edit");

  const previewPayrollMigration = async () => {
    setMigrationBusy(true);
    setMigrationError("");
    setMigrationResult(null);
    try {
      const result = await payrollCycleRequest("migrate-payroll-double-columns", {
        method: "POST",
        body: { dryRun: true },
      });
      setMigrationPreview(result);
    } catch (error) {
      setMigrationError(error?.message || "Could not preview the payroll migration. Confirm the updated API is deployed and your account has Payroll edit access.");
    } finally {
      setMigrationBusy(false);
    }
  };

  const confirmPayrollMigration = async () => {
    if (!migrationPreview || migrationPreview.invalidValues?.length) return;
    const approved = window.confirm("Copy the legacy BIGINT values into empty DOUBLE fields in Payroll_Data now? Existing destination values will be preserved.");
    if (!approved) return;
    setMigrationBusy(true);
    setMigrationError("");
    setMigrationResult(null);
    try {
      const result = await payrollCycleRequest("migrate-payroll-double-columns", {
        method: "POST",
        body: { confirm: "COPY_BIGINT_TO_DOUBLE" },
      });
      setMigrationResult(result);
      setMigrationPreview(null);
    } catch (error) {
      setMigrationError(error?.message || "The payroll migration failed. No success is assumed; review the API response before retrying.");
    } finally {
      setMigrationBusy(false);
    }
  };
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = () => saveSettings(draft);
  const reset = () => { resetSettings(); setDraft(DEFAULT_SETTINGS); };

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
        {canRunPayrollMigration && (
          <section className="rounded-lg border border-amber-300 bg-card p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Temporary Payroll Data Migration</h3>
              <p className="mt-1 text-xs text-muted-foreground">One-time tool. It copies legacy BIGINT values into empty replacement DOUBLE fields only; populated destination values are preserved. Do not delete the legacy columns until the copied values are verified.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={previewPayrollMigration} disabled={migrationBusy}>
                {migrationBusy ? "Working…" : "Preview Migration"}
              </Button>
              {migrationPreview && (
                <Button type="button" onClick={confirmPayrollMigration} disabled={migrationBusy || Boolean(migrationPreview.invalidValues?.length)}>
                  Confirm and Copy Data
                </Button>
              )}
            </div>
            {migrationError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{migrationError}</p>}
            {migrationPreview && (
              <div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
                <p><strong>Preview only — no data changed.</strong> Rows scanned: {migrationPreview.rowsScanned}; rows with values to copy: {migrationPreview.rowsWithChanges}.</p>
                <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="py-1 pr-3">Destination field</th><th className="py-1 pr-3">Source field</th><th className="py-1 pr-3">Values to copy</th><th className="py-1">Already populated</th></tr></thead><tbody>{Object.entries(migrationPreview.fields || {}).map(([name, stats]) => <tr key={name} className="border-t border-border"><td className="py-1 pr-3">{name}</td><td className="py-1 pr-3">{stats.source}</td><td className="py-1 pr-3">{stats.copied}</td><td className="py-1">{stats.destinationAlreadyPopulated}</td></tr>)}</tbody></table></div>
                {migrationPreview.invalidValues?.length > 0 && <p className="text-red-700">Unsafe source values were found. Copy is disabled; no changes were made.</p>}
              </div>
            )}
            {migrationResult && (
              <div role="status" className="rounded-md border border-green-300 p-3 text-sm">
                <p className="font-semibold">Migration API reported success.</p>
                <p>Rows scanned: {migrationResult.rowsScanned}; rows updated: {migrationResult.rowsUpdated}; rows with changes: {migrationResult.rowsWithChanges}.</p>
                <p className="mt-1 text-xs text-muted-foreground">Please verify these destination values in Payroll_Data before confirming cleanup of this temporary tool and the old columns.</p>
              </div>
            )}
          </section>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"><RotateCcw className="size-3.5" />Reset to Default</button>
          <button type="button" onClick={signOut} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"><LogOut className="size-3.5" />Sign Out</button>
          <Button type="button" onClick={save} className="gap-2"><Save className="size-3.5" />Save Changes</Button>
        </div>
      </div>
    </AppShell>
  );
}