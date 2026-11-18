import { useEffect, useState } from "react";
import { LogOut, RotateCcw, Save, Settings2 } from "lucide-react";
import { AppShell } from "@/components/appraisal/AppShell";
import { Button } from "@/components/ui/button";
import { useSettings, DEFAULT_SETTINGS } from "@/lib/settings-store";
import { useCatalystSignOut } from "@/lib/catalyst-auth";
import { useAccess } from "@/lib/access-store";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

export function SettingsPage() {
  const { settings, saveSettings, resetSettings } = useSettings();
  const signOut = useCatalystSignOut();
  const access = useAccess();
  const [reconLoading, setReconLoading] = useState(false);
  const [reconError, setReconError] = useState("");
  const [reconPreview, setReconPreview] = useState(null);
  const [reconBatchId, setReconBatchId] = useState("");
  const [reconMessage, setReconMessage] = useState("");
  const reconUrl = catalystFunctionUrl("datareconciliationapi");
  const runReconciliation = async (resource, payload) => {
    setReconLoading(true); setReconError(""); setReconMessage("");
    try {
      const response = await catalystFetch(reconUrl + "?resource=" + resource, {
        method: payload ? "POST" : "GET",
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const result = await response.json();
      if (!response.ok || result?.success !== true) throw new Error(result?.message || "Data reconciliation request failed.");
      return result.data;
    } catch (error) {
      setReconError(error?.message || String(error));
      return null;
    } finally { setReconLoading(false); }
  };
  const previewReconciliation = async () => {
    const data = await runReconciliation("preview");
    if (data) { setReconPreview(data); setReconMessage("Preview completed. No Catalyst records were changed."); }
  };
  const applyReconciliation = async () => {
    if (!reconPreview?.planToken || !window.confirm("Apply the exact changes shown in Preview? A rollback record will be saved.")) return;
    const data = await runReconciliation("apply", { planToken: reconPreview.planToken });
    if (data) { setReconBatchId(data.batchId || ""); setReconMessage("Apply completed. Updates: " + data.updates + ", inserts: " + data.inserts + "."); await previewReconciliation(); }
  };
  const revertReconciliation = async () => {
    if (!reconBatchId || !window.confirm("Revert this reconciliation batch? Revert will stop if an affected row has changed since Apply.")) return;
    const data = await runReconciliation("revert", { batchId: reconBatchId });
    if (data) { setReconMessage("Revert completed. Restored: " + data.restored + ", removed inserted rows: " + data.deleted + "."); setReconBatchId(""); await previewReconciliation(); }
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
        {access.ready && access.role === "hr" && (
          <section className="rounded-lg border border-amber-300 bg-card p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Temporary Data Correction Utility</h3>
              <p className="mt-1 text-xs text-muted-foreground">HR Admin only. Preview scans all cycles and locations without writing data. Apply uses the preview token; Revert is available for the last applied batch.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={reconLoading} onClick={previewReconciliation}>Preview Data</Button>
              <Button type="button" disabled={reconLoading || !reconPreview?.planToken || (reconPreview?.summary?.safeUpdates || 0) + (reconPreview?.summary?.safeInserts || 0) === 0} onClick={applyReconciliation}>Apply Preview</Button>
              <Button type="button" variant="destructive" disabled={reconLoading || !reconBatchId} onClick={revertReconciliation}>Revert Last Apply</Button>
            </div>
            {reconLoading && <p className="text-xs text-muted-foreground">Processing…</p>}
            {reconError && <p role="alert" className="text-xs text-red-600">{reconError}</p>}
            {reconMessage && <p className="text-xs text-muted-foreground">{reconMessage}</p>}
            {reconPreview?.summary && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Safe updates</p><p className="text-lg font-semibold">{reconPreview.summary.safeUpdates}</p></div>
                  <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Safe inserts</p><p className="text-lg font-semibold">{reconPreview.summary.safeInserts}</p></div>
                  <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Issues</p><p className="text-lg font-semibold">{reconPreview.summary.issueCount}</p></div>
                  <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Duplicates</p><p className="text-lg font-semibold">{reconPreview.summary.duplicates}</p></div>
                </div>
                <p className="text-xs text-muted-foreground">Scanned records: {Object.entries(reconPreview.summary.scanned || {}).map(([k,v]) => k + ": " + v).join(" · ")}</p>
                {Object.keys(reconPreview.summary.issueTypes || {}).length > 0 && (
                  <div className="rounded-md border border-border p-2">
                    <p className="mb-2 text-xs font-semibold">Issues by type</p>
                    <div className="grid gap-1 sm:grid-cols-2 md:grid-cols-3">
                      {Object.entries(reconPreview.summary.issueTypes).sort((a,b) => b[1]-a[1]).map(([type,count]) => (
                        <div key={type} className="flex items-center justify-between gap-2 text-xs">
                          <span className="break-all text-muted-foreground">{type}</span><span className="font-semibold tabular-nums">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {reconPreview.issues?.length > 0 && (
                  <div className="max-h-72 overflow-auto rounded-md border border-border">
                    <div className="grid grid-cols-[minmax(100px,0.7fr)_minmax(90px,0.5fr)_minmax(180px,2fr)] gap-2 border-b bg-muted p-2 text-xs font-semibold"><span>Issue</span><span>Table / Row</span><span>Details</span></div>
                    {reconPreview.issues.map((item, index) => <div key={item.type + "-" + item.table + "-" + item.rowId + "-" + index} className="grid grid-cols-[minmax(100px,0.7fr)_minmax(90px,0.5fr)_minmax(180px,2fr)] gap-2 border-b p-2 text-xs"><span>{item.type}</span><span>{item.table} / {item.rowId || "—"}</span><span>{item.message}</span></div>)}
                  </div>
                )}
                {reconPreview.issuesTruncated && <p className="text-xs text-amber-700">Issue list is truncated to the first 2,000 entries.</p>}
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