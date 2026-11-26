import { useEffect, useState } from "react";
import { LogOut, RotateCcw, Save, Settings2, FileSpreadsheet, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { AppShell } from "@/components/appraisal/AppShell";
import { Button } from "@/components/ui/button";
import { useSettings, DEFAULT_SETTINGS } from "@/lib/settings-store";
import { useCatalystSignOut } from "@/lib/catalyst-auth";

export function SettingsPage() {
  const { settings, saveSettings, resetSettings } = useSettings();
  const signOut = useCatalystSignOut();
  const [draft, setDraft] = useState(settings);
  // TEMPORARY IMPORT DEMO TEST START
  const [demoToken, setDemoToken] = useState("");
  const [demoBusy, setDemoBusy] = useState("");
  const [demoMessage, setDemoMessage] = useState("");
  useEffect(() => {
    try {
      setDemoToken(window.localStorage.getItem("temporary-import-demo-token") || "");
    } catch {
      setDemoToken("");
    }
  }, []);
  // TEMPORARY IMPORT DEMO TEST END
  useEffect(() => setDraft(settings), [settings]);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = () => saveSettings(draft);
  const reset = () => { resetSettings(); setDraft(DEFAULT_SETTINGS); };

  // TEMPORARY IMPORT DEMO TEST START
  const generateImportDemoFiles = async () => {
    setDemoBusy("prepare");
    setDemoMessage("");
    try {
      const data = await payrollCycleRequest("demo-import-test", {
        method: "POST",
        body: { action: "prepare" },
      });
      if (!data?.token || !data?.payrollRows?.length || !data?.feedbackRows?.length) {
        throw new Error("The demo endpoint returned incomplete test data.");
      }
      const makeWorkbook = (rows, sheetName) => {
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        return workbook;
      };
      XLSX.writeFile(makeWorkbook(data.payrollRows, "Payroll Demo"), data.payrollFileName);
      XLSX.writeFile(makeWorkbook(data.feedbackRows, "Feedback Demo"), data.feedbackFileName);
      window.localStorage.setItem("temporary-import-demo-token", data.token);
      window.localStorage.setItem("temporary-import-demo-cycle-id", data.cycleId);
      setDemoToken(data.token);
      setDemoMessage(
        "Downloaded both demo files for " + data.cycleName +
        ". Import each file only into its matching Master page. Do not generate the Appraisal Sheet before cleanup.",
      );
    } catch (error) {
      setDemoMessage(error?.message || "Could not generate the demo files.");
    } finally {
      setDemoBusy("");
    }
  };

  const deleteImportDemoData = async () => {
    if (!demoToken) {
      setDemoMessage("No active demo token was found in this browser session. Generate the demo files again or restore the saved token.");
      return;
    }
    const confirmed = window.confirm(
      "Delete only Payroll and Feedback rows created with this temporary demo token? Existing rows will not be touched.",
    );
    if (!confirmed) return;
    setDemoBusy("cleanup");
    setDemoMessage("");
    try {
      const data = await payrollCycleRequest("demo-import-test", {
        method: "POST",
        body: { action: "cleanup", token: demoToken },
      });
      window.localStorage.removeItem("temporary-import-demo-token");
      window.localStorage.removeItem("temporary-import-demo-cycle-id");
      setDemoToken("");
      setDemoMessage(
        "Cleanup complete. Deleted " + (data?.deletedPayroll || 0) +
        " Payroll row(s), " + (data?.deletedFeedback || 0) +
        " Feedback row(s), and " + (data?.deletedAudit || 0) +
        " matching upload audit row(s).",
      );
      window.dispatchEvent(new Event("appraisal:payroll-data-updated"));
      window.dispatchEvent(new Event("appraisal:feedback-data-updated"));
    } catch (error) {
      setDemoMessage(error?.message || "Demo cleanup failed. The token has been retained so you can retry.");
    } finally {
      setDemoBusy("");
    }
  };
  // TEMPORARY IMPORT DEMO TEST END
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
        {/* TEMPORARY IMPORT DEMO TEST START */}
        <section className="rounded-lg border border-amber-300 bg-card p-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-amber-700" />
            <div>
              <h3 className="text-sm font-semibold">Temporary Import Test Tools</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                HR-only test utilities for Payroll Master and Feedback &amp; Rating Master. These controls do not change existing rows when preparing files.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" disabled={!!demoBusy || !!demoToken} onClick={generateImportDemoFiles} className="gap-2">
              <FileSpreadsheet className="size-3.5" />
              {demoBusy === "prepare" ? "Preparing..." : demoToken ? "Demo Files Generated" : "Generate Demo Files"}
            </Button>
            <Button type="button" variant="destructive" disabled={!!demoBusy || !demoToken} onClick={deleteImportDemoData} className="gap-2">
              <Trash2 className="size-3.5" />
              {demoBusy === "cleanup" ? "Deleting..." : "Delete Demo Data"}
            </Button>
          </div>
          {demoToken && (
            <p className="mt-2 text-xs text-muted-foreground">
              Demo cleanup token is saved in this browser until the matching demo rows are deleted.
            </p>
          )}
          {demoMessage && (
            <p role="status" className="mt-3 rounded-md bg-muted p-3 text-xs text-foreground">
              {demoMessage}
            </p>
          )}
          <p className="mt-3 text-xs text-amber-800">
            Important: import both files, verify the two Master tables, then click Delete Demo Data here. Do not generate the Appraisal Sheet before cleanup. This temporary section and endpoint must be removed after testing.
          </p>
        </section>
        {/* TEMPORARY IMPORT DEMO TEST END */}
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