/**
 * BulkEditPage.jsx — host for the "Bulk Operations" screen.
 *
 * Layout:
 *   - the blue bar (Budget Allocated / Utilisation / Utilisation % / Total Target PB on the left,
 *     "Mock screen" on the right) is rendered here, from the numbers the app already holds;
 *   - everything below it is the dummy HTML (v52), generated into
 *     bulk-ops/bulkOpsMarkup.js + bulkOpsEngine.js + styles/bulk-ops.css by
 *     scripts/generate-bulk-ops.cjs. To change that screen, change the dummy and re-run the script.
 *
 * Wiring (existing behaviour, handed to the engine through `cfg`):
 *   - rows of this login   = the Appraisal Sheet rows (Active + Eligible), topped up with GET /rows
 *   - budget figures       = shared Budget context / Budget Distribution + the Appraisal Sheet rows
 *   - Apply                = still switched off (preview only); view-only logins can never apply
 *   - Excel export         = the bundled "xlsx" package, loaded on first use
 *
 * PROPS
 *   apiUrl     "/server/appraisalapi"  (empty = demo data)
 *   cycle      {id,name,location}      the active cycle; the parent re-mounts on change
 *   height     CSS height (default "100%")
 *   onApplied  optional, called after a successful Apply
 *   readOnly   view-only: nothing can be applied
 *   ref        exposes { reload(), dirty(), refresh() }
 */
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAppraisal, keyOfLabel } from "@/lib/appraisal-store";
import { MANAGER_RATING_LABELS } from "@/lib/appraisal-data";
import { useBudget } from "@/lib/budget-store";
import { useDistributionBudget } from "@/lib/distribution-budget";
import {
  resolveBudgetAllocated,
  sumBudgetConsumed,
  sumTargetPB,
} from "@/components/appraisal/BudgetStatsBar";
import { createBulkOps } from "@/components/appraisal/bulk-ops/bulkOpsEngine";
import BULK_OPS_MARKUP from "@/components/appraisal/bulk-ops/bulkOpsMarkup";
import logoUrl from "@/assets/wissen-logo.png";
import "@/styles/bulk-ops.css";

/* Apply is on: changes are saved through the Appraisal Sheet store (same audit trail and save path as inline and bulk edits). */
const APPLY_ENABLED = true;

/* ---------- header formatting ---------- */
const rupees = (n) => Math.round(Number(n) || 0).toLocaleString("en-IN");
const pctOf = (x) =>
  x && Number(x.budget) ? ((Number(x.used) || 0) / Number(x.budget)) * 100 : 0;
const lvl = (p) => (p > 100 ? "danger" : p > 90 ? "warn" : "");

const isLive = (r) =>
  String(r.status || "").trim().toLowerCase() === "active" &&
  String(r.eligibility || "").trim().toLowerCase() === "eligible";
const num = (v) => Number(v) || 0;

/* Bulk screen field -> Appraisal Sheet column key */
const STORE_KEY = {
  hikeAmt: "hikeAmount",
  hikePct: "hikePct",
  newPB: "allocatedPBAmount",
  newRB: "newRB",
  tpbNext: "targetPBNextYear",
  newPBInst: "pbInstallment",
  remarks: "compManagerRemarks",
  promo: "eligibleForPromotion",
  newTitle: "newTitle",
};

/* ---------- Bulk history ----------
   For now the history lives in this browser only (fast, nothing is read from the audit trail).
   The audit trail is still written on every Apply, so switching to it later is a one-line change:
   set HISTORY_FROM_AUDIT = true. */
const HISTORY_FROM_AUDIT = false;
const MAX_STORED_BATCHES = 30;
const batchesKey = (cycle) => `bulkBatches.v1:${cycle?.id ?? ""}`;
function readStoredBatches(cycle) {
  try {
    const list = JSON.parse(window.localStorage.getItem(batchesKey(cycle)) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (x) {
    return [];
  }
}
function writeStoredBatches(cycle, batches) {
  try {
    const keep = (batches || []).slice(-MAX_STORED_BATCHES);
    window.localStorage.setItem(batchesKey(cycle), JSON.stringify(keep));
  } catch (x) {
    /* storage full or blocked: the history still works for this session */
  }
}

/* ---------- Bulk history, rebuilt from the audit trail (used only when HISTORY_FROM_AUDIT is on) ---------- */
const APPLY_SOURCE = "Bulk edit";
const RESTORE_SOURCE = "Bulk restore";
const RESTORE_PREFIX = "R-";
const BATCH_PREFIX = "BO-";
const AUDIT_TO_ENGINE_KEY = {
  hikeAmount: "hikeAmt",
  allocatedPBAmount: "newPB",
  newRB: "newRB",
  targetPBNextYear: "tpbNext",
};
const textKey = (cycle) => `bulkBatchText.v1:${cycle?.id ?? ""}`;
function loadBatchTexts(cycle) {
  try {
    return JSON.parse(window.localStorage.getItem(textKey(cycle)) || "{}") || {};
  } catch (x) {
    return {};
  }
}
function rememberBatchText(cycle, id, text) {
  try {
    const all = loadBatchTexts(cycle);
    all[id] = String(text).slice(0, 300);
    window.localStorage.setItem(textKey(cycle), JSON.stringify(all));
  } catch (x) {
    /* the history still shows, with a generated description */
  }
}
const fmtTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())} ${d.toLocaleString("en-US", { month: "short" })} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const asNum = (v) => (v !== "" && Number.isFinite(Number(v)) ? Number(v) : v);

function buildBatches(records, texts) {
  const seen = new Set();
  const groups = new Map();
  records.forEach((r) => {
    const src = String(r.source || "");
    const bid = String(r.batchId || "");
    if (src !== APPLY_SOURCE && src !== RESTORE_SOURCE) return;
    if (!bid.startsWith(src === RESTORE_SOURCE ? RESTORE_PREFIX + BATCH_PREFIX : BATCH_PREFIX)) return;
    const k = `${r.empId}|${r.field}|${bid}|${r.to}`;
    if (seen.has(k)) return;
    seen.add(k);
    if (!groups.has(bid)) groups.set(bid, []);
    groups.get(bid).push(r);
  });
  const restoredIds = new Set();
  groups.forEach((_, bid) => {
    if (bid.startsWith(RESTORE_PREFIX)) restoredIds.add(bid.slice(RESTORE_PREFIX.length));
  });
  const out = [];
  groups.forEach((entries, bid) => {
    if (bid.startsWith(RESTORE_PREFIX)) return;
    const rows = new Map();
    const labels = new Set();
    let first = null;
    entries.forEach((e) => {
      const ek = AUDIT_TO_ENGINE_KEY[keyOfLabel(e.field)];
      if (!ek) return;
      labels.add(e.field);
      if (!rows.has(e.empId)) rows.set(e.empId, { id: String(e.empId), old: {}, nw: {}, bulk: false });
      const row = rows.get(e.empId);
      row.old[ek] = asNum(e.from);
      row.nw[ek] = asNum(e.to);
      if (!first || new Date(e.at) < new Date(first.at)) first = e;
    });
    if (!rows.size || !first) return;
    out.push({
      id: bid,
      at: new Date(first.at).getTime() || 0,
      time: fmtTime(first.at),
      by: first.user || "",
      text: (texts && texts[bid]) || `Changed ${[...labels].join(", ")}`,
      rows: [...rows.values()],
      restored: restoredIds.has(bid),
    });
  });
  return out.sort((a, b) => a.at - b.at);
}

const BulkOperations = forwardRef(function BulkOperations(
  { apiUrl = "", cycle, height = "100%", onApplied, readOnly = false },
  ref,
) {
  const hostRef = useRef(null);
  const rootRef = useRef(null);
  const apiRef = useRef(null);

  /* ---------- data the app already holds ---------- */
  let sheetRows = [];
  let sheetAudit = [];
  let storeBulkUpdate = null;
  let storeFetchBulkHistory = null;
  try {
    const ctx = useAppraisal();
    sheetRows = ctx.rows || [];
    sheetAudit = ctx.audit || [];
    storeBulkUpdate = ctx.bulkUpdate || null;
    storeFetchBulkHistory = ctx.fetchBulkHistory || null;
  } catch (x) {
    sheetRows = [];
    sheetAudit = [];
  }
  let budgetCtx = null;
  try {
    budgetCtx = useBudget();
  } catch (x) {
    budgetCtx = null;
  }
  let distBudget = null;
  try {
    distBudget = useDistributionBudget();
  } catch (x) {
    distBudget = null;
  }

  /* Header figures: same numbers as the Appraisal Sheet's own top bar. They always cover ALL
     employees and never move with this screen's filters or a rule preview. */
  const sheetHdr = useMemo(() => {
    if (!budgetCtx || !sheetRows.length) return null;
    const live = sheetRows.filter(isLive);
    const useDist = !!distBudget && distBudget.applies;
    const { allocated } = useDist
      ? { allocated: distBudget.updatedBudget }
      : resolveBudgetAllocated({
          totals: budgetCtx.totals,
          loading: budgetCtx.loading,
          error: budgetCtx.error,
        });
    return {
      allocated,
      pending: (useDist ? !!distBudget.pending : !!budgetCtx.loading) && !allocated,
      used: sumBudgetConsumed(live),
      tpb: sumTargetPB(live),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetCtx, distBudget?.applies, distBudget?.updatedBudget, distBudget?.pending, sheetRows]);

  /* The Appraisal Sheet's own rows, in the screen's row shape (Active + Eligible, by Employee ID). */
  const sheetEmp = useMemo(() => {
    const edited = new Set(
      (sheetAudit || []).map((x) => String(x.empId || "").trim()).filter(Boolean),
    );
    return sheetRows
      .filter(isLive)
      .map((r) => {
        const rating = Number(r.managerRating);
        return Object.assign({}, r, {
          empId: String(r.empId),
          name: r.name || "",
          designation: r.designation || "",
          band: r.band || "",
          compManager: r.compManager || "",
          superManager: r.appraiserTechED || "",
          rating:
            Number.isFinite(rating) && rating > 0
              ? rating
              : r.rating === "" || r.rating == null
                ? null
                : Number(r.rating),
          basePay: num(r.currentAnnualBasePay),
          pbPaid: num(r.pbToBePaid),
          rbPaid: num(r.rbToBePaid),
          hikeAmt: num(r.hikeAmount),
          newPB: num(r.allocatedPBAmount),
          newRB: num(r.newRB),
          tpbNext: num(r.targetPBNextYear),
          newPBInst: String(r.pbInstallment || "1"),
          remarks: r.compManagerRemarks || "",
          promo: r.eligibleForPromotion || "No",
          hand: edited.has(String(r.empId).trim()),
          bulk: false,
        });
      })
      .sort((a, b) =>
        String(a.empId).localeCompare(String(b.empId), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
  }, [sheetRows, sheetAudit]);

  /* Latest values for the engine's callbacks (the engine is created once). */
  const live = useRef({});
  live.current = {
    sheetEmp, sheetHdr, readOnly, onApplied, cycle, apiUrl, sheetRows, storeBulkUpdate,
    sheetAudit, storeFetchBulkHistory,
  };
  /* Bulk history read from the server (kept so a screen refresh does not re-download it). */
  const historyCache = useRef(null);

  /* Fallback header figures (only used until the Appraisal Sheet numbers are in memory). */
  const [fallback, setFallback] = useState(null);

  /* ---------- mount the dummy screen ---------- */
  useEffect(() => {
    const root = rootRef.current;
    const host = hostRef.current;
    if (!root || !host) return undefined;
    host.innerHTML = BULK_OPS_MARKUP;
    const cfg = {
      apiUrl: live.current.apiUrl,
      logoUrl,
      cycle: live.current.cycle,
      get canApply() {
        return APPLY_ENABLED && !live.current.readOnly;
      },
      applyNote: readOnly
        ? "View only — you can preview but not apply."
        : "Apply is not enabled yet — preview only.",
      /* Apply / Restore: write the changes through the Appraisal Sheet store. */
      saveChanges: (changes, source, meta) => {
        const { sheetRows: rows, storeBulkUpdate: bulkUpdate } = live.current;
        // Every Apply is one batch in the audit trail (source "Bulk edit"); every Restore is
        // one "Bulk restore" batch pointing back at it. This is what the History tab reads.
        const isRestore = source === "bulk_restore";
        const opts = {
          source: isRestore ? RESTORE_SOURCE : APPLY_SOURCE,
          batchId: meta && meta.id ? (isRestore ? RESTORE_PREFIX : "") + meta.id : undefined,
        };
        if (!isRestore && meta && meta.id && meta.text) rememberBatchText(live.current.cycle, meta.id, meta.text);
        if (!bulkUpdate) throw new Error("Saving is not available right now.");
        const idOf = {};
        (rows || []).forEach((r) => {
          idOf[String(r.empId)] = r.id;
        });
        const groups = new Map();
        changes.forEach((c) => {
          const key = STORE_KEY[c.field] || c.field;
          const id = idOf[String(c.empId)];
          if (id == null) return;
          const gk = key + "\u0001" + String(c.value);
          if (!groups.has(gk)) groups.set(gk, { key, value: c.value, ids: [] });
          groups.get(gk).ids.push(id);
        });
        let saved = 0;
        groups.forEach((g) => {
          saved += Number(bulkUpdate(g.ids, g.key, "set", g.value, opts)) || 0;
        });
        if (changes.length && !saved) {
          throw new Error("Nothing could be saved (the sheet may be locked or the values did not change).");
        }
        return { saved, notes: [] };
      },
      /* History of the current cycle: server audit trail + what this session just saved. */
      saveBatches: (batches) => writeStoredBatches(live.current.cycle, batches),
      loadBatches: async (force) => {
        if (!HISTORY_FROM_AUDIT) return readStoredBatches(live.current.cycle);
        const { storeFetchBulkHistory: fetchHistory, sheetAudit: localAudit, cycle: cyc } = live.current;
        if ((force || !historyCache.current) && fetchHistory) {
          try {
            historyCache.current = await fetchHistory();
          } catch (x) {
            /* keep the last copy; the session's own audit entries still show */
          }
        }
        return buildBatches([...(historyCache.current || []), ...(localAudit || [])], loadBatchTexts(cyc));
      },
      getSheetEmp: () => live.current.sheetEmp,
      // Manager Rating names, same list as the Manager Rating column in the Appraisal Sheet.
      ratingLabels: MANAGER_RATING_LABELS,
      getHdr: () => {
        const h = live.current.sheetHdr;
        return h ? { allocated: h.allocated, used: h.used, tpb: h.tpb } : null;
      },
      onBudget: (b) => {
        if (live.current.sheetHdr) return;
        setFallback((prev) =>
          prev && prev.budget === b.budget && prev.used === b.used && prev.tpb === b.tpb
            ? prev
            : { budget: b.budget, used: b.used, tpb: b.tpb },
        );
      },
      onApplied: (batch) => {
        const f = live.current.onApplied;
        if (f) f(batch);
      },
      loadXLSX: () =>
        import("xlsx").then((m) => (m.default && m.default.utils ? m.default : m)),
    };
    const api = createBulkOps(root, cfg);
    apiRef.current = api;
    return () => {
      try {
        api.destroy();
      } catch (x) {
        /* ignore */
      }
      apiRef.current = null;
      host.innerHTML = "";
    };
    // The parent keys this component by cycle, so the engine is created once per cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The Appraisal Sheet changed (rows, audit, budget): let the screen re-read it. */
  useEffect(() => {
    if (apiRef.current) apiRef.current.refresh();
  }, [sheetEmp, sheetHdr]);

  useImperativeHandle(ref, () => ({
    reload: () => apiRef.current && apiRef.current.reload(),
    dirty: () => !!(apiRef.current && apiRef.current.dirty()),
    refresh: () => apiRef.current && apiRef.current.refresh(),
  }));

  /* ---------- blue bar ---------- */
  const b0 = sheetHdr
    ? {
        budget: sheetHdr.allocated,
        used: sheetHdr.used,
        tpb: sheetHdr.tpb,
      }
    : fallback || { budget: 0, used: 0, tpb: 0 };
  const util = pctOf(b0);

  return (
    <div className="bo" ref={rootRef} style={{ "--bo-h": height }}>
      <div className="topbar">
        <div className="tb-r">
          <div className="tk">
            <span>Budget Allocated</span>
            <strong>
              {sheetHdr
                ? sheetHdr.pending
                  ? "…"
                  : Math.round(b0.budget).toLocaleString("en-IN")
                : rupees(b0.budget)}
            </strong>
          </div>
          <div className="tk">
            <span>Utilisation</span>
            <strong className={lvl(util)}>{rupees(b0.used)}</strong>
          </div>
          <div className="tk">
            <span>Utilisation %</span>
            <strong className={lvl(util)}>{util.toFixed(1)}%</strong>
          </div>
          <div className="tk">
            <span>Total Target PB</span>
            <strong>{rupees(b0.tpb)}</strong>
          </div>
        </div>
        {/* "Menu" button (was "More"): same ids the screen's engine already wires (replaces the old "Mock screen" label) */}
        <div className="more tb-more">
          <button className="btn" id="bMore" type="button" title="Menu" aria-label="Menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <span>Menu</span>
          </button>
          <div className="menu" id="moreM">
            <button id="bScnSave" type="button">Save as Scenario</button>
            <button id="bScnOpen" type="button">Scenarios &amp; History ›</button>
            <button id="bRestoreLast" type="button">Restore Last Apply</button>
            <hr />
            <button id="bExport" type="button">Export to Excel</button>
            <button id="bReset" type="button">Reset</button>
          </div>
        </div>
      </div>
      <div className="bo-host" ref={hostRef} />
    </div>
  );
});

export default BulkOperations;