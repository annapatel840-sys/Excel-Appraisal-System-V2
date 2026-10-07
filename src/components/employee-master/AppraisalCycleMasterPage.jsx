import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useAccess } from "@/lib/access-store";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ============================================================
   CONFIG  (Appraisal_Cycle_v15 reference)
   ============================================================ */

const TYPES = ["Annual", "Mid-Year", "Exceptional", "New Joiner"];
// HR Config: default process per cycle type. HR can change it at set up.
const DEFAULT_PROCESS = {
  Annual: "Annual",
  "Mid-Year": "Annual",
  Exceptional: "Exceptional",
  "New Joiner": "None",
};
const PROCESSES = [
  ["Annual", "Annual"],
  ["Exceptional", "Exceptional"],
  ["None", "No process"],
];
// No new Annual-process cycle until the previous one is archived.
const ENFORCE_ONE_OPEN_ANNUAL = true;

const MON = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const formatDate = (value) => {
  if (!value) return "—";
  const p = String(value).slice(0, 10).split("-");
  if (p.length < 3) return value;
  return `${p[2]} ${MON[Number(p[1]) - 1]} ${p[0]}`;
};

const typeOf = (name) =>
  TYPES.find((t) =>
    String(name || "")
      .toLowerCase()
      .startsWith(t.toLowerCase()),
  ) || "Annual";
const procLabel = (p) => (p === "None" ? "No process" : p);

const SDESC = {
  Upcoming:
    "Cycle is set up. Update the Employee Master and upload payroll, then press Activate when ready.",
  Active:
    "Cycle is running. Do the steps in any order and as often as needed; press Close when the cycle is finished.",
  Closed:
    "Cycle is finished. HR can still correct data, with a reason, until the cutoff date set in HR Config; press Archive when done.",
};
const EDESC = {
  Upcoming:
    "Cycle is set up on the Exceptional process. HR moves it manually; none of the Annual steps apply.",
  Active:
    "Cycle is running. Rows are worked on the Exceptional grid; press Close when it is finished.",
  Closed:
    "Cycle is finished. Press Archive when done; the employees are released when it is archived.",
};
const BDESC = {
  activate:
    "Starts the cycle and triggers the Eligibility List. Needs the Employee Master updated and payroll differences resolved or ignored. From now on Employee Master changes go to the Change list.",
  close:
    "Closes the cycle (Active → Closed). A window shows what is still pending; you choose Close anyway or Don't close yet.",
  archive:
    "Final values go to Compensation History and the Appraisal Sheet and Detail are cleared. The cycle becomes read-only and cannot be reopened. A window shows what is still pending first.",
  generate:
    "One row per eligible employee; feeds the Detail screen. Comp Manager defaults to the Tech ED of each employee; Delegation can change it later. Runs once; after it, any change goes to the Change list. Nothing blocks this step.",
};
const BTN = {
  Upcoming: { k: "activate", name: "Activate", to: "Active" },
  Active: { k: "close", name: "Close", to: "Closed" },
  Closed: { k: "archive", name: "Archive", to: "Archived" },
};

// Step / pending buttons -> tab key passed to onNavigate (EmployeeMaster decides what exists).
const NAV_TAB = {
  "go-em": "roster",
  "go-up-em": "roster",
  "go-pay": "payroll-data",
  "go-up-pay": "payroll-upload",
  "go-el": "eligibility",
  "go-dl": "delegation",
  "go-cl": "change-list",
  "go-mm": "change-list",
  "go-ap": "appraisal-sheet",
  "go-lt": "letters",
  "go-up-fr": "feedback-upload",
};
const PEND_NAV = {
  rt: "go-ap",
  lt: "go-lt",
  co: "go-ap",
  cl: "go-cl",
  mm: "go-mm",
  el: "go-el",
};

/* ============================================================
   PURE HELPERS
   ============================================================ */

const statusOf = (c) => (c.archived ? "Archived" : c.status);
const isOpenCycle = (c) =>
  ["Upcoming", "Active", "Closed", "Open"].includes(statusOf(c));
const isHidden = (c) => c.status === "Cancelled" || c.status === "Deleted";
const nextBtn = (c) =>
  !c || c.archived || c.process === "None" || isHidden(c)
    ? null
    : BTN[c.status] || null;

const rule = (label, ok, txt, act = "") => ({
  label,
  ok,
  txt,
  kind: ok ? "ok" : "no",
  act,
});
const allOk = (rs) => rs.every((x) => x.ok);
const missingPay = (w) =>
  Math.max(0, (w.emCount || 0) - (w.payHave || 0) - (w.payIgnored || 0));

function Modal({ title, onClose, children, footer, error, wideModal }) {
  return (
    <div className="acx-ov">
      <div className="acx-md" style={wideModal ? { width: 560 } : undefined}>
        <div className="mh">
          <b>{title}</b>
          <button type="button" className="x" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="mb">{children}</div>
        {error && <div className="acx-err">{error}</div>}
        <div className="mf">{footer}</div>
      </div>
    </div>
  );
}

/* ============================================================
   COMPONENT

   Optional props (all safe to omit):
   - onNavigate(tabKey)       open another screen / tab
   - pendingItems             [{k,label,n,sub}] for the selected cycle
   - cycleStats               { [cycleId]: { emUpdated, emCount, emNew, emChanged,
                                payHave, payIgnored, notIncluded, eligible,
                                sheetGenerated, sheetRows,
                                letters:{gen,toSend,sent,dropped} } }
   - onGenerateSheet(cycle)   async; called by "Generate Appraisal Sheet"
   ============================================================ */

export function AppraisalCycleMasterPage({
  onNavigate,
  pendingItems = [],
  cycleStats = null,
  onGenerateSheet,
}) {
  const user = useCatalystUser();
  const access = useAccess();
  const canManageCycles =
    String(user?.role || "")
      .trim()
      .toLowerCase() === "hr" && access.canScreen("cycleMaster", "edit");
  const canAudit = access.canAction("viewAudit");

  const [rawCycles, setCycles] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);

  // screen state
  const [sel, setSel] = useState(null);
  const [type, setType] = useState("Annual");
  const [q, setQ] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(5);

  // panel state
  const [tab, setTab] = useState("chg");
  const [pk, setPk] = useState({ chg: "all", aud: "all" });
  const [notes, setNotes] = useState(false);
  const [noteText, setNoteText] = useState(() => {
    try {
      return localStorage.getItem("cycle_notes") || "";
    } catch {
      return "";
    }
  });
  const [wide, setWide] = useState(false);
  const [fold, setFold] = useState(() => {
    try {
      return localStorage.getItem("cycle_panel_fold") === "1";
    } catch {
      return false;
    }
  });
  const [panelW, setPanelW] = useState(() => {
    try {
      return Number(localStorage.getItem("cycle_panel_w")) || 360;
    } catch {
      return 360;
    }
  });
  const dragRef = useRef(null);

  // modals
  const [editCycle, setEditCycle] = useState(null);
  const [editForm, setEditForm] = useState({
    process: "Annual",
    effective: "",
    start: "",
    end: "",
  });
  const [remarksCycle, setRemarksCycle] = useState(null);
  const [remarksText, setRemarksText] = useState("");
  const [cancelCycle, setCancelCycle] = useState(null);
  const [cancelText, setCancelText] = useState("");
  const [newCycleOpen, setNewCycleOpen] = useState(false);
  const thisYear = new Date().getFullYear();
  const blankNew = {
    type: "Annual",
    year: thisYear,
    process: "Annual",
    effective: "",
    start: "",
    end: "",
    remarks: "",
  };
  const [newForm, setNewForm] = useState(blankNew);
  const [confirm, setConfirm] = useState(null); // { kind, cycle }
  const [confirmRemark, setConfirmRemark] = useState("");
  const [modalError, setModalError] = useState("");

  const showBanner = (title, body, error = false) =>
    setBanner({ title, body, error });

  /* ---------------- data ---------------- */

  const loadData = useCallback(async () => {
    const [cycleRows, auditRows] = await Promise.all([
      payrollCycleRequest("cycles"),
      payrollCycleRequest("audit"),
    ]);
    setCycles(cycleRows);
    setAudit(
      auditRows.map((e) => ({
        id: e.id,
        cycleId: e.cycleId,
        cycle: e.cycle,
        action: e.field,
        changedBy: e.user,
        changedAt: e.time,
        details: e.details,
        remarks: e.remarks,
      })),
    );
    setLoadError("");
    setRefreshError("");
  }, []);

  useEffect(() => {
    let mounted = true;
    loadData()
      .catch((error) => mounted && setLoadError(error.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [loadData]);

  // Use backend values when present, otherwise derive them from the name.
  const cycles = useMemo(
    () =>
      rawCycles.map((c) => {
        const t = c.type || typeOf(c.name);
        return {
          ...c,
          type: t,
          process: c.process || DEFAULT_PROCESS[t],
          effective: c.effective || c.start || "",
          cancelReason: c.cancelReason || "",
        };
      }),
    [rawCycles],
  );

  const current = useMemo(
    () => cycles.find((c) => c.id === sel) || null,
    [cycles, sel],
  );
  const statsFor = (c) => (c && cycleStats && cycleStats[c.id]) || null;

  // Pending items: use the prop when given, otherwise derive from cycleStats.
  const pendingList = (() => {
    if (pendingItems.length) return pendingItems;
    const c = current;
    const w = statsFor(c);
    if (
      !c ||
      !w ||
      c.process !== "Annual" ||
      c.archived ||
      c.status === "Upcoming" ||
      !w.emUpdated
    )
      return [];
    const np = missingPay(w);
    const ni = w.notIncluded || 0;
    const L = w.letters || { gen: false, toSend: 0, sent: 0, dropped: 0 };
    const out = [
      {
        k: "mm",
        label: "Mismatch",
        n: np + ni,
        sub:
          np + ni
            ? `${np} with no payroll data · ${ni} not included (open Exceptional cycle)`
            : "None — all clear",
      },
    ];
    if (L.gen)
      out.push({
        k: "lt",
        label: "Letters to send",
        n: L.toSend,
        sub: `${L.toSend} To send · ${L.sent} Sent · ${L.dropped} Dropped`,
      });
    return out;
  })();

  const gridRows = useMemo(() => {
    const s = q.toLowerCase();
    return cycles
      .filter((c) => c.type === type)
      .filter((c) => showHidden || !isHidden(c))
      .filter(
        (c) =>
          !s ||
          `${c.name} ${c.id} ${c.process} ${statusOf(c)}`
            .toLowerCase()
            .includes(s),
      )
      .sort(
        (a, b) =>
          (isOpenCycle(a) ? 0 : 1) - (isOpenCycle(b) ? 0 : 1) ||
          String(b.start || "").localeCompare(String(a.start || "")),
      );
  }, [cycles, type, showHidden, q]);

  // keep a valid selection
  useEffect(() => {
    if (!cycles.length) return;
    if (!current || current.type !== type) {
      const first =
        cycles.find((c) => c.type === type && isOpenCycle(c)) ||
        cycles.find((c) => c.type === type && !isHidden(c));
      if (first) setSel(first.id);
    }
  }, [cycles, type, current]);

  const pages = Math.max(1, Math.ceil(gridRows.length / size));
  const safePage = Math.min(page, pages);
  const pageRows = gridRows.slice((safePage - 1) * size, safePage * size);

  const typeCount = (t) => {
    const a = cycles.filter((c) => c.type === t && c.status !== "Deleted");
    return { open: a.filter(isOpenCycle).length, total: a.length };
  };

  const remarksHistory = useMemo(
    () =>
      audit
        .filter(
          (e) =>
            e.cycleId === remarksCycle?.id &&
            (e.action === "Remarks changed" || e.action === "Created cycle"),
        )
        .map((e) => ({
          remarks: e.remarks || "",
          changedBy: e.changedBy,
          changedAt: e.changedAt,
        }))
        .reverse(),
    [audit, remarksCycle],
  );

  /* ---------------- rules ---------------- */

  const otherAnnualRunning = (c) =>
    cycles.some(
      (x) =>
        x.id !== c.id &&
        x.process === "Annual" &&
        x.status === "Active" &&
        !x.archived,
    );

  // Activate: Employee Master updated + payroll resolved (Annual process, when
  // data is supplied) + no other Annual cycle running + dates set.
  const activateRules = (c) => {
    const r = [];
    const w = statsFor(c);
    if (c.process === "Annual") {
      if (w) {
        const m = missingPay(w);
        r.push(
          rule(
            "Employee Master updated for this cycle",
            !!w.emUpdated,
            w.emUpdated
              ? `${w.emCount} employees · ${w.emNew} new · ${w.emChanged} changed`
              : "Not met: update the Employee Master for this cycle",
            w.emUpdated ? "" : "go-em",
          ),
        );
        r.push(
          rule(
            "Payroll differences resolved or ignored",
            !!w.emUpdated && m === 0,
            !w.emUpdated
              ? "Not met: update the Employee Master first"
              : m === 0
                ? w.payIgnored
                  ? `All clear · ${w.payIgnored} ignored in Change list & Mismatch`
                  : `All ${w.emCount} employees have payroll data`
                : `Not met: ${m} employees have no payroll data — resolve or ignore them in Change list & Mismatch`,
            w.emUpdated && m > 0 ? "go-mm" : "",
          ),
        );
      }
      const other = otherAnnualRunning(c);
      r.push(
        rule(
          "No other cycle on the Annual process running",
          !other,
          other
            ? "Not met: another cycle on the Annual process is running"
            : "Met",
        ),
      );
    }
    const dOk = !!(c.effective && c.start && c.end && c.end > c.start);
    r.push(
      rule(
        "Dates set",
        dOk,
        dOk
          ? `Effective ${formatDate(c.effective)} · Start ${formatDate(c.start)} · Close ${formatDate(c.end)}`
          : "Effective, start and close dates are required; close must be after start",
      ),
    );
    return r;
  };

  /* ---------------- mutations (existing API) ---------------- */

  const mutateCycle = async (resource, body, successTitle, successMessage) => {
    if (!canManageCycles) {
      showBanner(
        "Permission denied",
        "HR role is required to administer appraisal cycles.",
        true,
      );
      return false;
    }
    setSaving(true);
    try {
      await payrollCycleRequest(resource, { method: "POST", body });
    } catch (error) {
      showBanner("Unable to save appraisal cycle", error.message, true);
      setSaving(false);
      return false;
    }
    try {
      await loadData();
    } catch (error) {
      setRefreshError(
        `The change was saved, but the latest data could not be refreshed: ${error.message}`,
      );
    }
    setSaving(false);
    showBanner(successTitle, successMessage);
    return true;
  };

  const snapshot = (items) => items.map((x) => `${x.label} ${x.n}`).join(", ");

  const runStep = async (c, kind, remark, pendingSnap) => {
    let ok = false;
    if (kind === "activate")
      ok = await mutateCycle(
        `cycles/status/${c.id}`,
        { status: "Active" },
        "Cycle activated",
        `${c.name} is now Active.`,
      );
    else if (kind === "close")
      ok = await mutateCycle(
        `cycles/status/${c.id}`,
        { status: "Closed" },
        "Cycle closed",
        `${c.name} is now Closed.`,
      );
    else if (kind === "reopen")
      ok = await mutateCycle(
        `cycles/status/${c.id}`,
        { status: "Active" },
        "Cycle reopened",
        `${c.name} is Active again.`,
      );
    else if (kind === "archive")
      ok = await mutateCycle(
        `cycles/archive/${c.id}`,
        { archived: true },
        "Cycle archived",
        `${c.name} was archived.`,
      );
    else if (kind === "delete")
      ok = await mutateCycle(
        `cycles/delete/${c.id}`,
        {},
        "Cycle deleted",
        `${c.name} was deleted.`,
      );

    const label = {
      activate: "Activate",
      close: "Close",
      archive: "Archive",
      reopen: "Reopen",
    }[kind];
    const text = [
      pendingSnap ? `Pending at that time: ${pendingSnap}` : "",
      remark ? `Remark: ${remark}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (ok && label && text) {
      await mutateCycle(
        `cycles/remarks/${c.id}`,
        { remarks: `${c.remarks ? c.remarks + " | " : ""}${label}: ${text}` },
        "Remark saved",
        `Your remark was added to ${c.name}.`,
      );
    }
    return ok;
  };

  const openConfirm = (kind, cycle) => {
    setConfirmRemark("");
    setModalError("");
    setConfirm({ kind, cycle });
  };

  const submitConfirm = async () => {
    const { kind, cycle } = confirm;
    if (kind === "activate" && !allOk(activateRules(cycle))) {
      setModalError("These checks are not met.");
      return;
    }
    if (kind === "generate") {
      if (!onGenerateSheet) {
        setModalError("Generate Appraisal Sheet is not connected yet.");
        return;
      }
      setSaving(true);
      try {
        await onGenerateSheet(cycle);
        showBanner(
          "Appraisal Sheet generated",
          `${cycle.name}: sheet created.`,
        );
        setConfirm(null);
      } catch (error) {
        setModalError(error?.message || "Unable to generate the sheet.");
      } finally {
        setSaving(false);
      }
      return;
    }
    const items =
      (kind === "close" || kind === "archive") && cycle.process === "Annual"
        ? pendingList.filter((x) => x.n > 0)
        : [];
    const ok = await runStep(
      cycle,
      kind,
      confirmRemark.trim(),
      snapshot(items),
    );
    if (ok) setConfirm(null);
  };

  const onNextClick = () => {
    const b = nextBtn(current);
    if (b) openConfirm(b.k, current);
  };

  const openEditCycle = (c) => {
    setModalError("");
    setEditCycle(c);
    setEditForm({
      process: c.process,
      effective: c.effective || "",
      start: c.start || "",
      end: c.end || "",
    });
  };

  const saveEditCycle = async () => {
    const f = editForm;
    if (f.process !== "None") {
      if (!f.effective || !f.start || !f.end)
        return setModalError("All three dates are required.");
      if (f.end <= f.start)
        return setModalError("The close date must be after the start date.");
    } else if (!f.effective) {
      return setModalError("The effective date is required.");
    }
    if (
      f.process === editCycle.process &&
      f.effective === editCycle.effective &&
      f.start === editCycle.start &&
      f.end === editCycle.end
    )
      return setModalError("Nothing changed.");
    if (f.process !== editCycle.process && f.process === "Annual") {
      const o = cycles.find(
        (x) =>
          x.id !== editCycle.id &&
          x.process === "Annual" &&
          !x.archived &&
          !isHidden(x),
      );
      if (o)
        return setModalError(
          `${o.name} is already on the Annual process and not archived.`,
        );
    }
    const saved = await mutateCycle(
      `cycles/update/${editCycle.id}`,
      {
        name: editCycle.name,
        process: f.process,
        effective: f.effective,
        start: f.start,
        end: f.end,
      },
      "Cycle updated",
      `${editCycle.name} was updated successfully.`,
    );
    if (saved) setEditCycle(null);
  };

  const openRemarks = (c) => {
    setModalError("");
    setRemarksCycle(c);
    setRemarksText("");
  };

  const saveRemarks = async () => {
    const remarks = remarksText.trim();
    if (!remarks) return setModalError("Enter a remark.");
    if (remarks.length > 10000)
      return setModalError("Remarks cannot exceed 10,000 characters.");
    const saved = await mutateCycle(
      `cycles/remarks/${remarksCycle.id}`,
      { remarks },
      "Remarks updated",
      `${remarksCycle.name} remarks were saved.`,
    );
    if (saved) setRemarksCycle(null);
  };

  const openCancel = (c) => {
    setModalError("");
    setCancelText("");
    setCancelCycle(c);
  };

  const saveCancel = async () => {
    const reason = cancelText.trim();
    if (!reason) return setModalError("A reason is required.");
    const saved = await mutateCycle(
      `cycles/cancel/${cancelCycle.id}`,
      { reason },
      "Cycle cancelled",
      `${cancelCycle.name} was cancelled.`,
    );
    if (saved) setCancelCycle(null);
  };

  const newName = (f) => {
    const base = `${f.type} ${f.year}`;
    const same = cycles.filter(
      (x) =>
        (x.name === base || x.name.startsWith(`${base} (`)) &&
        x.status !== "Cancelled" &&
        x.status !== "Deleted",
    );
    if (f.type === "Exceptional" && same.length)
      return `${base} (${same.length + 1})`;
    return base;
  };

  const createCycle = async () => {
    const f = newForm;
    const name = newName(f);
    if (f.process !== "None") {
      if (!f.effective || !f.start || !f.end)
        return setModalError(
          "Effective, start and close dates are all required.",
        );
      if (f.end <= f.start)
        return setModalError("The close date must be after the start date.");
    } else if (!f.effective) {
      return setModalError("The effective date is required.");
    }
    if (f.remarks.length > 10000)
      return setModalError("Remarks cannot exceed 10,000 characters.");
    if (f.type !== "Exceptional") {
      const dup = cycles.find(
        (x) =>
          x.name === name && x.status !== "Cancelled" && x.status !== "Deleted",
      );
      if (dup) return setModalError(`${name} already exists (ID ${dup.id}).`);
    }
    if (ENFORCE_ONE_OPEN_ANNUAL && f.process === "Annual") {
      const prev = cycles.find(
        (c) => c.process === "Annual" && !c.archived && !isHidden(c),
      );
      if (prev)
        return setModalError(
          `Archive ${prev.name} first. No new cycle on the Annual process can be set up until the previous one is archived.`,
        );
    }
    const saved = await mutateCycle(
      "cycles/create",
      {
        name,
        type: f.type,
        process: f.process,
        effective: f.effective,
        start: f.start,
        end: f.end,
        remarks: f.remarks.trim(),
      },
      "Cycle created",
      `${name} was set up (${procLabel(f.process)}).`,
    );
    if (saved) {
      setType(f.type);
      setNewCycleOpen(false);
      setNewForm(blankNew);
    }
  };

  /* ---------------- navigation ---------------- */

  const navTo = (id) => {
    const tabKey = NAV_TAB[id];
    if (tabKey && onNavigate) return onNavigate(tabKey);
    showBanner("Not connected", "This step is not linked to a screen yet.");
  };

  const checkAct = (id, c) => {
    if (id === "gen") return openConfirm("generate", c);
    navTo(id);
  };

  /* ---------------- steps ---------------- */

  const stepRows = (c) => {
    const w = statsFor(c);
    const act = c.status === "Active" || c.status === "Closed" || c.archived;
    const closed = c.status === "Closed" || c.archived;
    const gen = !!w?.sheetGenerated;
    const m = w ? missingPay(w) : 0;
    const L = w?.letters || { gen: false, toSend: 0, sent: 0, dropped: 0 };
    const row = (g, id, title, sub, state, acts = []) => ({
      g,
      id,
      title,
      sub,
      state,
      acts,
    });

    const emSub = w
      ? w.emUpdated
        ? `${w.emCount} employees · ${w.emNew} new · ${w.emChanged} changed`
        : "Not updated for this cycle"
      : "Update the Employee Master for this cycle";
    const paySub = w
      ? w.emUpdated
        ? `${(w.payHave || 0) + (w.payIgnored || 0)} of ${w.emCount} employees${m ? ` · ${m} without payroll data` : ""}${w.payIgnored ? ` · ${w.payIgnored} ignored` : ""}`
        : "Update the Employee Master first"
      : "Upload payroll data and resolve differences";

    return [
      row(
        "Upcoming",
        "su",
        "Set up cycle",
        `${c.name} · effective ${formatDate(c.effective)} · start ${formatDate(c.start)} · close ${formatDate(c.end)}`,
        "ok",
      ),
      row(
        "Upcoming",
        "em",
        "Employee Master",
        emSub,
        w ? (w.emUpdated ? "ok" : "wn") : "pd",
        [
          { l: "Open differences ›", id: "go-cl" },
          { l: "Upload ›", id: "go-up-em" },
        ],
      ),
      row(
        "Upcoming",
        "pay",
        "Payroll",
        paySub,
        w ? (!w.emUpdated || m ? "wn" : "ok") : "pd",
        [
          { l: "Open Mismatch ›", id: "go-mm", link: true },
          { l: "Upload ›", id: "go-up-pay" },
        ],
      ),
      row(
        "Active",
        "el",
        "Eligibility",
        act
          ? w?.eligible != null
            ? `${w.eligible} eligible of ${w.emCount} · New and Changed flagged`
            : "Eligibility List runs when the cycle is activated"
          : "Runs when the cycle is activated",
        act ? "ok" : "lk",
        act ? [{ l: "Open ›", id: "go-el" }] : [],
      ),
      row(
        "Active",
        "dl",
        "Delegation",
        act
          ? "Default: Tech ED is the Comp Manager · Delegation changes it"
          : "Available after Activate",
        act ? "ok" : "lk",
        act ? [{ l: "Open ›", id: "go-dl" }] : [],
      ),
      row(
        "Active",
        "fr",
        "Feedback and Rating",
        act
          ? "Upload as the data comes in · repeat any time · not required for any other step"
          : "Available after Activate",
        act ? "pd" : "lk",
        act ? [{ l: "Upload ›", id: "go-up-fr" }] : [],
      ),
      row(
        "Active",
        "gn",
        "Generate Appraisal Sheet",
        gen
          ? `${w.sheetRows ?? ""} rows generated`
          : act
            ? "Not generated · nothing blocks this step"
            : "Available after Activate",
        gen ? "ok" : act ? "wn" : "lk",
        act && !gen ? [{ l: "Generate", id: "gen" }] : [],
      ),
      row(
        "Active",
        "ap",
        "Appraisal",
        gen ? "Appraisal Sheet · Detail screen" : "Available after Generate",
        gen ? "pd" : "lk",
        gen ? [{ l: "Open ›", id: "go-ap" }] : [],
      ),
      row(
        "Active",
        "lt",
        "Letters",
        !gen
          ? "Available after Generate"
          : !L.gen
            ? "Annual letters not generated yet"
            : `${L.toSend} To send · ${L.sent} Sent · ${L.dropped} Dropped`,
        !gen ? "lk" : L.gen && L.toSend === 0 ? "ok" : "wn",
        gen ? [{ l: "Open ›", id: "go-lt" }] : [],
      ),
      row(
        "Closed",
        "cr",
        "Corrections",
        closed
          ? "Open until the cutoff date set in HR Config · reason required · audited"
          : "Available after Close",
        closed ? "pd" : "lk",
        closed ? [{ l: "Open ›", id: "go-ap" }] : [],
      ),
    ];
  };
  const ICON = { ok: "✓", wn: "!", lk: "🔒", pd: "●" };

  /* ---------------- panel helpers ---------------- */

  const setPW = (w) => setPanelW(Math.max(300, Math.min(720, w)));

  const startResize = (e) => {
    e.preventDefault();
    dragRef.current = { x: e.clientX, w: wide ? 640 : panelW };
    const move = (ev) => {
      if (!dragRef.current) return;
      setWide(false);
      setPW(dragRef.current.w + (dragRef.current.x - ev.clientX));
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setPanelW((w) => {
        try {
          localStorage.setItem("cycle_panel_w", String(w));
        } catch {
          /* ignore */
        }
        return w;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const toggleFold = (f) => {
    setFold(f);
    try {
      localStorage.setItem("cycle_panel_fold", f ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const onNotes = (v) => {
    setNoteText(v);
    try {
      localStorage.setItem("cycle_notes", v);
    } catch {
      /* ignore */
    }
  };

  const cycleAudit = useMemo(
    () => audit.filter((a) => a.cycleId === sel),
    [audit, sel],
  );
  const isStep = (a) =>
    /(activ|clos|archiv|reopen|status|generat)/i.test(a.action || "");

  /* ---------------- render pieces ---------------- */

  const stTagClass = (c) =>
    ({ Active: "g1", Upcoming: "i", Open: "i", Closed: "a", Archived: "v" })[
      statusOf(c)
    ] || "gr";

  const ruleRows = (rs) =>
    rs.map((x, i) => (
      <div key={i} className={`acx-vr ${x.kind}`}>
        <span className="lb">{x.label}</span>
        <span className="rs">
          {x.kind === "ok" ? "✓ " : "✗ "}
          {x.txt}
        </span>
        {x.act && !x.ok && (
          <button
            type="button"
            className="acx-btn link"
            onClick={() => navTo(x.act)}
          >
            Open ›
          </button>
        )}
      </div>
    ));

  const renderMenu = (c) => {
    const st = statusOf(c);
    const w = statsFor(c);
    const editable = ["Upcoming", "Active", "Closed", "Open"].includes(st);
    const canCancel =
      ["Upcoming", "Active", "Open"].includes(st) && !w?.letters?.gen;
    const canDel =
      ["Upcoming", "Open"].includes(st) &&
      !(w && (w.emUpdated || (w.payHave || 0) > 0));
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="acx-btn sm"
            disabled={saving}
            onClick={() => setSel(c.id)}
          >
            Actions ▾
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuItem
            disabled={saving || !editable}
            onSelect={() => openEditCycle(c)}
          >
            Edit dates
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={saving || st === "Deleted"}
            onSelect={() => openRemarks(c)}
          >
            Remarks
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={saving || !canCancel}
            onSelect={() => openCancel(c)}
          >
            Cancel cycle
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={saving || !canDel}
            className="text-red-600 focus:text-red-600"
            onSelect={() => openConfirm("delete", c)}
          >
            Delete cycle
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={saving || st !== "Closed"}
            onSelect={() => openConfirm("reopen", c)}
          >
            Reopen (Closed → Active)
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={saving || st !== "Closed"}
            onSelect={() => openConfirm("archive", c)}
          >
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderGrid = () => (
    <>
      <div className="acx-gwrap">
        <table className="acx-g">
          <colgroup>
            {[70, 150, 100, 120, 120, 120, 100, 110, 110].map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th>ID</th>
              <th>Cycle</th>
              <th>Process</th>
              <th>Effective date</th>
              <th>Start date</th>
              <th>Close date</th>
              <th>Status</th>
              <th>Next</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="acx-empty">No {type} cycles match.</div>
                </td>
              </tr>
            )}
            {pageRows.map((c) => {
              const nb = nextBtn(c);
              return (
                <tr
                  key={c.id}
                  className={`${c.id === sel ? "cur " : ""}${isHidden(c) ? "dim" : ""}`}
                  onClick={() => setSel(c.id)}
                >
                  <td className="rl" title={String(c.id)}>
                    {c.id}
                  </td>
                  <td title={c.name}>{c.name}</td>
                  <td>
                    <span className="acx-tag pr">{procLabel(c.process)}</span>
                  </td>
                  <td>{formatDate(c.effective)}</td>
                  <td>{formatDate(c.start)}</td>
                  <td>{formatDate(c.end)}</td>
                  <td>
                    <span className={`acx-tag ${stTagClass(c)}`}>
                      {statusOf(c)}
                    </span>
                  </td>
                  <td>
                    {nb ? (
                      <b>{nb.name}</b>
                    ) : c.archived ? (
                      <span className="acx-mut">Done</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {canManageCycles ? renderMenu(c) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="acx-pg">
        <span>Rows per page</span>
        <select
          value={size}
          onChange={(e) => {
            setSize(Number(e.target.value));
            setPage(1);
          }}
        >
          {[5, 10, 20].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <span>
          {gridRows.length ? (safePage - 1) * size + 1 : 0}–
          {Math.min(gridRows.length, safePage * size)} of {gridRows.length}
        </span>
        <button
          type="button"
          className="acx-btn sm"
          disabled={safePage <= 1}
          onClick={() => setPage(safePage - 1)}
        >
          ‹
        </button>
        <button
          type="button"
          className="acx-btn sm"
          disabled={safePage >= pages}
          onClick={() => setPage(safePage + 1)}
        >
          ›
        </button>
      </div>
    </>
  );

  const renderCards = (c) => {
    if (!c) return null;
    const nb = nextBtn(c);
    const st = statusOf(c);
    const stline = (
      <div className="acx-stl">
        {["Upcoming", "Active", "Closed", "Archived"].map((s, i, a) => {
          const idx = a.indexOf(st);
          const cls = st === s ? "s on" : idx > -1 && i < idx ? "s dn" : "s";
          return (
            <span key={s}>
              <span className={cls}>{s}</span>
              {i < 3 && <span className="ar"> → </span>}
            </span>
          );
        })}
      </div>
    );

    let left;
    if (st === "Cancelled") {
      left = (
        <>
          <div className="top">
            <span className="sl">Cycle</span>
          </div>
          <div className="big" style={{ color: "var(--muted)" }}>
            Cancelled
          </div>
          <div className="mut2">
            Stopped with the reason: <b>{c.cancelReason || "—"}</b>. Data is
            kept; the cycle is never archived and cannot be reopened.
          </div>
        </>
      );
    } else if (st === "Deleted") {
      left = (
        <>
          <div className="top">
            <span className="sl">Cycle</span>
          </div>
          <div className="big" style={{ color: "var(--muted)" }}>
            Deleted
          </div>
          <div className="mut2">
            This cycle was removed. Its ID is never reused.
          </div>
        </>
      );
    } else if (c.archived) {
      left = (
        <>
          <div className="top">
            <span className="sl">Status</span>
            <span className="acx-mut">
              {procLabel(c.process)}
              {c.process === "None" ? "" : " process"}
            </span>
          </div>
          <div className="big" style={{ color: "var(--green)" }}>
            Archived
          </div>
          {stline}
          <div className="mut2">
            Final values are in Compensation History. The cycle is read-only and
            cannot be reopened.
          </div>
        </>
      );
    } else if (c.process === "None") {
      left = (
        <>
          <div className="top">
            <span className="sl">Process</span>
          </div>
          <div className="big" style={{ color: "var(--muted)" }}>
            No process
          </div>
          <div className="mut2">
            This cycle is only a label for uploads (for example payroll). It has
            no status line, no steps and no button. It stays Open until it is
            cancelled.
          </div>
        </>
      );
    } else if (nb) {
      const chk = nb.k === "activate" ? activateRules(c) : [];
      const can = allOk(chk);
      left = (
        <>
          <div className="top">
            <span className="sl">Status</span>
            <span className="acx-mut">
              {c.process} process · Next: {nb.name} → {nb.to}
            </span>
          </div>
          <div className="big">{c.status}</div>
          <div className="mut2">
            {c.process === "Annual" ? SDESC[c.status] : EDESC[c.status]}
          </div>
          {stline}
          <div className="h3">{nb.name}</div>
          <div className="mut2">{BDESC[nb.k]}</div>
          {chk.length > 0 && <div className="acx-vl">{ruleRows(chk)}</div>}
          <div className="foot">
            <span className="tip">
              {chk.length
                ? can
                  ? `All checks are met. The ${nb.name} button is at the top.`
                  : `The ${nb.name} button at the top stays grey until the checks are met.`
                : "Nothing blocks this. Pending items are shown before you confirm. The button is at the top."}
            </span>
          </div>
        </>
      );
    } else {
      left = null;
    }

    let right;
    if (c.process === "Annual" && !c.archived && !isHidden(c)) {
      let grp = "";
      right = (
        <>
          <div className="top">
            <span className="sl">Steps</span>
            <span className="acx-mut">Any order · repeat any time</span>
          </div>
          {stepRows(c).map((r) => {
            const head = r.g !== grp ? <div className="ckg">{r.g}</div> : null;
            grp = r.g;
            return (
              <div key={r.id}>
                {head}
                <div className={`ck ${r.state}`}>
                  <span className="ic">{ICON[r.state]}</span>
                  <span className="tx">
                    <b>{r.title}</b>
                    <span>{r.sub}</span>
                  </span>
                  <span className="ac">
                    {r.acts.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={a.link ? "acx-btn link" : "acx-btn sm"}
                        onClick={() => checkAct(a.id, c)}
                      >
                        {a.l}
                      </button>
                    ))}
                  </span>
                </div>
              </div>
            );
          })}
        </>
      );
    } else if (c.process === "Exceptional" && !c.archived && !isHidden(c)) {
      right = (
        <>
          <div className="top">
            <span className="sl">Exceptional process</span>
          </div>
          <div className="mut2">
            None of the Annual steps apply. HR sets it up here and moves it
            manually through Active, Closed and Archived. The rows are worked on
            the Exceptional grid. An employee is released only when the
            Exceptional cycle is archived.
          </div>
        </>
      );
    } else {
      right = (
        <>
          <div className="top">
            <span className="sl">Steps</span>
          </div>
          <div className="mut2">No steps for this cycle.</div>
        </>
      );
    }
    return (
      <div className="acx-twoc">
        <div className="acx-sc cur">{left}</div>
        <div className="acx-sc chk">{right}</div>
      </div>
    );
  };

  const renderPanel = () => {
    const c = current;
    if (!c) return null;
    const chips = (list, curKey, key) => (
      <div className="acx-pk">
        {list.map(([k, l]) => (
          <button
            key={k}
            type="button"
            className={`pc${k === curKey ? " on" : ""}`}
            onClick={() => setPk((p) => ({ ...p, [key]: k }))}
          >
            {l}
          </button>
        ))}
      </div>
    );
    let pick = null,
      ctx = "",
      body = null,
      foot = "Read-only · information only · nothing here changes the cycle";

    if (notes) {
      body = (
        <>
          <div className="ckg">Notes</div>
          <textarea
            className="acx-ta"
            style={{ minHeight: 160 }}
            placeholder="Capture your comments here"
            value={noteText}
            onChange={(e) => onNotes(e.target.value)}
          />
          <div className="acx-hint">
            Not mandatory. Saved in this browser. Press ⓘ again to go back.
          </div>
        </>
      );
      foot = "Notes stay in this browser";
    } else if (tab === "chg") {
      const short = {
        rt: "Ratings",
        lt: "Letters",
        co: "Corrections",
        cl: "Change list",
        mm: "Mismatch",
        el: "Eligibility",
      };
      const items = c.process === "Annual" && !c.archived ? pendingList : [];
      const selKey =
        pk.chg !== "all" && !items.some((x) => x.k === pk.chg) ? "all" : pk.chg;
      const tot = items.reduce((a, x) => a + (x.n || 0), 0);
      const nz = items.filter((x) => x.n).length;
      if (items.length)
        pick = chips(
          [
            ["all", `All ${tot}`],
            ...items.map((x) => [x.k, `${short[x.k] || x.label} ${x.n || 0}`]),
          ],
          selKey,
          "chg",
        );
      ctx = items.length
        ? tot
          ? `${tot} pending across ${nz} ${nz === 1 ? "item" : "items"}`
          : "Nothing pending on this cycle"
        : "Pending items start once the cycle is Active";
      if (!items.length) {
        body = (
          <div className="acx-co in">
            <span className="tg">Pending</span>
            <div className="ln">
              {c.archived
                ? "Cycle is archived"
                : c.process === "Annual"
                  ? "Nothing to show yet"
                  : "Not used on this process"}
            </div>
            <div className="m1">
              {c.process === "Annual" && c.status === "Upcoming"
                ? "Pending items start to show once the Employee Master is updated and the cycle is activated."
                : c.process !== "Annual" && !c.archived
                  ? "Pending items belong to the Annual process."
                  : ""}
            </div>
          </div>
        );
      } else {
        body = (
          <>
            <div className={`acx-co fx ${tot ? "am" : "gn"}`}>
              <div className="cb">
                <span className="tg">{tot ? "Pending" : "All clear"}</span>
                <div className="ln">
                  {tot ? `${tot} to follow up` : "✓ Nothing pending"}
                </div>
                <div className="m1">
                  Information only. Checks exist only at Activate (Employee
                  Master and payroll).
                </div>
              </div>
              <button
                type="button"
                className="acx-btn sm"
                onClick={() => navTo("go-dashboard")}
              >
                Open dashboard ›
              </button>
            </div>
            {items
              .filter((x) => selKey === "all" || x.k === selKey)
              .map((x) => (
                <div key={x.k} className="acx-cd cdr">
                  <div className="cdb">
                    <div className="hd">{x.label}</div>
                    <div className="bg">{x.n ? `${x.n} pending` : "None"}</div>
                    <div className="m1">{x.sub}</div>
                  </div>
                  <button
                    type="button"
                    className="acx-btn sm"
                    onClick={() => navTo(PEND_NAV[x.k])}
                  >
                    Open ›
                  </button>
                </div>
              ))}
          </>
        );
      }
      if (selKey === "all") {
        const done = cycleAudit.filter(isStep);
        body = (
          <>
            {body}
            <div className="ckg">Done on this cycle</div>
            {done.length ? (
              done.map((a) => (
                <div key={a.id} className="acx-au">
                  <b>{a.action}</b>
                  <div className="m1">
                    {a.changedBy} · {a.changedAt}
                  </div>
                </div>
              ))
            ) : (
              <div className="acx-mut">Nothing done yet.</div>
            )}
          </>
        );
      }
    } else {
      const ns = cycleAudit.filter(isStep).length;
      pick = chips(
        [
          ["all", `All ${cycleAudit.length}`],
          ["steps", `Steps ${ns}`],
          ["other", `Other ${cycleAudit.length - ns}`],
        ],
        pk.aud,
        "aud",
      );
      const list = cycleAudit.filter(
        (a) =>
          pk.aud === "all" || (pk.aud === "steps" ? isStep(a) : !isStep(a)),
      );
      ctx = cycleAudit.length
        ? `${cycleAudit.length} ${cycleAudit.length === 1 ? "action" : "actions"} on this cycle`
        : "No actions yet";
      body = (
        <>
          {cycleAudit.length ? (
            <div className="acx-co in">
              <span className="tg">Latest</span>
              <div className="ln">{cycleAudit[0].action}</div>
              <div className="m1">
                {cycleAudit[0].changedBy} · {cycleAudit[0].changedAt}
              </div>
            </div>
          ) : (
            <div className="acx-co in">
              <span className="tg">Audit</span>
              <div className="ln">No actions yet</div>
              <div className="m1">
                Every step, remark and date change is listed here.
              </div>
            </div>
          )}
          {list.map((a) => (
            <div key={a.id} className="acx-cd">
              <div className="hd">{a.action}</div>
              <div>{a.details || a.remarks || "—"}</div>
              <div className="m1">
                {a.changedBy} · {a.changedAt}
              </div>
            </div>
          ))}
          {!list.length && cycleAudit.length > 0 && (
            <div className="acx-mut">Nothing under this picker.</div>
          )}
        </>
      );
    }

    return (
      <div
        className={`acx-pane acx-panel${tab === "aud" && !notes ? " aud" : ""}`}
        style={{ width: wide ? 640 : panelW }}
      >
        <div
          className="acx-grip"
          onMouseDown={startResize}
          title="Drag to resize"
        />
        <div className="acx-phw">
          <div className="who">
            <b>{c.name}</b> · {c.id} · {statusOf(c)} · {procLabel(c.process)}
          </div>
          <button
            type="button"
            className="acx-ic2"
            title="Notes"
            aria-label="Notes"
            style={{ background: notes ? "var(--tt)" : "" }}
            onClick={() => setNotes((v) => !v)}
          >
            ⓘ
          </button>
          <button
            type="button"
            className="acx-ic2"
            aria-label="Expand"
            title={wide ? "Normal width" : "Expand"}
            onClick={() => setWide((v) => !v)}
          >
            {wide ? "⤡" : "⤢"}
          </button>
          <button
            type="button"
            className="acx-ic2"
            aria-label="Fold the panel"
            title="Fold the panel"
            onClick={() => toggleFold(true)}
          >
            ✕
          </button>
        </div>
        <div className="acx-tabs">
          <button
            type="button"
            className={`tb${!notes && tab === "chg" ? " on" : ""}`}
            onClick={() => {
              setNotes(false);
              setTab("chg");
            }}
          >
            Pending
          </button>
          {canAudit && (
            <button
              type="button"
              className={`tb aud${!notes && tab === "aud" ? " on" : ""}`}
              onClick={() => {
                setNotes(false);
                setTab("aud");
              }}
            >
              Audit
            </button>
          )}
        </div>
        {pick}
        {ctx && <div className="acx-cx">{ctx}</div>}
        <div className="acx-pbody">{body}</div>
        <div className="acx-pfoot">{foot}</div>
      </div>
    );
  };

  /* ---------------- modals ---------------- */

  const renderConfirm = () => {
    if (!confirm) return null;
    const { kind, cycle: c } = confirm;
    const close = () => setConfirm(null);
    const isStepKind = kind === "close" || kind === "archive";
    const items =
      isStepKind && c.process === "Annual"
        ? pendingList.filter((x) => x.n > 0)
        : [];
    const has = items.length > 0;
    const verb = {
      activate: "Activate",
      close: "Close",
      archive: "Archive",
      reopen: "Reopen",
      delete: "Delete cycle",
      generate: "Generate",
    }[kind];
    const okLabel = isStepKind && has ? `${verb} anyway` : verb;
    const noLabel =
      isStepKind && has ? `Don't ${verb.toLowerCase()} yet` : "Cancel";
    const intro =
      kind === "reopen"
        ? "Switch this Closed cycle back to Active. Only the read-only lock is lifted; nothing else changes."
        : kind === "delete"
          ? `Delete this cycle? It has nothing in it. The Cycle ID ${c.id} is never reused.`
          : BDESC[kind];
    const title =
      kind === "generate"
        ? `Generate Appraisal Sheet — ${c.name}`
        : `${verb} — ${c.name}`;
    return (
      <Modal
        title={title}
        onClose={close}
        error={modalError}
        footer={
          <>
            <button
              type="button"
              className="acx-btn"
              disabled={saving}
              onClick={close}
            >
              {noLabel}
            </button>
            <button
              type="button"
              className="acx-btn p"
              disabled={saving}
              onClick={submitConfirm}
            >
              {saving ? "Saving…" : okLabel}
            </button>
          </>
        }
      >
        <div className="mut2">{intro}</div>
        {kind === "activate" && (
          <div className="acx-vl" style={{ marginTop: 8 }}>
            {ruleRows(activateRules(c))}
          </div>
        )}
        {isStepKind &&
          (has ? (
            <div style={{ marginTop: 8 }}>
              <div className="mut2">
                Still pending. This is for your information; nothing here stops
                you.
              </div>
              {items.map((x) => (
                <div key={x.k} className="acx-pl">
                  <span>
                    <b>{x.label}</b>
                    <div className="m1">{x.sub}</div>
                  </span>
                  <b className="n">{x.n}</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="mut2" style={{ marginTop: 6 }}>
              Nothing is pending.
            </div>
          ))}
        {(isStepKind || kind === "activate" || kind === "reopen") && (
          <>
            <label className="acx-fl">Remark (optional)</label>
            <textarea
              className="acx-ta"
              value={confirmRemark}
              onChange={(e) => setConfirmRemark(e.target.value)}
            />
            <div className="acx-hint">
              Your choice and the remark are added to the cycle remarks and
              audited.
            </div>
          </>
        )}
      </Modal>
    );
  };

  const setupHint = {
    Annual:
      "Annual process: status line with steps. Only one cycle on this process runs at a time.",
    Exceptional:
      "Exceptional process: HR moves it manually through Active, Closed and Archived; rows go to the Exceptional grid.",
    None: "No process: the cycle is only a label for uploads (for example payroll). It has no steps.",
  };

  /* ---------------- main render ---------------- */

  const nb = nextBtn(current);
  const nextOk = !nb || nb.k !== "activate" || allOk(activateRules(current));
  const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];

  return (
    <div className="acx">
      <style>{CSS}</style>

      {loading && <div className="acx-empty">Loading appraisal cycles…</div>}
      {!loading && loadError && (
        <div className="acx-banner error" role="alert">
          <AlertCircle size={17} />
          <div>
            <strong>Unable to load appraisal cycle data</strong>
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            className="acx-btn"
            onClick={() => {
              setLoading(true);
              loadData()
                .catch((e) => setLoadError(e.message))
                .finally(() => setLoading(false));
            }}
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !loadError && refreshError && (
        <div className="acx-banner error" role="alert">
          <AlertCircle size={17} />
          <div>
            <strong>Data may be out of date</strong>
            <span>{refreshError}</span>
          </div>
          <button
            type="button"
            className="acx-btn"
            onClick={() =>
              loadData().catch((e) =>
                setRefreshError(
                  `The latest data could not be refreshed: ${e.message}`,
                ),
              )
            }
          >
            Retry
          </button>
        </div>
      )}
      {!canManageCycles && !loading && !loadError && (
        <div className="acx-banner">
          <div>
            <strong>Read-only access</strong>
            <span>HR role is required to administer appraisal cycles.</span>
          </div>
        </div>
      )}
      {banner && (
        <div className={`acx-banner ${banner.error ? "error" : ""}`}>
          {banner.error ? (
            <AlertCircle size={17} />
          ) : (
            <CheckCircle2 size={17} />
          )}
          <div>
            <strong>{banner.title}</strong>
            <span>{banner.body}</span>
          </div>
          <button
            type="button"
            className="close"
            onClick={() => setBanner(null)}
          >
            ×
          </button>
        </div>
      )}

      {!loading && !loadError && (
        <div className="acx-work">
          <div className="acx-pane" style={{ flex: 1 }}>
            <div className="acx-ph">
              <span className="tt">Appraisal Cycle</span>
              <span className="nt">
                Cycle ID is stamped on every row of the cycle
              </span>
            </div>
            <div className="acx-pb">
              <div className="acx-tbar">
                {canManageCycles && (
                  <button
                    type="button"
                    className="acx-btn p"
                    disabled={saving}
                    onClick={() => {
                      setModalError("");
                      setNewForm({
                        ...blankNew,
                        type,
                        process: DEFAULT_PROCESS[type],
                      });
                      setNewCycleOpen(true);
                    }}
                  >
                    + SET UP CYCLE
                  </button>
                )}
                <input
                  type="text"
                  className="acx-srch"
                  placeholder="Search cycles"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                />
                <span style={{ flex: 1 }} />
                <span
                  className={`acx-swt${showHidden ? " on" : ""}`}
                  role="switch"
                  aria-checked={showHidden}
                  onClick={() => {
                    setShowHidden((v) => !v);
                    setPage(1);
                  }}
                >
                  <span className="sw" />
                  <span>Show Cancelled / Deleted</span>
                </span>
                <span className="acx-seln">
                  {current
                    ? `${current.name} (${current.id}) · ${statusOf(current)}`
                    : "No cycle selected"}
                </span>
                {canManageCycles && nb && (
                  <button
                    type="button"
                    className="acx-btn cta"
                    disabled={saving || !nextOk}
                    title={nextOk ? "" : "Checks not met — see the Status card"}
                    onClick={onNextClick}
                  >
                    {nb.name}
                  </button>
                )}
              </div>

              <div className="acx-ttabs" role="tablist">
                {TYPES.map((t) => {
                  const n = typeCount(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      data-ty={t}
                      className={`ty${type === t ? " on" : ""}`}
                      title={`${n.open} open of ${n.total} total`}
                      onClick={() => {
                        setType(t);
                        setPage(1);
                      }}
                    >
                      {t}
                      <span className="cnt">
                        {n.open} / {n.total}
                      </span>
                    </button>
                  );
                })}
              </div>

              {renderGrid()}
              <div className="acx-note">
                Row Actions: Edit dates · Remarks · Cancel (before Letters are
                generated) · Delete (only a cycle with nothing in it) · Reopen
                and Archive (only a Closed cycle). Every cycle is set up here;
                the Process (Annual, Exceptional or No process) is chosen at set
                up and locked at Activate.
              </div>
              {renderCards(current)}
            </div>
          </div>
          {!fold && renderPanel()}
        </div>
      )}
      {fold && (
        <div className="acx-foldtab" onClick={() => toggleFold(false)}>
          Pending ›
        </div>
      )}

      {renderConfirm()}

      {editCycle && (
        <Modal
          title={`Edit — ${editCycle.name}`}
          onClose={() => setEditCycle(null)}
          error={modalError}
          footer={
            <>
              <button
                type="button"
                className="acx-btn"
                disabled={saving}
                onClick={() => setEditCycle(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="acx-btn p"
                disabled={saving}
                onClick={saveEditCycle}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          {(() => {
            const locked = !["Upcoming", "Open"].includes(statusOf(editCycle));
            return (
              <>
                <label className="acx-fl">Process</label>
                <select
                  style={{ width: "100%" }}
                  disabled={saving || locked}
                  value={editForm.process}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, process: e.target.value }))
                  }
                >
                  {PROCESSES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                {locked && (
                  <div className="acx-hint">
                    The process is locked once the cycle is activated.
                  </div>
                )}
              </>
            );
          })()}
          <label className="acx-fl">Effective date</label>
          <input
            type="date"
            style={{ width: "100%" }}
            disabled={saving}
            value={editForm.effective}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, effective: e.target.value }))
            }
          />
          <div className="acx-row2">
            <div>
              <label className="acx-fl">Start date</label>
              <input
                type="date"
                disabled={saving}
                value={editForm.start}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, start: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="acx-fl">Close date</label>
              <input
                type="date"
                disabled={saving}
                value={editForm.end}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, end: e.target.value }))
                }
              />
            </div>
          </div>
        </Modal>
      )}

      {remarksCycle && (
        <Modal
          title={`Remarks — ${remarksCycle.name}`}
          onClose={() => setRemarksCycle(null)}
          error={modalError}
          footer={
            <>
              <button
                type="button"
                className="acx-btn"
                disabled={saving}
                onClick={() => setRemarksCycle(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="acx-btn p"
                disabled={saving}
                onClick={saveRemarks}
              >
                {saving ? "Saving…" : "Add remark"}
              </button>
            </>
          }
        >
          <label className="acx-fl">Add remark</label>
          <textarea
            className="acx-ta"
            disabled={saving}
            value={remarksText}
            onChange={(e) => setRemarksText(e.target.value)}
          />
          <div className="acx-hint">
            Remarks are a trail: each one is kept with who and when.
          </div>
          <div className="acx-hist">
            {remarksHistory.map((h, i) => (
              <div key={i} className="h1">
                <div>{h.remarks || "No remarks"}</div>
                <div className="m1">
                  {h.changedBy} · {h.changedAt}
                </div>
              </div>
            ))}
            {!remarksHistory.length && (
              <div className="acx-mut" style={{ padding: "8px 0" }}>
                No remarks yet.
              </div>
            )}
          </div>
        </Modal>
      )}

      {cancelCycle && (
        <Modal
          title={`Cancel ${cancelCycle.name}`}
          onClose={() => setCancelCycle(null)}
          error={modalError}
          footer={
            <>
              <button
                type="button"
                className="acx-btn"
                disabled={saving}
                onClick={() => setCancelCycle(null)}
              >
                Back
              </button>
              <button
                type="button"
                className="acx-btn p"
                disabled={saving}
                onClick={saveCancel}
              >
                {saving ? "Saving…" : "Cancel cycle"}
              </button>
            </>
          }
        >
          <div className="mut2">
            The cycle is stopped. Its data and your reason are kept; it is never
            archived and cannot be reopened.
          </div>
          <label className="acx-fl">Reason (required)</label>
          <textarea
            className="acx-ta"
            disabled={saving}
            value={cancelText}
            onChange={(e) => setCancelText(e.target.value)}
          />
        </Modal>
      )}

      {newCycleOpen && (
        <Modal
          title="Set up cycle"
          onClose={() => setNewCycleOpen(false)}
          error={modalError}
          footer={
            <>
              <button
                type="button"
                className="acx-btn"
                disabled={saving}
                onClick={() => setNewCycleOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="acx-btn p"
                disabled={saving}
                onClick={createCycle}
              >
                {saving ? "Creating…" : "Set up cycle"}
              </button>
            </>
          }
        >
          <div className="acx-row2">
            <div>
              <label className="acx-fl">Cycle type</label>
              <select
                disabled={saving}
                value={newForm.type}
                onChange={(e) =>
                  setNewForm((f) => ({
                    ...f,
                    type: e.target.value,
                    process: DEFAULT_PROCESS[e.target.value],
                  }))
                }
              >
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="acx-fl">Year</label>
              <select
                disabled={saving}
                value={newForm.year}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, year: Number(e.target.value) }))
                }
              >
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="acx-row2">
            <div>
              <label className="acx-fl">Process</label>
              <select
                disabled={saving}
                value={newForm.process}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, process: e.target.value }))
                }
              >
                {PROCESSES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="acx-fl">Cycle name</label>
              <input type="text" disabled value={newName(newForm)} />
            </div>
          </div>
          <div className="acx-hint">{setupHint[newForm.process]}</div>
          <label className="acx-fl">Effective date</label>
          <input
            type="date"
            style={{ width: "100%" }}
            disabled={saving}
            value={newForm.effective}
            onChange={(e) =>
              setNewForm((f) => ({ ...f, effective: e.target.value }))
            }
          />
          <div className="acx-hint">Picked by HR; there is no default.</div>
          <div className="acx-row2">
            <div>
              <label className="acx-fl">Start date</label>
              <input
                type="date"
                disabled={saving}
                value={newForm.start}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, start: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="acx-fl">Close date</label>
              <input
                type="date"
                disabled={saving}
                value={newForm.end}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, end: e.target.value }))
                }
              />
            </div>
          </div>
          {newForm.process === "None" && (
            <div className="acx-hint">
              Start and close dates are not needed for a cycle with no process.
            </div>
          )}
          <label className="acx-fl">Remarks</label>
          <textarea
            className="acx-ta"
            disabled={saving}
            placeholder="Optional remarks"
            value={newForm.remarks}
            onChange={(e) =>
              setNewForm((f) => ({ ...f, remarks: e.target.value }))
            }
          />
        </Modal>
      )}
    </div>
  );
}

export default AppraisalCycleMasterPage;

/* ============================================================
   STYLES (ported from the reference HTML, scoped under .acx)
   ============================================================ */

const CSS = `
.acx{--navy:#102A43;--active:#27548A;--cta:#2F6FED;--gutter:#D5DFEB;--line:#E5E7EB;--row-line:#F0F1F3;--ink:#111827;--muted:#6B7280;
--hb:#E6EEF8;--hl:#C9D8EC;--odd:#FBFCFE;--even:#F2F5F9;--hover:#EAF2FF;--hi:#DCEBFF;--rowlabel:#EEF3FA;--link:#1559A6;
--green:#15803D;--green-bg:#ECFDF3;--amber:#B7791F;--amber-bg:#FEF6E7;--violet:#5B3FB0;--violet-bg:#ECE7FB;--info:#1D4FA8;--red:#C0392B;--tt:#E8F0FE;
font-family:Manrope,"Segoe UI",Arial,sans-serif;font-size:12.5px;color:var(--ink);width:100%}
.acx *{box-sizing:border-box}
.acx button,.acx input,.acx select,.acx textarea{font-family:inherit;font-size:12.5px;color:inherit}
.acx select,.acx input[type=text],.acx input[type=date],.acx textarea{border:1px solid #D1D5DB;border-radius:6px;padding:6px 9px;background:#fff;outline:none}
.acx select:focus,.acx input:focus,.acx textarea:focus{border-color:var(--active)}
.acx input:disabled,.acx select:disabled{background:#F3F4F6;color:#6B7280}
.acx-ta{width:100%;min-height:70px;resize:vertical}
.acx-work{background:var(--gutter);border-radius:14px;padding:12px;display:flex;gap:12px;align-items:stretch}
.acx-pane{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;min-width:0}
.acx-ph{background:var(--navy);color:#fff;padding:11px 16px;display:flex;align-items:center;gap:10px}
.acx-ph .tt{font-size:16px;font-weight:800}.acx-ph .nt{margin-left:auto;color:#AAB4C0;font-size:11.5px;font-weight:600}
.acx-pb{padding:14px 16px}
.acx-btn{border:1px solid #D1D5DB;border-radius:6px;padding:6px 12px;background:#fff;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.acx-btn:hover{background:#F7F9FC}
.acx-btn.p{background:var(--navy);color:#fff;border-color:var(--navy)}.acx-btn.p:hover{background:#1B3A5B}
.acx-btn.cta{background:var(--cta);color:#fff;border-color:var(--cta);font-weight:800;letter-spacing:.03em;text-transform:uppercase;padding:7px 16px}
.acx-btn:disabled{cursor:not-allowed;color:#B6BCC6;border-color:var(--line);background:#FAFAFB}
.acx-btn.cta:disabled{background:#A9C1F2;border-color:#A9C1F2;color:#fff}
.acx-btn.sm{padding:3px 9px;font-size:11.5px}
.acx-btn.link{border:none;background:none;color:var(--link);padding:0;font-weight:700}
.acx-btn.link:disabled{background:none;color:#B6BCC6}
.acx-tbar{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.acx-srch{width:230px}
.acx-swt{display:inline-flex;align-items:center;gap:7px;color:var(--muted);font-weight:600;cursor:pointer;user-select:none}
.acx-swt .sw{width:30px;height:16px;border-radius:9px;background:#D1D5DB;position:relative;display:inline-block;transition:background .15s}
.acx-swt .sw:after{content:"";position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .15s}
.acx-swt.on .sw{background:#22A06B}.acx-swt.on .sw:after{left:16px}
.acx-seln{color:var(--muted);font-weight:600;font-size:11.5px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acx-ttabs{display:flex;border-bottom:1px solid var(--line);margin:0 0 10px;overflow:auto}
.acx-ttabs .ty{--c:#2F6FED;--t:#E8F0FE;--x:#1D4FA8;border:none;background:none;padding:9px 16px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;display:flex;align-items:center;gap:7px;font-size:13px}
.acx-ttabs .ty:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--c)}
.acx-ttabs .ty .cnt{background:#EEF0F3;color:#4B5563;border-radius:9px;padding:1px 8px;font-size:11px;font-weight:800}
.acx-ttabs .ty.on{color:var(--x);font-weight:800;border-bottom-color:var(--c);background:var(--t)}
.acx-ttabs .ty.on .cnt{background:#fff;color:var(--x);box-shadow:inset 0 0 0 1px var(--c)}
.acx-ttabs .ty[data-ty="Mid-Year"]{--c:#0E8A8A;--t:#E3F5F4;--x:#0B6B6B}
.acx-ttabs .ty[data-ty="Exceptional"]{--c:#6D4FC2;--t:#EFEAFB;--x:#5B3FB0}
.acx-ttabs .ty[data-ty="New Joiner"]{--c:#475569;--t:#EEF1F5;--x:#334155}
.acx-gwrap{border:1px solid var(--hl);border-radius:8px;overflow:auto;max-height:276px}
.acx-g{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed}
.acx-g th{background:var(--hb);color:var(--navy);font-size:11px;font-weight:700;text-align:left;padding:8px;border-bottom:1px solid var(--hl);white-space:nowrap;position:sticky;top:0;z-index:2;overflow:hidden;text-overflow:ellipsis}
.acx-g td{padding:8px;border-bottom:1px solid var(--row-line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.acx-g tbody tr{cursor:pointer}
.acx-g tbody tr:nth-child(odd) td{background:var(--odd)}.acx-g tbody tr:nth-child(even) td{background:var(--even)}
.acx-g tbody tr:hover td{background:var(--hover)}
.acx-g td.rl{background:var(--rowlabel)!important;color:var(--navy);font-weight:700;border-right:1px solid var(--hl)}
.acx-g tbody tr.cur td{background:var(--hi)!important}
.acx-g tbody tr.cur td.rl{background:#CFE0F7!important;box-shadow:inset 3px 0 0 var(--cta)}
.acx-g tbody tr.dim td{color:#9AA3B0}
.acx-empty{padding:22px;text-align:center;color:var(--muted)}
.acx-pg{display:flex;align-items:center;gap:10px;justify-content:flex-end;padding:8px 2px 0;color:var(--muted);font-size:11.5px}
.acx-pg select{padding:3px 6px;font-size:11.5px}
.acx-note{color:var(--muted);font-size:11.5px;margin:8px 2px 0}
.acx-mut{color:var(--muted);font-size:11.5px}
.acx-tag{font-size:10.5px;font-weight:800;border-radius:5px;padding:2px 8px;display:inline-block}
.acx-tag.g1{background:var(--green-bg);color:var(--green)}.acx-tag.a{background:var(--amber-bg);color:var(--amber)}.acx-tag.gr{background:#F3F4F6;color:#6B7280}
.acx-tag.v{background:var(--violet-bg);color:var(--violet)}.acx-tag.i{background:var(--hi);color:var(--info)}.acx-tag.pr{background:#F3F4F6;color:#4B5563}
.acx-twoc{display:flex;gap:12px;margin-top:14px;align-items:stretch}
.acx-sc{flex:1;border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:8px;min-width:0}
.acx-sc.cur{border:2px solid var(--cta);background:#F5F8FF}.acx-sc.chk{border:1px solid var(--line);background:#FAFAFB}
.acx-sc .top{display:flex;align-items:center;gap:10px}.acx-sc .top .acx-mut{margin-left:auto}
.acx-sc .sl{display:inline-block;background:var(--hb);color:var(--navy);border:1px solid var(--hl);border-radius:5px;font-size:10px;font-weight:800;letter-spacing:.07em;padding:3px 8px;text-transform:uppercase}
.acx-sc .big{font-size:20px;font-weight:800;color:var(--cta)}.acx-sc .mut2{color:#4B5563}
.acx-sc .h3{font-size:10.5px;font-weight:800;letter-spacing:.06em;color:var(--muted);margin-top:4px;text-transform:uppercase}
.acx-sc .foot{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:10px;border-top:1px solid var(--line)}
.acx-sc .foot .tip{font-size:11px;color:var(--muted);flex:1}
.acx-stl{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:2px 0 4px}
.acx-stl .s{border:1px solid #D1D5DB;border-radius:16px;padding:5px 14px;background:#fff;font-weight:600;color:#4B5563;display:inline-block}
.acx-stl .s.on{background:var(--active);border-color:var(--active);color:#fff;font-weight:800}
.acx-stl .s.dn{background:var(--green-bg);border-color:#BFE3CB;color:var(--green)}
.acx-stl .ar{color:var(--muted)}
.acx-vl{display:flex;flex-direction:column}
.acx-vr{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--row-line);align-items:flex-start}
.acx-vr:last-child{border-bottom:none}
.acx-vr .lb{flex:0 0 190px;color:#4B5563}.acx-vr .rs{flex:1;font-weight:700}
.acx-vr .acx-btn.link{flex:0 0 auto}
.acx-vr.ok .rs{color:var(--green)}.acx-vr.no .rs{color:var(--red)}
.acx .ckg{font-size:10.5px;font-weight:800;letter-spacing:.07em;color:var(--muted);margin:10px 0 2px;text-transform:uppercase}
.acx .ck{display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid var(--row-line)}
.acx .ck .ic{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex:0 0 22px}
.acx .ck.ok .ic{background:var(--green-bg);color:var(--green)}.acx .ck.wn .ic{background:var(--amber-bg);color:var(--amber)}.acx .ck.lk .ic{background:#F3F4F6;color:#9AA3B0}.acx .ck.pd .ic{background:var(--hi);color:var(--info)}
.acx .ck .tx{flex:1;min-width:0}.acx .ck .tx b{display:block}.acx .ck .tx span{color:var(--muted);font-size:11.5px;display:block}
.acx .ck.lk .tx b,.acx .ck.lk .tx span{color:#9AA3B0}
.acx .ck .ac{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.acx-panel{flex:0 0 auto;display:flex;flex-direction:column;position:relative;border-top:4px solid #2F6FED;--tc:#2F6FED;--tt:#E8F0FE;--tx:#1D4FA8;min-width:300px;max-width:720px}
.acx-panel.aud{border-top-color:#0E8A8A;--tc:#0E8A8A;--tt:#E3F5F4;--tx:#0B6B6B}
.acx-phw{background:#fff;color:var(--navy);border-bottom:1px solid var(--line);padding:8px 10px 8px 16px;display:flex;align-items:center;gap:8px}
.acx-phw .who{flex:1;min-width:0;font-size:12px;color:#374151;line-height:1.35}.acx-phw .who b{color:var(--navy);font-size:13px}
.acx-ic2{flex:0 0 auto;border:1px solid #D1D5DB;background:#fff;border-radius:6px;height:26px;min-width:26px;padding:0 6px;font-size:13px;color:#374151;cursor:pointer}
.acx-ic2:hover{border-color:var(--tc);color:var(--tx)}
.acx-grip{position:absolute;left:0;top:0;bottom:0;width:8px;cursor:ew-resize;z-index:3}
.acx-grip:after{content:"";position:absolute;left:2px;top:50%;width:4px;height:36px;margin-top:-18px;border-radius:3px;background:#D1D5DB}
.acx-grip:hover:after{background:var(--tc)}
.acx-tabs{display:flex;background:#FAFAFB;border-bottom:1px solid var(--line)}
.acx-tabs .tb{flex:1;padding:10px 0;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;display:flex;align-items:center;justify-content:center;gap:6px}
.acx-tabs .tb:before{content:"";width:8px;height:8px;border-radius:50%;background:#2F6FED}
.acx-tabs .tb.aud:before{background:#0E8A8A}
.acx-tabs .tb.on{color:var(--tx);font-weight:800;background:var(--tt);border-bottom-color:var(--tc)}
.acx-pk{display:flex;flex-wrap:wrap;gap:6px;padding:10px 16px 0}
.acx-pk .pc{border:1px solid #D1D5DB;background:#fff;border-radius:14px;font-size:11.5px;padding:3px 10px;cursor:pointer;color:#4B5563}
.acx-pk .pc.on{background:var(--tt);border-color:var(--tc);color:var(--tx);font-weight:700}
.acx-cx{margin:8px 16px 0;background:var(--tt);color:var(--tx);border-radius:8px;padding:6px 10px;font-size:12px}
.acx-pbody{padding:12px 16px;overflow:auto;flex:1;min-height:300px;max-height:640px}
.acx-pfoot{border-top:1px solid var(--line);padding:8px 16px;color:var(--muted);font-size:11px}
.acx-co{border-radius:8px;padding:9px 12px;border:1px solid;margin:6px 0}
.acx-co.fx{display:flex;align-items:center;gap:8px}.acx-co.fx .cb{flex:1;min-width:0}
.acx-co .tg{display:inline-block;background:#fff;font-size:10px;font-weight:800;border-radius:5px;padding:1px 7px;margin-bottom:4px}
.acx-co .ln{font-weight:700}.acx-co .m1{color:#4B5563;font-size:11.5px;margin-top:2px}
.acx-co.in{background:#EEF5FF;border-color:#B9D3F5;border-left:5px solid var(--info)}.acx-co.in .tg{color:var(--info)}
.acx-co.am{background:var(--amber-bg);border-color:#F2D59A;border-left:5px solid var(--amber)}.acx-co.am .tg{color:var(--amber)}
.acx-co.gn{background:var(--green-bg);border-color:#BFE3CB;border-left:5px solid var(--green)}.acx-co.gn .tg{color:var(--green)}
.acx-cd{border:1px solid #E5E7EB;border-radius:10px;padding:9px 12px;margin:8px 0;background:#fff}
.acx-cd.cdr{display:flex;align-items:center;gap:8px}.acx-cd.cdr .cdb{flex:1;min-width:0}
.acx-cd .hd{font-size:10.5px;font-weight:800;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:6px}
.acx-cd .hd:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--tc)}
.acx-cd .bg{font-size:20px;font-weight:800;color:var(--navy);margin-top:2px}.acx-cd .m1{color:#4B5563;font-size:11.5px;margin-top:2px}
.acx-au{padding:8px 0;border-bottom:1px solid var(--row-line)}.acx-au .m1{color:var(--muted);font-size:11px}
.acx-hint{color:var(--muted);font-size:11.5px;margin-top:6px}
.acx-foldtab{position:fixed;right:0;top:50%;transform:translateY(-50%);background:var(--navy);color:#fff;border-radius:8px 0 0 8px;padding:10px 6px;writing-mode:vertical-rl;font-weight:800;cursor:pointer;z-index:20}
.acx-banner{display:flex;align-items:flex-start;gap:10px;padding:11px 13px;margin-bottom:12px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:8px;font-size:12px}
.acx-banner.error{border-color:#fecaca;background:#fef2f2}
.acx-banner strong{display:block;margin-bottom:2px}.acx-banner span{color:#475569}
.acx-banner .close{margin-left:auto;border:0;background:transparent;cursor:pointer;font-size:18px;line-height:1}
.acx-ov{position:fixed;inset:0;background:rgba(15,25,40,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}
.acx-md{background:#fff;border-radius:12px;width:470px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.3);font-family:Manrope,"Segoe UI",Arial,sans-serif;font-size:12.5px;color:#111827}
.acx-md *{box-sizing:border-box}
.acx-md input,.acx-md select,.acx-md textarea{font-family:inherit;font-size:12.5px;border:1px solid #D1D5DB;border-radius:6px;padding:6px 9px;background:#fff;outline:none}
.acx-md input:disabled,.acx-md select:disabled{background:#F3F4F6;color:#6B7280}
.acx-md textarea{width:100%;min-height:70px;resize:vertical}
.acx-md .mh{background:#102A43;color:#fff;padding:12px 16px;border-radius:12px 12px 0 0;display:flex;align-items:center}
.acx-md .mh b{font-size:15px}.acx-md .mh .x{margin-left:auto;cursor:pointer;color:#AAB4C0;background:none;border:none}
.acx-md .mb{padding:14px 16px;overflow:auto}.acx-md .mf{padding:12px 16px;border-top:1px solid #E5E7EB;display:flex;justify-content:flex-end;gap:8px}
.acx-md .mut2{color:#4B5563}
.acx-md .acx-btn{border:1px solid #D1D5DB;border-radius:6px;padding:6px 12px;background:#fff;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap}
.acx-md .acx-btn.p{background:#102A43;color:#fff;border-color:#102A43}
.acx-md .acx-btn.link{border:none;background:none;color:#1559A6;padding:0}
.acx-md .acx-btn:disabled{cursor:not-allowed;color:#B6BCC6;border-color:#E5E7EB;background:#FAFAFB}
.acx-md .acx-vl{display:flex;flex-direction:column}
.acx-md .acx-vr{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #F0F1F3;align-items:flex-start}
.acx-md .acx-vr .lb{flex:0 0 160px;color:#4B5563}.acx-md .acx-vr .rs{flex:1;font-weight:700}
.acx-md .acx-vr.ok .rs{color:#15803D}.acx-md .acx-vr.no .rs{color:#C0392B}
.acx-err{color:#C0392B;font-size:11.5px;padding:0 16px 10px}
.acx-fl{display:block;font-size:11.5px;font-weight:700;margin:10px 0 4px}
.acx-row2{display:flex;gap:10px}.acx-row2>div{flex:1}.acx-row2 input,.acx-row2 select{width:100%}
.acx-md .acx-hint{color:#6B7280;font-size:11.5px;margin-top:6px}
.acx-hist{max-height:200px;overflow:auto;margin-top:10px;border-top:1px solid #E5E7EB}
.acx-hist .h1{padding:7px 0;border-bottom:1px solid #F0F1F3}.acx-hist .h1 .m1{color:#6B7280;font-size:10.5px}
.acx-pl{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #F0F1F3}
.acx-pl b.n{color:#B7791F}.acx-pl .m1{color:#6B7280;font-size:11px}
@media(max-width:1100px){.acx-work{flex-direction:column}.acx-panel{width:100%!important}.acx-twoc{flex-direction:column}}
`;
