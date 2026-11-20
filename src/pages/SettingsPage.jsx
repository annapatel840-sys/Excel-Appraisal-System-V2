import { useEffect, useState } from "react";
import { LogOut, RotateCcw, Save, Settings2 } from "lucide-react";
import { AppShell } from "@/components/appraisal/AppShell";
import { Button } from "@/components/ui/button";
import { useSettings, DEFAULT_SETTINGS } from "@/lib/settings-store";
import { useCatalystSignOut } from "@/lib/catalyst-auth";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";

export function SettingsPage() {
  const { settings, saveSettings, resetSettings } = useSettings();
  const signOut = useCatalystSignOut();
  const [draft, setDraft] = useState(settings);
  const [copyingIds, setCopyingIds] = useState(false);
  const [copyResult, setCopyResult] = useState(null);
  useEffect(() => setDraft(settings), [settings]);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = () => saveSettings(draft);
  const reset = () => { resetSettings(); setDraft(DEFAULT_SETTINGS); };
  const copyEligibilityEmployeeIds = async () => {
    if (!window.confirm("Copy each existing emp_id1 value into the new emp_id column using ROWID matching? No rows will be inserted or deleted. Continue?")) return;
    setCopyingIds(true);
    setCopyResult(null);
    try {
      const result = await payrollCycleRequest("eligibility-copy-emp-ids", { method: "POST", body: {} });
      setCopyResult(result || { message: "Copy request completed." });
    } catch (error) {
      setCopyResult({ error: error?.message || "Could not copy Eligibility List employee IDs." });
    } finally {
      setCopyingIds(false);
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
        <section className="rounded-lg border border-amber-300 bg-card p-4">
          <h3 className="text-sm font-semibold">Temporary Data Migration</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            One-time helper for the Eligibility_List emp_id column migration. It copies emp_id1 to emp_id on existing rows by ROWID; it does not insert or delete rows.
          </p>
          <button type="button" disabled={copyingIds} onClick={copyEligibilityEmployeeIds}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-500 px-3 py-2 text-xs font-semibold hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60">
            {copyingIds ? "Copying employee IDs..." : "Copy Eligibility emp_id1 to emp_id"}
          </button>
          {copyResult && (
            <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs">
              {copyResult.error ? (
                <p className="text-red-700">{copyResult.error}</p>
              ) : (
                <>
                  <p className="font-semibold">{copyResult.blocked ? "Copy stopped — no rows changed" : "Copy operation completed"}</p>
                  <p className="mt-1">Rows checked: {copyResult.totalRows ?? "—"} · Copied: {copyResult.copied ?? 0} · Already matching: {copyResult.alreadyCopied ?? 0}</p>
                  {copyResult.conflictCount > 0 && (
                    <div className="mt-2 space-y-1">
                      <p>Conflicts: {copyResult.conflictCount}. First {copyResult.conflicts?.length || 0} shown:</p>
                      {copyResult.conflicts?.map((item, index) => (
                        <p key={item.rowId || index}>ROWID {item.rowId || "unknown"}: {item.reason}</p>
                      ))}
                    </div>
                  )}
                  {copyResult.message && <p className="mt-1">{copyResult.message}</p>}
                </>
              )}
            </div>
          )}
        </section>
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
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"><RotateCcw className="size-3.5" />Reset to Default</button>
          <button type="button" onClick={signOut} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"><LogOut className="size-3.5" />Sign Out</button>
          <Button type="button" onClick={save} className="gap-2"><Save className="size-3.5" />Save Changes</Button>
        </div>
      </div>
    </AppShell>
  );
}