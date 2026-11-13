import { useEffect, useState } from "react";
import { LogOut, RotateCcw, Save, Settings2 } from "lucide-react";
import { AppShell } from "@/components/appraisal/AppShell";
import { Button } from "@/components/ui/button";
import { useSettings, DEFAULT_SETTINGS } from "@/lib/settings-store";
import { useCatalystSignOut, useCatalystUser } from "@/lib/catalyst-auth";
import { invalidatePayrollCycleReads, payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { cycleNameWithoutLocation, withCycleLocation } from "@/lib/cycle-name";

export function SettingsPage() {
  const { settings, saveSettings, resetSettings } = useSettings();
  const signOut = useCatalystSignOut();
  const user = useCatalystUser();
  const isHR = String(user?.role || "").trim().toLowerCase() === "hr";
  const [splittingCycles, setSplittingCycles] = useState(false);
  const [splitMessage, setSplitMessage] = useState("");
  const [splitError, setSplitError] = useState(false);

  const generateLocationCycles = async () => {
    setSplittingCycles(true);
    setSplitMessage("");
    setSplitError(false);
    try {
      const [cycleRows, locationRows] = await Promise.all([
        payrollCycleRequest("cycles", { fresh: true }),
        payrollCycleRequest("locations", { fresh: true }),
      ]);
      const annual2027 = (Array.isArray(cycleRows) ? cycleRows : []).filter((cycle) =>
        cycleNameWithoutLocation(cycle.name).trim().toLowerCase() === "annual 2027" &&
        !cycle.archived && !["Cancelled", "Deleted"].includes(cycle.status),
      );
      if (!annual2027.length) throw new Error("Existing Annual 2027 cycle was not found. No data was changed.");
      const source = annual2027.find((cycle) => !cycle.location || ["all", "all locations"].includes(String(cycle.location).trim().toLowerCase())) || annual2027[0];
      const locations = (Array.isArray(locationRows) ? locationRows : [])
        .filter((location) => String(location.status || "Active").trim().toLowerCase() !== "inactive")
        .map((location) => String(location.location_name || "").trim())
        .filter(Boolean);
      if (!locations.length) throw new Error("No active locations were found in Location Master.");
      const created = [];
      const existing = [];
      const failed = [];
      for (const location of locations) {
        const name = withCycleLocation("Annual 2027", location, false);
        const found = annual2027.find((cycle) =>
          String(cycle.name || "").trim().toLowerCase() === name.toLowerCase() ||
          (String(cycle.location || "").trim().toLowerCase() === location.toLowerCase() &&
            cycleNameWithoutLocation(cycle.name).trim().toLowerCase() === "annual 2027"),
        );
        if (found) { existing.push(name); continue; }
        try {
          await payrollCycleRequest("cycles/create", {
            method: "POST",
            body: {
              name,
              type: source.type || "Annual",
              process: source.process || "Annual",
              effective: source.effective || source.start,
              start: source.start,
              end: source.end,
              location,
              remarks: `Generated from existing Annual 2027 configuration. Source cycle ID: ${source.id}. Original payroll, feedback and rating records remain unchanged.`,
            },
          });
          created.push(name);
        } catch (error) {
          failed.push(`${name}: ${error?.message || "creation failed"}`);
        }
      }
      invalidatePayrollCycleReads();
      window.dispatchEvent(new CustomEvent("appraisal:cycle-updated"));
      if (failed.length) {
        setSplitError(true);
        setSplitMessage(`${created.length} created; ${existing.length} already existed. Failed: ${failed.join("; ")}`);
      } else {
        setSplitMessage(`${created.length} location cycle(s) created; ${existing.length} already existed. Original Annual 2027 data was not changed.`);
      }
    } catch (error) {
      setSplitError(true);
      setSplitMessage(error?.message || "Could not create location-wise cycles.");
    } finally {
      setSplittingCycles(false);
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
        {isHR && (
          <section className="rounded-lg border border-amber-300 bg-card p-4">
            <h3 className="text-sm font-semibold">Temporary: Generate Location-wise Annual 2027 Cycles</h3>
            <p className="mt-1 text-xs text-muted-foreground">Creates one Annual 2027 cycle for each active Location Master location. Existing cycles are skipped; the original Annual 2027 data is not copied or deleted.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" disabled={splittingCycles} onClick={generateLocationCycles}>
                {splittingCycles ? "Generating..." : "Generate Location-wise Cycles"}
              </Button>
              {splitMessage && <span className={splitError ? "text-xs text-red-600" : "text-xs text-green-700"}>{splitMessage}</span>}
            </div>
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