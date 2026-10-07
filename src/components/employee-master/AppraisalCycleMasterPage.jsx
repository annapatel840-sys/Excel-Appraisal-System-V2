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
   CONFIG
   ============================================================ */

const TYPES = ["Annual", "Mid-Year", "Exceptional", "New Joiner"];
// Default process per cycle type (HR Config in the reference). UI only.
const DEFAULT_PROCESS = {
  Annual: "Annual",
  "Mid-Year": "Annual",
  Exceptional: "Exceptional",
  "New Joiner": "None",
};
// Reference rule: no new Annual-process cycle until the previous one is archived.
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
    "Starts the cycle and triggers the Eligibility List. From now on Employee Master changes go to the Change list.",
  close:
    "Closes the cycle (Active → Closed). A window shows what is still pending; you choose Close anyway or Don't close yet.",
  archive:
    "The cycle becomes read-only. A window shows what is still pending first.",
};
const BTN = {
  Upcoming: { k: "activate", name: "Activate", to: "Active" },
  Active: { k: "close", name: "Close", to: "Closed" },
  Closed: { k: "archive", name: "Archive", to: "Archived" },
};

// Step buttons -> Employee Master page tab (via onNavigate)
const NAV_TAB = {
  "go-em": "roster",
  "go-up-em": "roster",
  "go-pay": "payroll-data",
  "go-up-pay": "payroll-upload",
  "go-el": "eligibility",
  "go-dl": "delegation",
};

const nextBtn = (c) =>
  !c || c.archived || c.process === "None" ? null : BTN[c.status] || null;

const rule = (label, ok, txt, kind) => ({
  label,
  ok,
  txt,
  kind: kind || (ok ? "ok" : "no"),
});

/* ============================================================
   COMPONENT
   ============================================================ */

export function AppraisalCycleMasterPage({ onNavigate, pendingItems = [] }) {
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
  const [showArchived, setShowArchived] = useState(false);
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
  const [editForm, setEditForm] = useState({ name: "", start: "", end: "" });
  const [remarksCycle, setRemarksCycle] = useState(null);
  const [remarksText, setRemarksText] = useState("");
  const [newCycleOpen, setNewCycleOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    type: "Annual",
    from: "",
    to: "",
    start: "",
    end: "",
    remarks: "",
  });
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

  // add the reference-screen fields that the backend does not store
  const cycles = useMemo(
    () =>
      rawCycles.map((c) => {
        const t = typeOf(c.name);
        return { ...c, type: t, process: DEFAULT_PROCESS[t] };
      }),
    [rawCycles],
  );

  const current = useMemo(
    () => cycles.find((c) => c.id === sel) || null,
    [cycles, sel],
  );

  const gridRows = useMemo(() => {
    const s = q.toLowerCase();
    return cycles
      .filter((c) => c.type === type)
      .filter((c) => showArchived || !c.archived)
      .filter(
        (c) =>
          !s ||
          `${c.name} ${c.id} ${c.process} ${c.status}`
            .toLowerCase()
            .includes(s),
      )
      .sort(
        (a, b) =>
          (a.archived ? 1 : 0) - (b.archived ? 1 : 0) ||
          String(b.start || "").localeCompare(String(a.start || "")),
      );
  }, [cycles, type, showArchived, q]);

  // keep a valid selection
  useEffect(() => {
    if (!cycles.length) return;
    if (!current || current.type !== type) {
      const first =
        cycles.filter((c) => c.type === type && !c.archived)[0] ||
        cycles.find((c) => c.type === type);
      if (first) setSel(first.id);
    }
  }, [cycles, type, current]);

  const pages = Math.max(1, Math.ceil(gridRows.length / size));
  const safePage = Math.min(page, pages);
  const pageRows = gridRows.slice((safePage - 1) * size, safePage * size);

  const typeCount = (t) => {
    const a = cycles.filter((c) => c.type === t);
    return { open: a.filter((c) => !c.archived).length, total: a.length };
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

  const findOverlappingCycle = (start, end, excludeId) =>
    cycles.find(
      (c) =>
        c.id !== excludeId &&
        c.start &&
        c.end &&
        start <= c.end &&
        end >= c.start,
    );

  const activateRules = (c) => {
    const r = [];
    if (c.process === "Annual") {
      const other = cycles.some(
        (x) =>
          x.id !== c.id &&
          x.process === "Annual" &&
          x.status === "Active" &&
          !x.archived,
      );
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
    const dOk = !!(c.start && c.end && c.end > c.start);
    r.push(
      rule(
        "Dates set",
        dOk,
        dOk
          ? `Start ${formatDate(c.start)} · Close ${formatDate(c.end)}`
          : "Start and close dates are required; close must be after start",
      ),
    );
    return r;
  };
  const allOk = (rs) => rs.every((x) => x.ok);

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

  const runStep = async (c, kind, remark) => {
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
    else if (kind === "unarchive")
      ok = await mutateCycle(
        `cycles/archive/${c.id}`,
        { archived: false },
        "Cycle unarchived",
        `${c.name} was unarchived.`,
      );
    else if (kind === "delete")
      ok = await mutateCycle(
        `cycles/delete/${c.id}`,
        {},
        "Cycle deleted",
        `${c.name} was deleted.`,
      );
    if (ok && remark) {
      const label = {
        activate: "Activate",
        close: "Close",
        archive: "Archive",
        reopen: "Reopen",
      }[kind];
      if (label) {
        await mutateCycle(
          `cycles/remarks/${c.id}`,
          {
            remarks: `${c.remarks ? c.remarks + " | " : ""}${label}: ${remark}`,
          },
          "Remark saved",
          `Your remark was added to ${c.name}.`,
        );
      }
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
    const ok = await runStep(cycle, kind, confirmRemark.trim());
    if (ok) setConfirm(null);
  };

  const onNextClick = () => {
    const b = nextBtn(current);
    if (b) openConfirm(b.k, current);
  };

  const openEditCycle = (c) => {
    setModalError("");
    setEditCycle(c);
    setEditForm({ name: c.name, start: c.start, end: c.end });
  };

  const saveEditCycle = async () => {
    const name = editForm.name.trim();
    if (!name || name.length > 100 || !editForm.start || !editForm.end)
      return setModalError(
        "Cycle name (up to 100 characters), start date and end date are required.",
      );
    if (editForm.end <= editForm.start)
      return setModalError("End date must be after start date.");
    const ov = findOverlappingCycle(editForm.start, editForm.end, editCycle.id);
    if (ov)
      return setModalError(
        `These dates overlap "${ov.name}" (${formatDate(ov.start)} – ${formatDate(ov.end)}). Cycles cannot overlap.`,
      );
    const saved = await mutateCycle(
      `cycles/update/${editCycle.id}`,
      { name, start: editForm.start, end: editForm.end },
      "Cycle updated",
      `${name} was updated successfully.`,
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

  const generateCycleName = (t, start, end) => {
    if (!t || !start || !end) return "";
    const s = new Date(start + "T00:00:00");
    const e = new Date(end + "T00:00:00");
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
    const fy0 = s.getMonth() >= 3 ? s.getFullYear() : s.getFullYear() - 1;
    return `${t} Appraisal FY${String(fy0).slice(-2)}-${String(fy0 + 1).slice(-2)}`;
  };

  const createCycle = async () => {
    const name = generateCycleName(newForm.type, newForm.from, newForm.to);
    if (!name || name.length > 100 || !newForm.start || !newForm.end)
      return setModalError(
        "Cycle type, From/To, start date and end date are required.",
      );
    if (newForm.to <= newForm.from)
      return setModalError("To date must be after From date.");
    if (newForm.end <= newForm.start)
      return setModalError("End date must be after start date.");
    if (ENFORCE_ONE_OPEN_ANNUAL && DEFAULT_PROCESS[newForm.type] === "Annual") {
      const prev = cycles.find((c) => c.process === "Annual" && !c.archived);
      if (prev)
        return setModalError(
          `Archive ${prev.name} first. No new cycle on the Annual process can be set up until the previous one is archived.`,
        );
    }
    const ov = findOverlappingCycle(newForm.start, newForm.end, null);
    if (ov)
      return setModalError(
        `These dates overlap "${ov.name}" (${formatDate(ov.start)} – ${formatDate(ov.end)}). Cycles cannot overlap.`,
      );
    if (newForm.remarks.length > 10000)
      return setModalError("Remarks cannot exceed 10,000 characters.");
    const saved = await mutateCycle(
      "cycles/create",
      {
        name,
        start: newForm.start,
        end: newForm.end,
        remarks: newForm.remarks.trim(),
      },
      "Cycle created",
      `${name} was created as Upcoming.`,
    );
    if (saved) {
      setType(newForm.type);
      setNewCycleOpen(false);
      setNewForm({
        type: "Annual",
        from: "",
        to: "",
        start: "",
        end: "",
        remarks: "",
      });
    }
  };

  /* ---------------- steps ---------------- */

  const stepRows = (c) => {
    const act = c.status === "Active" || c.status === "Closed" || c.archived;
    const closed = c.status === "Closed" || c.archived;
    const row = (g, id, title, sub, state, acts = []) => ({
      g,
      id,
      title,
      sub,
      state,
      acts,
    });
    return [
      row(
        "Upcoming",
        "su",
        "Set up cycle",
        `${c.name} · start ${formatDate(c.start)} · close ${formatDate(c.end)}`,
        "ok",
      ),
      row(
        "Upcoming",
        "em",
        "Employee Master",
        "Update the Employee Master for this cycle",
        "pd",
        [
          { l: "Open ›", id: "go-em" },
          { l: "Upload ›", id: "go-up-em" },
        ],
      ),
      row(
        "Upcoming",
        "pay",
        "Payroll",
        "Upload payroll data and resolve differences",
        "pd",
        [
          { l: "Open ›", id: "go-pay", link: true },
          { l: "Upload ›", id: "go-up-pay" },
        ],
      ),
      row(
        "Active",
        "el",
        "Eligibility",
        act
          ? "Eligibility List runs when the cycle is activated"
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
          ? "Upload as the data comes in · repeat any time"
          : "Available after Activate",
        act ? "pd" : "lk",
        act ? [{ l: "Upload ›", id: "go-up-fr" }] : [],
      ),
      row(
        "Active",
        "gn",
        "Generate Appraisal Sheet",
        act ? "One row per eligible employee" : "Available after Activate",
        act ? "pd" : "lk",
      ),
      row(
        "Active",
        "ap",
        "Appraisal",
        act ? "Appraisal Sheet · Detail screen" : "Available after Generate",
        act ? "pd" : "lk",
        act ? [{ l: "Open ›", id: "go-ap" }] : [],
      ),
      row(
        "Active",
        "lt",
        "Letters",
        act ? "Annual letters" : "Available after Generate",
        act ? "pd" : "lk",
        act ? [{ l: "Open ›", id: "go-lt" }] : [],
      ),
      row(
        "Closed",
        "cr",
        "Corrections",
        closed
          ? "Open until the cutoff date set in HR Config · reason required · audited"
          : "Available after Close",
        closed ? "pd" : "lk",
      ),
    ];
  };
  const ICON = { ok: "✓", wn: "!", lk: "🔒", pd: "●" };

  const checkAct = (id) => {
    const tabKey = NAV_TAB[id];
    if (tabKey && onNavigate) return onNavigate(tabKey);
    showBanner("Not connected", "This step is not linked to a screen yet.");
  };

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
    /(activ|clos|archiv|reopen|status)/i.test(a.action || "");

  /* ---------------- render pieces ---------------- */

  const stTagClass = (c) =>
    c.archived
      ? "v"
      : { Active: "g1", Upcoming: "i", Closed: "a" }[c.status] || "gr";
  const stText = (c) => (c.archived ? "Archived" : c.status);

  const renderGrid = () => (
    <>
      <div className="acx-gwrap">
        <table className="acx-g">
          <colgroup>
            <col style={{ width: 80 }} />
            <col style={{ width: 190 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th>ID</th>
              <th>Cycle</th>
              <th>Process</th>
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
                <td colSpan={8}>
                  <div className="acx-empty">No {type} cycles match.</div>
                </td>
              </tr>
            )}
            {pageRows.map((c) => {
              const nb = nextBtn(c);
              return (
                <tr
                  key={c.id}
                  className={c.id === sel ? "cur" : ""}
                  onClick={() => setSel(c.id)}
                >
                  <td className="rl" title={String(c.id)}>
                    {c.id}
                  </td>
                  <td title={c.name}>{c.name}</td>
                  <td>
                    <span className="acx-tag pr">{procLabel(c.process)}</span>
                  </td>
                  <td>{formatDate(c.start)}</td>
                  <td>{formatDate(c.end)}</td>
                  <td>
                    <span className={`acx-tag ${stTagClass(c)}`}>
                      {stText(c)}
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
                    {canManageCycles ? (
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
                        <DropdownMenuContent
                          align="end"
                          className="min-w-[200px]"
                        >
                          <DropdownMenuItem
                            disabled={saving || c.archived}
                            onSelect={() => openEditCycle(c)}
                          >
                            Edit dates
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={saving || c.archived}
                            onSelect={() => openRemarks(c)}
                          >
                            Remarks
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              saving || c.status !== "Upcoming" || c.archived
                            }
                            className="text-red-600 focus:text-red-600"
                            onSelect={() => openConfirm("delete", c)}
                          >
                            Delete cycle
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              saving || c.status !== "Closed" || c.archived
                            }
                            onSelect={() => openConfirm("reopen", c)}
                          >
                            Reopen (Closed → Active)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              saving || (c.status !== "Closed" && !c.archived)
                            }
                            onSelect={() =>
                              openConfirm(
                                c.archived ? "unarchive" : "archive",
                                c,
                              )
                            }
                          >
                            {c.archived ? "Unarchive" : "Archive"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
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

  const ruleRows = (rs) =>
    rs.map((x, i) => (
      <div key={i} className={`acx-vr ${x.kind}`}>
        <span className="lb">{x.label}</span>
        <span className="rs">
          {x.kind === "ok" ? "✓ " : x.kind === "no" ? "✗ " : ""}
          {x.txt}
        </span>
      </div>
    ));

  const renderCards = (c) => {
    if (!c) return null;
    const nb = nextBtn(c);
    const stline = (
      <div className="acx-stl">
        {["Upcoming", "Active", "Closed", "Archived"].map((s, i, a) => {
          const cur = c.archived ? "Archived" : c.status;
          const idx = a.indexOf(cur);
          const cls = cur === s ? "s on" : i < idx ? "s dn" : "s";
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
    if (c.archived) {
      left = (
        <>
          <div className="top">
            <span className="sl">Status</span>
            <span className="acx-mut">{procLabel(c.process)}</span>
          </div>
          <div className="big" style={{ color: "var(--green)" }}>
            Archived
          </div>
          {stline}
          <div className="mut2">
            The cycle is read-only. Unarchive it from Actions if needed.
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
            no status line, no steps and no button.
          </div>
        </>
      );
    } else {
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
    }

    let right;
    if (c.process === "Annual" && !c.archived) {
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
                        onClick={() => checkAct(a.id)}
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
    } else if (c.process === "Exceptional" && !c.archived) {
      right = (
        <>
          <div className="top">
            <span className="sl">Exceptional process</span>
          </div>
          <div className="mut2">
            None of the Annual steps apply. HR moves it manually through Active,
            Closed and Archived. An employee is released only when the
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
      const items = c.process === "Annual" && !c.archived ? pendingItems : [];
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
                : ""}
            </div>
          </div>
        );
      } else {
        body = (
          <>
            <div className={`acx-co ${tot ? "am" : "gn"}`}>
              <span className="tg">{tot ? "Pending" : "All clear"}</span>
              <div className="ln">
                {tot ? `${tot} to follow up` : "✓ Nothing pending"}
              </div>
              <div className="m1">
                Information only. Checks exist only at Activate.
              </div>
            </div>
            {items
              .filter((x) => selKey === "all" || x.k === selKey)
              .map((x) => (
                <div key={x.k} className="acx-cd">
                  <div className="hd">{x.label}</div>
                  <div className="bg">{x.n ? `${x.n} pending` : "None"}</div>
                  <div className="m1">{x.sub}</div>
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
            <b>{c.name}</b> · {c.id} · {c.archived ? "Archived" : c.status} ·{" "}
            {procLabel(c.process)}
          </div>
          <button
            type="button"
            className="acx-ic2"
            title="Notes"
            style={{ background: notes ? "var(--tt)" : "" }}
            onClick={() => setNotes((v) => !v)}
          >
            ⓘ
          </button>
          <button
            type="button"
            className="acx-ic2"
            title={wide ? "Normal width" : "Expand"}
            onClick={() => setWide((v) => !v)}
          >
            {wide ? "⤡" : "⤢"}
          </button>
          <button
            type="button"
            className="acx-ic2"
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

  const Modal = ({ title, onClose, children, footer, wideModal }) => (
    <div className="acx-ov">
      <div className="acx-md" style={wideModal ? { width: 560 } : undefined}>
        <div className="mh">
          <b>{title}</b>
          <button type="button" className="x" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="mb">{children}</div>
        {modalError && <div className="acx-err">{modalError}</div>}
        <div className="mf">{footer}</div>
      </div>
    </div>
  );

  const renderConfirm = () => {
    if (!confirm) return null;
    const { kind, cycle: c } = confirm;
    const close = () => setConfirm(null);
    const isStepKind = kind === "close" || kind === "archive";
    const items =
      isStepKind && c.process === "Annual"
        ? pendingItems.filter((x) => x.n > 0)
        : [];
    const has = items.length > 0;
    const verb = {
      activate: "Activate",
      close: "Close",
      archive: "Archive",
      reopen: "Reopen",
      unarchive: "Unarchive",
      delete: "Delete cycle",
    }[kind];
    const okLabel = isStepKind && has ? `${verb} anyway` : verb;
    const noLabel =
      isStepKind && has ? `Don't ${verb.toLowerCase()} yet` : "Cancel";
    let intro = "";
    if (kind === "reopen") intro = "Switch this Closed cycle back to Active.";
    else if (kind === "unarchive") intro = "Make this cycle editable again.";
    else if (kind === "delete")
      intro = `Delete this cycle? It has nothing in it. This action cannot be undone.`;
    else intro = BDESC[kind];
    return (
      <Modal
        title={`${verb} — ${c.name}`}
        onClose={close}
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
              Your remark is added to the cycle remarks and audited.
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
      "Exceptional process: HR moves it manually through Active, Closed and Archived.",
    None: "No process: the cycle is only a label for uploads. It has no steps.",
  };

  /* ---------------- main render ---------------- */

  const nb = nextBtn(current);
  const nextOk = !nb || nb.k !== "activate" || allOk(activateRules(current));

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
                Cycle is stamped on every row of the cycle
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
                      setNewForm((f) => ({ ...f, type }));
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
                  className={`acx-swt${showArchived ? " on" : ""}`}
                  role="switch"
                  aria-checked={showArchived}
                  onClick={() => {
                    setShowArchived((v) => !v);
                    setPage(1);
                  }}
                >
                  <span className="sw" />
                  <span>Show Archived</span>
                </span>
                <span className="acx-seln">
                  {current
                    ? `${current.name} (${current.id}) · ${current.archived ? "Archived" : current.status}`
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
                Row Actions: Edit dates · Remarks · Delete (only an Upcoming
                cycle) · Reopen and Archive (only a Closed cycle). The Process
                follows the cycle type.
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
          <label className="acx-fl">Cycle name</label>
          <input
            type="text"
            style={{ width: "100%" }}
            disabled={saving}
            value={editForm.name}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, name: e.target.value }))
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
          <div className="acx-hint">
            The process follows the cycle type and is locked once the cycle is
            activated.
          </div>
        </Modal>
      )}

      {remarksCycle && (
        <Modal
          title={`Remarks — ${remarksCycle.name}`}
          onClose={() => setRemarksCycle(null)}
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
                No remarks history yet.
              </div>
            )}
          </div>
        </Modal>
      )}

      {newCycleOpen && (
        <Modal
          title="Set up cycle"
          onClose={() => setNewCycleOpen(false)}
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
                  setNewForm((f) => ({ ...f, type: e.target.value }))
                }
              >
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="acx-fl">Process</label>
              <input
                type="text"
                disabled
                value={procLabel(DEFAULT_PROCESS[newForm.type])}
              />
            </div>
          </div>
          <div className="acx-hint">
            {setupHint[DEFAULT_PROCESS[newForm.type]]}
          </div>
          <label className="acx-fl">Cycle name</label>
          <input
            type="text"
            style={{ width: "100%" }}
            disabled
            value={generateCycleName(newForm.type, newForm.from, newForm.to)}
            placeholder="Generated from From and To"
          />
          <div className="acx-row2">
            <div>
              <label className="acx-fl">From</label>
              <input
                type="date"
                disabled={saving}
                value={newForm.from}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, from: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="acx-fl">To</label>
              <input
                type="date"
                disabled={saving}
                value={newForm.to}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, to: e.target.value }))
                }
              />
            </div>
          </div>
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
--green:#15803D;--green-bg:#ECFDF3;--amber:#B7791F;--amber-bg:#FEF6E7;--violet:#5B3FB0;--violet-bg:#ECE7FB;--info:#1D4FA8;--red:#C0392B;
font-family:Manrope,"Segoe UI",Arial,sans-serif;font-size:12.5px;color:var(--ink);width:100%}
.acx *{box-sizing:border-box}
.acx button,.acx input,.acx select,.acx textarea{font-family:inherit;font-size:12.5px;color:inherit}
.acx select,.acx input[type=text],.acx input[type=date],.acx textarea{border:1px solid #D1D5DB;border-radius:6px;padding:6px 9px;background:#fff;outline:none}
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
.acx-g th{background:var(--hb);color:var(--navy);font-size:11px;font-weight:700;text-align:left;padding:8px;border-bottom:1px solid var(--hl);white-space:nowrap;position:sticky;top:0;z-index:2}
.acx-g td{padding:8px;border-bottom:1px solid var(--row-line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.acx-g tbody tr{cursor:pointer}
.acx-g tbody tr:nth-child(odd) td{background:var(--odd)}.acx-g tbody tr:nth-child(even) td{background:var(--even)}
.acx-g tbody tr:hover td{background:var(--hover)}
.acx-g td.rl{background:var(--rowlabel)!important;color:var(--navy);font-weight:700;border-right:1px solid var(--hl)}
.acx-g tbody tr.cur td{background:var(--hi)!important}
.acx-g tbody tr.cur td.rl{background:#CFE0F7!important;box-shadow:inset 3px 0 0 var(--cta)}
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
.acx-vr.ok .rs{color:var(--green)}.acx-vr.no .rs{color:var(--red)}
.ckg{font-size:10.5px;font-weight:800;letter-spacing:.07em;color:var(--muted);margin:10px 0 2px;text-transform:uppercase}
.ck{display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid var(--row-line)}
.ck .ic{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex:0 0 22px}
.ck.ok .ic{background:var(--green-bg);color:var(--green)}.ck.wn .ic{background:var(--amber-bg);color:var(--amber)}.ck.lk .ic{background:#F3F4F6;color:#9AA3B0}.ck.pd .ic{background:var(--hi);color:var(--info)}
.ck .tx{flex:1;min-width:0}.ck .tx b{display:block}.ck .tx span{color:var(--muted);font-size:11.5px;display:block}
.ck.lk .tx b,.ck.lk .tx span{color:#9AA3B0}
.ck .ac{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.acx-panel{flex:0 0 auto;display:flex;flex-direction:column;position:relative;border-top:4px solid #2F6FED;--tc:#2F6FED;--tt:#E8F0FE;--tx:#1D4FA8;min-width:300px;max-width:720px}
.acx-panel.aud{border-top-color:#0E8A8A;--tc:#0E8A8A;--tt:#E3F5F4;--tx:#0B6B6B}
.acx{--tt:#E8F0FE}
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
.acx-co .tg{display:inline-block;background:#fff;font-size:10px;font-weight:800;border-radius:5px;padding:1px 7px;margin-bottom:4px}
.acx-co .ln{font-weight:700}.acx-co .m1{color:#4B5563;font-size:11.5px;margin-top:2px}
.acx-co.in{background:#EEF5FF;border-color:#B9D3F5;border-left:5px solid var(--info)}.acx-co.in .tg{color:var(--info)}
.acx-co.am{background:var(--amber-bg);border-color:#F2D59A;border-left:5px solid var(--amber)}.acx-co.am .tg{color:var(--amber)}
.acx-co.gn{background:var(--green-bg);border-color:#BFE3CB;border-left:5px solid var(--green)}.acx-co.gn .tg{color:var(--green)}
.acx-cd{border:1px solid #E5E7EB;border-radius:10px;padding:9px 12px;margin:8px 0;background:#fff}
.acx-cd .hd{font-size:10.5px;font-weight:800;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:6px}
.acx-cd .hd:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--tc)}
.acx-cd .bg{font-size:20px;font-weight:800;color:var(--navy);margin-top:2px}.acx-cd .m1{color:#4B5563;font-size:11.5px;margin-top:2px}
.acx-au{padding:8px 0;border-bottom:1px solid var(--row-line)}.acx-au .m1{color:var(--muted);font-size:11px}
.acx-foldtab{position:fixed;right:0;top:50%;transform:translateY(-50%);background:var(--navy);color:#fff;border-radius:8px 0 0 8px;padding:10px 6px;writing-mode:vertical-rl;font-weight:800;cursor:pointer;z-index:20}
.acx-banner{display:flex;align-items:flex-start;gap:10px;padding:11px 13px;margin-bottom:12px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:8px;font-size:12px}
.acx-banner.error{border-color:#fecaca;background:#fef2f2}
.acx-banner strong{display:block;margin-bottom:2px}.acx-banner span{color:#475569}
.acx-banner .close{margin-left:auto;border:0;background:transparent;cursor:pointer;font-size:18px;line-height:1}
.acx-ov{position:fixed;inset:0;background:rgba(15,25,40,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}
.acx-md{background:#fff;border-radius:12px;width:470px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.3)}
.acx-md .mh{background:var(--navy);color:#fff;padding:12px 16px;border-radius:12px 12px 0 0;display:flex;align-items:center}
.acx-md .mh b{font-size:15px}.acx-md .mh .x{margin-left:auto;cursor:pointer;color:#AAB4C0;background:none;border:none}
.acx-md .mb{padding:14px 16px;overflow:auto}.acx-md .mf{padding:12px 16px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px}
.acx-md .mut2{color:#4B5563}
.acx-err{color:var(--red);font-size:11.5px;padding:0 16px 10px}
.acx-fl{display:block;font-size:11.5px;font-weight:700;margin:10px 0 4px}
.acx-row2{display:flex;gap:10px}.acx-row2>div{flex:1}.acx-row2 input,.acx-row2 select{width:100%}
.acx-hint{color:var(--muted);font-size:11.5px;margin-top:6px}
.acx-hist{max-height:200px;overflow:auto;margin-top:10px;border-top:1px solid var(--line)}
.acx-hist .h1{padding:7px 0;border-bottom:1px solid var(--row-line)}.acx-hist .h1 .m1{color:var(--muted);font-size:10.5px}
.acx-pl{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--row-line)}
.acx-pl b.n{color:var(--amber)}.acx-pl .m1{color:var(--muted);font-size:11px}
@media(max-width:1100px){.acx-work{flex-direction:column}.acx-panel{width:100%!important}.acx-twoc{flex-direction:column}}
`;
