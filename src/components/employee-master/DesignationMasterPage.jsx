import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  loadDesignationMaster,
  saveDesignationMaster,
} from "@/lib/designation-master-api";
import {
  ClientPager,
  DataGrid,
  useGridState,
  useGridView,
} from "./DataGrid";
import { PanelTab } from "./SidePanel";
import { usePanel } from "./panelStore";
import "./employee-master-ui.css";

/* ------------------------------------------------------------------
   Designation Master (HR Operations > Masters)
   Follows "Designation Master v1" (HTML) and the Catalyst spec:
   Designations | Groups | Band | Options tabs, in-grid editing,
   unsaved-changes bar, History column, Preview / My view / Audit panel.
   ------------------------------------------------------------------ */

const TYPES = {
  S: "Single designation",
  M: "Multiple designations",
  G: "Group",
  F: "Free select",
};
const TYPE_HELP = {
  S: "One fixed next designation. It is pre-filled on the Appraisal Sheet.",
  M: "HR lists the possible next designations for each designation. The user picks one of them.",
  G: "HR points the designation to a named group. The user picks one of the group’s active members.",
  F: "Any active designation can be chosen. Nothing is pre-filled.",
};
const PAGE_SIZE = 20;

const EMPTY = {
  cycle: null,
  designations: [],
  groups: [],
  options: { S: true, M: true, G: true, F: true },
  bands: [],
  audit: [],
};

const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sid = (v) => (v === undefined || v === null ? "" : String(v));

/* grid column sets (width + label); render/get are added per render */
const META = {
  des: [
    { key: "n", label: "Designation", w: 260 },
    { key: "dept", label: "Department", w: 170 },
    { key: "band", label: "Band", w: 90 },
    { key: "nt", label: "Next type", w: 170 },
    { key: "nx", label: "Next designation(s)", w: 380 },
    { key: "on", label: "Status", w: 110 },
    { key: "hist", label: "History", w: 150 },
  ],
  grp: [
    { key: "n", label: "Group", w: 250 },
    { key: "cnt", label: "Designations", w: 110 },
    { key: "mem", label: "Members", w: 520 },
    { key: "hist", label: "History", w: 150 },
  ],
  band: [
    { key: "n", label: "Band", w: 140 },
    { key: "cnt", label: "Designations", w: 110 },
    { key: "mem", label: "Mapped designations", w: 520 },
    { key: "hist", label: "History", w: 150 },
  ],
};

/* ------------------------- rules (spec) ------------------------- */
function isUnmapped(row, options) {
  const t = row.nextType;
  if (!t || !options[t]) return true;
  if (t === "S") return !row.singleNextId;
  if (t === "M") return !(row.multipleNextIds || []).length;
  if (t === "G") return !row.groupId;
  return false;
}

/* ------------------------- component ------------------------- */
export function DesignationMasterPage() {
  const [saved, setSaved] = useState(EMPTY);
  const [draft, setDraft] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const [tab, setTab] = useState("des");
  const [filters, setFilters] = useState({ q: "", dept: "", status: "", unm: false });
  const [sel, setSel] = useState({ des: null, grp: null, band: null });
  const [pages, setPages] = useState({ des: 1, grp: 1, band: 1 });
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", band: "", nt: "" });
  const [addErr, setAddErr] = useState("");
  const [menu, setMenu] = useState(null); // members / next-list / band popup
  const [pv, setPv] = useState({ dp: "", cur: "" });
  const [auditAll, setAuditAll] = useState(false);

  const gridDes = useGridState(META.des);
  const gridGrp = useGridState(META.grp);
  const gridBand = useGridState(META.band);
  const grids = { des: gridDes, grp: gridGrp, band: gridBand };
  const grid = grids[tab];

  const [panel, updatePanel] = usePanel("dm");
  const undoStack = useRef([]);
  const toastTimer = useRef(null);
  const tempId = useRef(1);

  const toast = useCallback((m) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2600);
  }, []);

  /* ---------- load ---------- */
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await loadDesignationMaster();
      const data = {
        ...EMPTY,
        ...r,
        options: { ...EMPTY.options, ...(r.options || {}) },
        designations: (r.designations || []).map((d) => ({
          ...d,
          id: sid(d.id),
          nextType: d.nextType || "",
          singleNextId: sid(d.singleNextId),
          multipleNextIds: (d.multipleNextIds || []).map(sid),
          groupId: sid(d.groupId),
          band: d.band || "",
          status: d.status === "Active" ? "Active" : "Inactive",
        })),
        groups: (r.groups || []).map((g) => ({
          ...g,
          id: sid(g.id),
          memberIds: (g.memberIds || []).map(sid),
        })),
        bands: r.bands || [],
        audit: r.audit || [],
      };
      setSaved(clone(data));
      setDraft(clone(data));
      undoStack.current = [];
      setAdding(false);
      setMenu(null);
    } catch (e) {
      setError(e.message || "Unable to load Designation Master.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    updatePanel({ tab: "pv" }); // the prototype opens the panel on Preview
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  /* ---------- lookups ---------- */
  const desById = useMemo(
    () => new Map(draft.designations.map((d) => [d.id, d])),
    [draft.designations],
  );
  const grpById = useMemo(
    () => new Map(draft.groups.map((g) => [g.id, g])),
    [draft.groups],
  );
  const savedDes = useMemo(
    () => new Map(saved.designations.map((d) => [d.id, d])),
    [saved.designations],
  );
  const savedGrp = useMemo(
    () => new Map(saved.groups.map((g) => [g.id, g])),
    [saved.groups],
  );
  const dname = (id) => desById.get(sid(id))?.name || "";
  const gname = (id) => grpById.get(sid(id))?.name || "";
  const activeMembers = (g) =>
    g.memberIds.filter((id) => desById.get(id)?.status === "Active");
  const memText = (ids) =>
    ids
      .map((id) => {
        const d = desById.get(id);
        return d ? d.name + (d.status === "Active" ? "" : " (inactive)") : "";
      })
      .filter(Boolean)
      .join(", ") || "(none)";
  const nxText = (d) => {
    const t = d.nextType;
    if (!t) return "Not mapped";
    if (!draft.options[t]) return `${TYPES[t]} is switched off`;
    if (t === "S") return d.singleNextId ? dname(d.singleNextId) : "(not set)";
    if (t === "M")
      return d.multipleNextIds.length
        ? d.multipleNextIds.map(dname).join(", ")
        : "(not set)";
    if (t === "G") return d.groupId ? gname(d.groupId) : "(not set)";
    return "Any active designation";
  };
  const unmappedList = useMemo(
    () => draft.designations.filter((d) => isUnmapped(d, draft.options)),
    [draft.designations, draft.options],
  );

  /* ---------- editing ---------- */
  const pushUndo = () => {
    undoStack.current.push(JSON.stringify(draft));
    if (undoStack.current.length > 100) undoStack.current.shift();
  };
  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return toast("Nothing to undo");
    setDraft(JSON.parse(prev));
  }, [toast]);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey && (e.key === "z" || e.key === "Z"))) return;
      const a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type === "text") return;
      e.preventDefault();
      undo();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo]);

  const patchDes = (id, patch) => {
    pushUndo();
    setDraft((c) => ({
      ...c,
      designations: c.designations.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
  };
  const patchGrp = (id, patch) => {
    pushUndo();
    setDraft((c) => ({
      ...c,
      groups: c.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  };

  /* changed cells (purple) + counts */
  const edDes = (id, field) => {
    const a = desById.get(id);
    const b = savedDes.get(id);
    if (!b) return Array.isArray(a?.[field]) ? a[field].length > 0 : Boolean(a?.[field]);
    return !same(a?.[field], b[field]);
  };
  const edGrp = (id, field) => {
    const a = grpById.get(id);
    const b = savedGrp.get(id);
    return !b || !same(a?.[field], b[field]);
  };
  const changeCount = useMemo(() => {
    let n = 0;
    draft.designations.forEach((d) => {
      const b = savedDes.get(d.id);
      if (!b) return void (n += 1);
      ["band", "nextType", "singleNextId", "multipleNextIds", "groupId", "status"].forEach(
        (f) => {
          if (!same(d[f], b[f])) n += 1;
        },
      );
    });
    draft.groups.forEach((g) => {
      const b = savedGrp.get(g.id);
      if (!b) return void (n += 1);
      if (g.name !== b.name) n += 1;
      if (!same(g.memberIds, b.memberIds)) n += 1;
    });
    saved.groups.forEach((g) => {
      if (!grpById.has(g.id)) n += 1;
    });
    Object.keys(draft.options).forEach((t) => {
      if (draft.options[t] !== saved.options[t]) n += 1;
    });
    return n;
  }, [draft, saved, savedDes, savedGrp, grpById]);

  /* hard errors that block Save */
  const rowErr = (d) =>
    d.status === "Active" && isUnmapped(d, draft.options)
      ? "Not mapped. Map the next designation first, then make it Active"
      : "";
  const grpErr = (g) =>
    !g.name.trim()
      ? "Group name is required"
      : !g.memberIds.length
        ? "A group needs at least one designation"
        : "";
  const badCount = useMemo(
    () =>
      draft.designations.filter(rowErr).length +
      draft.groups.filter(grpErr).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft],
  );

  const dirty = changeCount > 0;
  useEffect(() => {
    const warn = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const handleSave = async () => {
    if (badCount) return toast("Fix the red cells first");
    const names = new Set();
    for (const g of draft.groups) {
      const k = g.name.trim().toLowerCase();
      if (names.has(k)) return toast(`Group name "${g.name}" is used twice`);
      names.add(k);
    }
    setSaving(true);
    setError("");
    try {
      await saveDesignationMaster({
        cycleId: draft.cycle?.id,
        designations: draft.designations,
        groups: draft.groups,
        options: draft.options,
      });
      await refresh();
      toast("Saved");
    } catch (e) {
      setError(e.message || "Unable to save Designation Master.");
    } finally {
      setSaving(false);
    }
  };
  const handleDiscard = () => {
    if (dirty && !window.confirm("Discard all unsaved changes?")) return;
    setDraft(clone(saved));
    undoStack.current = [];
    setAdding(false);
    toast("Changes discarded");
  };

  /* ---------- add designation / group ---------- */
  const submitAdd = () => {
    const name = addForm.name.trim();
    if (!name) return setAddErr("Name is required");
    if (tab === "des") {
      if (draft.designations.some((d) => d.name.toLowerCase() === name.toLowerCase()))
        return setAddErr("This designation already exists");
      pushUndo();
      const id = `new-d${tempId.current++}`;
      setDraft((c) => ({
        ...c,
        designations: [
          ...c.designations,
          {
            id, name, department: "", inMaster: false, band: addForm.band,
            nextType: addForm.nt, singleNextId: "", multipleNextIds: [],
            groupId: "", status: "Inactive", isNew: true,
          },
        ],
      }));
      toast("Designation added");
    } else {
      if (draft.groups.some((g) => g.name.trim().toLowerCase() === name.toLowerCase()))
        return setAddErr("This group name already exists");
      pushUndo();
      const id = `new-g${tempId.current++}`;
      setDraft((c) => ({ ...c, groups: [...c.groups, { id, name, memberIds: [], isNew: true }] }));
      setSel((s) => ({ ...s, grp: id }));
      setTimeout(
        () => setMenu({ kind: "grp", id, rect: { left: 320, bottom: 260 } }),
        0,
      );
      toast("Tick the designations in this group");
    }
    setAdding(false);
    setAddErr("");
    setAddForm({ name: "", band: "", nt: "" });
  };

  /* ---------- history / audit ---------- */
  const auditFor = (t, id) =>
    draft.audit.filter((a) => {
      if (t === "band") return a.field === "band" && (a.ov === id || a.nv === id);
      return a.tab === t && sid(a.rid) === sid(id);
    });
  const openHistory = (t, id) => {
    setSel((s) => ({ ...s, [t]: id }));
    setAuditAll(false);
    updatePanel({ open: true, tab: "aud" });
  };

  /* ---------- option switches ---------- */
  const toggleOption = (t, on) => {
    if (!on && !Object.keys(draft.options).some((k) => k !== t && draft.options[k]))
      return toast("At least one option stays on");
    pushUndo();
    setDraft((c) => ({ ...c, options: { ...c.options, [t]: on } }));
    if (!on) {
      const n = draft.designations.filter((d) => d.nextType === t).length;
      if (n) toast(`${n} designation${n > 1 ? "s" : ""} now need another next type`);
    }
  };

  /* ---------- grid rows + defs ---------- */
  const typeOptions = (d) => (
    <>
      <option value="">
        {d.nextType && !draft.options[d.nextType] ? "(choose a type)" : "(none)"}
      </option>
      {Object.keys(TYPES)
        .filter((t) => draft.options[t])
        .map((t) => (
          <option key={t} value={t}>
            {TYPES[t]}
          </option>
        ))}
    </>
  );

  const histCell = (t, id) => {
    const list = auditFor(t, id);
    return (
      <div className="dmx-hist">
        <button
          type="button"
          className="emx-mini"
          onClick={() => openHistory(t, id)}
        >
          History{list.length ? ` (${list.length})` : ""}
        </button>
        {list[0] && <span className="dmx-hl">{list[0].at}</span>}
      </div>
    );
  };

  const defsDes = () => [
    {
      key: "n", label: "Designation", get: (d) => d.name,
      render: (d) => (
        <div className="emx-e1">
          {d.name}
          {d.isNew && <span className="emx-tag info" style={{ marginLeft: 6 }}>New</span>}
        </div>
      ),
    },
    {
      key: "dept", label: "Department",
      get: (d) => d.department || "(not in Employee Master yet)",
    },
    {
      key: "band", label: "Band", get: (d) => d.band || "(none)",
      render: (d) => (
        <select
          className={"dmx-ctl" + (edDes(d.id, "band") ? " ed" : "")}
          value={d.band}
          onChange={(e) => patchDes(d.id, { band: e.target.value })}
        >
          <option value="">(none)</option>
          {draft.bands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      ),
    },
    {
      key: "nt", label: "Next type", get: (d) => TYPES[d.nextType] || "(none)",
      render: (d) => (
        <select
          className={"dmx-ctl" + (edDes(d.id, "nextType") ? " ed" : "")}
          value={d.nextType && !draft.options[d.nextType] ? "" : d.nextType}
          onChange={(e) => patchDes(d.id, { nextType: e.target.value })}
        >
          {typeOptions(d)}
        </select>
      ),
    },
    {
      key: "nx", label: "Next designation(s)", get: (d) => nxText(d),
      render: (d) => {
        const t = d.nextType && draft.options[d.nextType] ? d.nextType : "";
        if (t === "S") {
          return (
            <select
              className={
                "dmx-ctl" +
                (edDes(d.id, "singleNextId") ? " ed" : "") +
                (d.singleNextId ? "" : " unm")
              }
              value={d.singleNextId}
              onChange={(e) => patchDes(d.id, { singleNextId: e.target.value })}
            >
              <option value="">(not set)</option>
              {draft.designations
                .filter((x) => x.id !== d.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}{x.status === "Active" ? "" : " (inactive)"}
                  </option>
                ))}
            </select>
          );
        }
        if (t === "G") {
          const g = grpById.get(d.groupId);
          return (
            <>
              <select
                className={
                  "dmx-ctl" +
                  (edDes(d.id, "groupId") ? " ed" : "") +
                  (d.groupId ? "" : " unm")
                }
                value={d.groupId}
                onChange={(e) => patchDes(d.id, { groupId: e.target.value })}
              >
                <option value="">(not set)</option>
                {draft.groups.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
              {d.groupId && (
                <div className="dmx-chips">
                  {g && g.memberIds.length ? (
                    g.memberIds.map((m) => {
                      const x = desById.get(m);
                      return (
                        <span key={m} className={"dmx-chip" + (x?.status === "Active" ? "" : " gi")}>
                          {x?.name}{x?.status === "Active" ? "" : " (inactive)"}
                        </span>
                      );
                    })
                  ) : (
                    <span className="dmx-mut">No designations in this group</span>
                  )}
                </div>
              )}
            </>
          );
        }
        if (t === "M") {
          return (
            <div className={"dmx-mem" + (edDes(d.id, "multipleNextIds") ? " ed" : "")}>
              <button
                type="button"
                className="emx-mini"
                onClick={(e) =>
                  setMenu({ kind: "nm", id: d.id, rect: e.currentTarget.getBoundingClientRect() })
                }
              >
                Edit
              </button>
              {d.multipleNextIds.length ? (
                <span>{d.multipleNextIds.map(dname).join(", ")}</span>
              ) : (
                <span className="dmx-unmp">Not mapped</span>
              )}
            </div>
          );
        }
        if (t === "F") return <span>Any active designation</span>;
        return (
          <>
            <span className="dmx-unmp">Not mapped</span>
            {d.nextType && !draft.options[d.nextType] && (
              <span className="dmx-mut"> {TYPES[d.nextType]} is switched off</span>
            )}
          </>
        );
      },
    },
    {
      key: "on", label: "Status", get: (d) => d.status,
      render: (d) => {
        const bad = Boolean(rowErr(d));
        return (
          <select
            className={"dmx-ctl" + (edDes(d.id, "status") ? " ed" : "") + (bad ? " bad" : "")}
            value={d.status}
            title={bad ? rowErr(d) : undefined}
            onChange={(e) => patchDes(d.id, { status: e.target.value })}
          >
            <option
              value="Active"
              disabled={isUnmapped(d, draft.options) && d.status !== "Active"}
            >
              Active
            </option>
            <option value="Inactive">Inactive</option>
          </select>
        );
      },
    },
    { key: "hist", label: "History", get: (d) => auditFor("des", d.id).length, render: (d) => histCell("des", d.id) },
  ];

  const defsGrp = () => [
    {
      key: "n", label: "Group", get: (g) => g.name,
      render: (g) => (
        <input
          type="text"
          className={
            "dmx-ctl" + (edGrp(g.id, "name") ? " ed" : "") + (g.name.trim() ? "" : " bad")
          }
          value={g.name}
          placeholder="Group name"
          onChange={(e) => patchGrp(g.id, { name: e.target.value })}
        />
      ),
    },
    { key: "cnt", label: "Designations", get: (g) => activeMembers(g).length },
    {
      key: "mem", label: "Members", get: (g) => memText(g.memberIds),
      render: (g) => (
        <div className={"dmx-mem" + (edGrp(g.id, "memberIds") ? " ed" : "") + (grpErr(g) && g.name.trim() ? " bad" : "")}>
          <button
            type="button"
            className="emx-mini"
            onClick={(e) =>
              setMenu({ kind: "grp", id: g.id, rect: e.currentTarget.getBoundingClientRect() })
            }
          >
            Edit
          </button>
          <span>{memText(g.memberIds)}</span>
        </div>
      ),
    },
    { key: "hist", label: "History", get: (g) => auditFor("grp", g.id).length, render: (g) => histCell("grp", g.id) },
  ];

  const defsBand = () => [
    { key: "n", label: "Band", get: (b) => b.code },
    { key: "cnt", label: "Designations", get: (b) => b.ids.length },
    {
      key: "mem", label: "Mapped designations", get: (b) => memText(b.ids),
      render: (b) => (
        <div className="dmx-mem">
          <button
            type="button"
            className="emx-mini"
            onClick={(e) =>
              setMenu({ kind: "band", id: b.code, rect: e.currentTarget.getBoundingClientRect() })
            }
          >
            Edit
          </button>
          <span>{memText(b.ids)}</span>
        </div>
      ),
    },
    { key: "hist", label: "History", get: (b) => auditFor("band", b.code).length, render: (b) => histCell("band", b.code) },
  ];

  const rowsAll = useMemo(() => {
    if (tab === "des") return draft.designations;
    if (tab === "grp") return draft.groups;
    return draft.bands.map((code) => ({
      id: code,
      code,
      ids: draft.designations.filter((d) => d.band === code).map((d) => d.id),
    }));
  }, [tab, draft.designations, draft.groups, draft.bands]);

  const defs = tab === "des" ? defsDes() : tab === "grp" ? defsGrp() : defsBand();

  const pre = useCallback(
    (row) => {
      const q = filters.q.trim().toLowerCase();
      if (q) {
        const hay =
          tab === "des"
            ? [row.name, row.department, row.band, TYPES[row.nextType], nxText(row), row.status]
            : tab === "grp"
              ? [row.name, memText(row.memberIds)]
              : [row.code, memText(row.ids)];
        if (!hay.join(" ").toLowerCase().includes(q)) return false;
      }
      if (tab === "des") {
        if (filters.dept && row.department !== filters.dept) return false;
        if (filters.status && row.status !== filters.status) return false;
        if (filters.unm && !isUnmapped(row, draft.options)) return false;
      }
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, tab, draft],
  );

  const view = useGridView(rowsAll, defs, grid, pre);
  const pageCount = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  const page = Math.min(pages[tab], pageCount);
  const pageRows = view.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => {
    setPages((p) => ({ ...p, [tab]: 1 }));
  }, [filters, tab, grid.filters, grid.sort]);

  const rowKey = (r) => r.id;
  const selId = sel[tab];
  const selRow = rowsAll.find((r) => r.id === selId) || null;

  const onGridClick = (e) => {
    if (e.target.closest("input,select,button,a")) return;
    if (!e.target.closest(".emx-wrap")) return;
    const tr = e.target.closest("tbody tr");
    if (!tr) return;
    const idx = Array.prototype.indexOf.call(tr.parentNode.children, tr);
    const row = pageRows[idx];
    if (!row) return;
    setSel((s) => ({ ...s, [tab]: row.id }));
    setAuditAll(false);
    if (tab === "des") setPv({ dp: row.department, cur: row.id });
  };

  /* ---------- export ---------- */
  const exportXls = () => {
    const cols = defs.filter((d) => d.key !== "hist");
    const esc = (s) =>
      String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const html =
      '<html><head><meta charset="utf-8"></head><body><table border="1"><tr>' +
      cols.map((c) => `<th style="background:#E6EEF8;color:#102A43">${esc(c.label)}</th>`).join("") +
      "</tr>" +
      view.map((r) => "<tr>" + cols.map((c) => `<td>${esc(c.get(r))}</td>`).join("") + "</tr>").join("") +
      "</table></body></html>";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "application/vnd.ms-excel" }));
    a.download =
      (tab === "des" ? "Designations" : tab === "grp" ? "Designation_Groups" : "Designation_Bands") + ".xls";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  /* ---------- popup (members / next list / band) ---------- */
  const menuModel = useMemo(() => {
    if (!menu) return null;
    if (menu.kind === "grp") {
      const g = grpById.get(menu.id);
      if (!g) return null;
      return { title: `Designations in ${g.name}`, items: draft.designations, picked: g.memberIds };
    }
    if (menu.kind === "nm") {
      const d = desById.get(menu.id);
      if (!d) return null;
      return {
        title: `Next designations for ${d.name}`,
        items: draft.designations.filter((x) => x.id !== d.id),
        picked: d.multipleNextIds,
      };
    }
    return {
      title: `Designations in band ${menu.id}`,
      items: draft.designations,
      picked: draft.designations.filter((d) => d.band === menu.id).map((d) => d.id),
    };
  }, [menu, draft.designations, grpById, desById]);

  const applyMenu = (ids) => {
    const { kind, id } = menu;
    if (kind === "grp") patchGrp(id, { memberIds: ids });
    else if (kind === "nm") patchDes(id, { multipleNextIds: ids });
    else {
      pushUndo();
      setDraft((c) => ({
        ...c,
        designations: c.designations.map((d) => {
          const want = ids.includes(d.id);
          if (want) return d.band === id ? d : { ...d, band: id };
          return d.band === id ? { ...d, band: "" } : d;
        }),
      }));
    }
    setMenu(null);
  };

  /* ---------- right panel ---------- */
  const panelTitle = () => {
    if (tab === "des" && selRow)
      return `${selRow.name} · ${selRow.department || "not in Employee Master yet"} · next: ${TYPES[selRow.nextType] || "none"}`;
    if (tab === "grp" && selRow) return `${selRow.name} · ${activeMembers(selRow).length} designations`;
    if (tab === "band" && selRow) return `Band ${selRow.code} · ${selRow.ids.length} designations`;
    return `Designation Master · ${draft.designations.length} designations · ${draft.groups.length} groups`;
  };

  const depts = useMemo(
    () => [...new Set(draft.designations.map((d) => d.department).filter(Boolean))].sort(),
    [draft.designations],
  );

  const previewBody = () => {
    const dp = pv.dp || depts[0] || "";
    const members = draft.designations.filter((d) => d.department === dp && d.status === "Active");
    const cur = members.find((d) => d.id === pv.cur) || members[0];
    const t = cur ? cur.nextType : "";
    const pick = (ids, title, sub) => {
      const act = ids.map((i) => desById.get(i)).filter((d) => d && d.status === "Active");
      const off = ids.length - act.length;
      return (
        <>
          <div className="dmx-call">
            <span className="tg">{title}</span>
            <div className="ln"><b>{sub}</b><span className="dmx-mut">{act.length} to pick from</span></div>
            <div className="sub">User selects one designation</div>
          </div>
          <div className="dmx-card">
            <h4>Dropdown shows</h4>
            {act.length ? (
              act.map((d) => (
                <div className="rw" key={d.id}><span>{d.name}</span><span className="dmx-mut">{d.department || "—"}</span></div>
              ))
            ) : (
              <div className="dmx-mut">No active designations</div>
            )}
            {off > 0 && <div className="dmx-note">{off} inactive left out</div>}
          </div>
        </>
      );
    };
    let body = null;
    if (!cur) body = <div className="dmx-card"><div className="dmx-mut">No active designations in this department</div></div>;
    else if (!t) body = <div className="dmx-call gr"><span className="tg">No next designation</span><div className="ln"><b>✓ Nothing pre-filled</b></div></div>;
    else if (!draft.options[t]) body = <div className="dmx-call am"><span className="tg">Switched off</span><div className="ln"><b>{TYPES[t]}</b></div><div className="sub">This type is switched off in Options, nothing is pre-filled</div></div>;
    else if (t === "F") {
      const n = draft.designations.filter((d) => d.status === "Active").length;
      body = <div className="dmx-call"><span className="tg">Free select</span><div className="ln"><b>Any active designation</b><span className="dmx-mut">{n} to pick from</span></div><div className="sub">Nothing pre-filled, the user chooses</div></div>;
    } else if (t === "S") {
      const x = desById.get(cur.singleNextId);
      const ok = x && x.status === "Active";
      body = (
        <div className={"dmx-call" + (ok ? "" : " am")}>
          <span className="tg">{ok ? "Pre-filled · next designation" : x ? "Next designation is inactive" : "Next designation not set"}</span>
          <div className="ln"><b>{x ? x.name : ""}</b></div>
          <div className="sub">{ok ? "Single designation, the user can still change it" : "Nothing pre-filled"}</div>
        </div>
      );
    } else if (t === "M") body = pick(cur.multipleNextIds, "Choose from the listed designations", "Multiple designations");
    else {
      const g = grpById.get(cur.groupId);
      body = g ? pick(g.memberIds, "Choose in group", g.name) : <div className="dmx-call am"><span className="tg">Group not set</span></div>;
    }
    return (
      <>
        <div className="dmx-info">Appraisal Sheet · new designation cell for an employee in</div>
        <div className="dmx-pvc">
          <select className="dmx-ctl" value={dp} onChange={(e) => setPv({ dp: e.target.value, cur: "" })}>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="dmx-ctl" value={cur ? cur.id : ""} onChange={(e) => setPv({ dp, cur: e.target.value })}>
            {members.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        {body}
      </>
    );
  };

  const viewBody = () => (
    <>
      <h5>Columns · {tab === "des" ? "Designations" : tab === "grp" ? "Groups" : "Band"}</h5>
      <table className="dmx-cmp">
        <tbody>
          <tr><td></td><td>Show</td><td>Wrap</td></tr>
          {META[tab].map((m, i) => {
            const c = grid.cols.find((x) => x.key === m.key);
            return (
              <tr key={m.key}>
                <td>{m.label}</td>
                <td><input type="checkbox" checked={!!c?.vis} disabled={i === 0} onChange={(e) => grid.patchCol(m.key, { vis: e.target.checked })} /></td>
                <td><input type="checkbox" checked={!!c?.wrap} onChange={(e) => grid.patchCol(m.key, { wrap: e.target.checked })} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h5>Row density</h5>
      {[["compact", "Compact"], ["comfortable", "Comfortable"]].map(([k, l]) => (
        <label key={k}><input type="radio" name="dmx-dens" checked={grid.dens === k} onChange={() => grid.setDens(k)} /> {l}</label>
      ))}
      <div className="emx-note">Kept while you stay on this screen · drag a column edge to resize</div>
    </>
  );

  const auditCard = (a) => (
    <div className="emx-aud" key={a.id}>
      <div className="a1">{a.rowName}</div>
      <div className="a2">{a.at}</div>
      <div className="a2">{a.text} · {a.by || "HR"}</div>
    </div>
  );
  const auditBody = () => {
    if (selRow && !auditAll) {
      const list = auditFor(tab, selRow.id);
      const nm = tab === "band" ? `Band ${selRow.code}` : selRow.name;
      return (
        <>
          <div className="dmx-info">History of <b>{nm}</b> · every saved change</div>
          <button type="button" className="emx-mini" style={{ marginTop: 6 }} onClick={() => setAuditAll(true)}>Show all changes</button>
          <div style={{ marginTop: 8 }}>
            {list.length ? list.map(auditCard) : <div className="emx-note">No saved changes for this row yet</div>}
          </div>
        </>
      );
    }
    return (
      <>
        {selRow && <button type="button" className="emx-mini" onClick={() => setAuditAll(false)}>Show selected row only</button>}
        <div style={{ marginTop: 8 }}>
          {draft.audit.length ? draft.audit.slice(0, 60).map(auditCard) : <div className="emx-note">No saved changes yet</div>}
        </div>
      </>
    );
  };

  const ptab = ["pv", "view", "aud"].includes(panel.tab) ? panel.tab : "pv";

  /* ---------- render ---------- */
  const optionsPage = (
    <div className="dmx-opt">
      <h3>Next designation options</h3>
      <p className="dmx-mut">Switch on the ways HR can set the next designation. At least one stays on.</p>
      <p className="dmx-mut">
        Everything on this screen applies to the current cycle ({draft.cycle?.name || "—"}). Past cycles and earlier Appraisal Sheets keep the mapping they were saved with.
      </p>
      {Object.keys(TYPES).map((t) => (
        <label className="orow" key={t}>
          <input type="checkbox" checked={!!draft.options[t]} onChange={(e) => toggleOption(t, e.target.checked)} />
          <span><b>{TYPES[t]}</b><small>{TYPE_HELP[t]}</small></span>
          <em>{draft.designations.filter((d) => d.nextType === t).length} in use</em>
        </label>
      ))}
    </div>
  );

  return (
    <section className="dmx">
      <style>{CSS}</style>

      <div className="dmx-tabs">
        {[["des", "Designations"], ["grp", "Groups"], ["band", "Band"], ["opt", "Options"]].map(([k, l]) => (
          <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => { setTab(k); setAdding(false); setMenu(null); }}>
            {l}
          </button>
        ))}
      </div>

      {error && (
        <div className="dmx-msg">
          <span>{error}</span>
          <button type="button" className="emx-mini" onClick={refresh}>Retry</button>
        </div>
      )}

      {tab !== "opt" && (
        <div className="dmx-toolbar">
          <input
            className="dmx-txt" style={{ width: 220 }} placeholder="Search…"
            value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
          {tab === "des" && (
            <>
              <button
                type="button" className={"emx-mini dmx-big" + (filters.unm ? " tog" : "")}
                onClick={() => setFilters((f) => ({ ...f, unm: !f.unm }))}
              >
                Not mapped ({unmappedList.length})
              </button>
              <label>Department
                <select className="dmx-ctl" value={filters.dept} onChange={(e) => setFilters((f) => ({ ...f, dept: e.target.value }))}>
                  <option value="">All</option>
                  {depts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label>Status
                <select className="dmx-ctl" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                  <option value="">All</option><option>Active</option><option>Inactive</option>
                </select>
              </label>
            </>
          )}
          <span style={{ flex: 1 }} />
          <span className="dmx-stat">Designations <b>{draft.designations.length}</b></span>
          <span className="dmx-stat">Groups <b>{draft.groups.length}</b></span>
          <span className="dmx-stat">Inactive <b>{draft.designations.filter((d) => d.status !== "Active").length}</b></span>
          <button type="button" className="emx-mini dmx-big" onClick={refresh} disabled={saving || loading}>Refresh</button>
          <button type="button" className="emx-mini dmx-big" onClick={exportXls}>Export to Excel</button>
          {tab !== "band" && (
            <button type="button" className="emx-mini emx-dashed dmx-big" onClick={() => { setAdding((a) => !a); setAddErr(""); }}>
              + Add {tab === "des" ? "designation" : "group"}
            </button>
          )}
        </div>
      )}

      {adding && tab !== "opt" && tab !== "band" && (
        <div className="dmx-addbar">
          <label>{tab === "des" ? "Designation name" : "Group name"}
            <input className="dmx-txt" style={{ width: 240 }} autoFocus value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && submitAdd()} />
          </label>
          {tab === "des" && (
            <>
              <label>Band (optional)
                <select className="dmx-ctl" value={addForm.band} onChange={(e) => setAddForm((f) => ({ ...f, band: e.target.value }))}>
                  <option value="">(none)</option>
                  {draft.bands.map((b) => <option key={b}>{b}</option>)}
                </select>
              </label>
              <label>Next type
                <select className="dmx-ctl" value={addForm.nt} onChange={(e) => setAddForm((f) => ({ ...f, nt: e.target.value }))}>
                  <option value="">(none)</option>
                  {Object.keys(TYPES).filter((t) => draft.options[t]).map((t) => <option key={t} value={t}>{TYPES[t]}</option>)}
                </select>
              </label>
            </>
          )}
          <button type="button" className="dmx-main" onClick={submitAdd}>Add</button>
          <button type="button" className="emx-mini dmx-big" onClick={() => setAdding(false)}>Cancel</button>
          {addErr && <span className="dmx-err">{addErr}</span>}
        </div>
      )}

      <div className="emx-work" onClick={onGridClick}>
        <div className="emx-main">
          {loading ? (
            <div className="dmx-loading">Loading Designation Master…</div>
          ) : tab === "opt" ? (
            optionsPage
          ) : (
            <>
              <DataGrid
                defs={defs}
                grid={grid}
                allRows={rowsAll}
                rows={pageRows}
                rowKey={rowKey}
                selected={new Set(selId ? [selId] : [])}
                rowClass={(r) => (tab === "des" && r.status !== "Active" ? "emx-dim" : "")}
                emptyText="No rows match the filters"
              />
              <ClientPager
                page={page} pages={pageCount}
                from={view.length ? (page - 1) * PAGE_SIZE + 1 : 0}
                to={Math.min(view.length, page * PAGE_SIZE)}
                total={view.length} allTotal={rowsAll.length}
                onPage={(p) => setPages((s) => ({ ...s, [tab]: p }))}
                grid={grid}
              />
            </>
          )}

          {dirty && (
            <div className="dmx-pend">
              <span className="m">{changeCount} unsaved change{changeCount > 1 ? "s" : ""}</span>
              {badCount > 0 && <span className="e">{badCount} cell{badCount > 1 ? "s" : ""} need fixing</span>}
              <span style={{ flex: 1 }} />
              <button type="button" className="emx-mini dmx-big" onClick={handleDiscard} disabled={saving}>Discard</button>
              <button type="button" className="dmx-main" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </div>

        {panel.open && (
          <aside className="emx-panel dmx-panel">
            <div className="emx-ph">
              <b style={{ fontSize: 12, lineHeight: 1.35 }}>{panelTitle()}</b>
              <button type="button" onClick={() => updatePanel({ open: false })} aria-label="Fold the panel" title="Fold the panel">✕</button>
            </div>
            <div className="emx-ptabs">
              {[["pv", "Preview"], ["view", "My view"], ["aud", "Audit"]].map(([k, l]) => (
                <button key={k} type="button" className={ptab === k ? "on" : ""} onClick={() => updatePanel({ tab: k })}>{l}</button>
              ))}
            </div>
            <div className="emx-pbody">
              {ptab === "pv" && previewBody()}
              {ptab === "view" && viewBody()}
              {ptab === "aud" && auditBody()}
            </div>
            <div className="emx-pfoot">Read-only panel · facts only</div>
          </aside>
        )}
        <PanelTab open={panel.open} onOpen={() => updatePanel({ open: true })} />
      </div>

      {menu && menuModel && (
        <MemberMenu
          key={`${menu.kind}-${menu.id}`}
          model={menuModel}
          rect={menu.rect}
          onCancel={() => setMenu(null)}
          onApply={applyMenu}
        />
      )}

      <div className={"dmx-toast" + (toastMsg ? " on" : "")} role="status">{toastMsg}</div>
    </section>
  );
}

/* checkbox list popup shared by group members, the Multiple list and bands */
function MemberMenu({ model, rect, onCancel, onApply }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => new Set(model.picked));
  const ref = useRef(null);

  useEffect(() => {
    const out = (e) => ref.current && !ref.current.contains(e.target) && onCancel();
    const esc = (e) => e.key === "Escape" && onCancel();
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", out);
      document.removeEventListener("keydown", esc);
    };
  }, [onCancel]);

  const items = model.items.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()));
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 320));
  const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 360));
  const toggle = (id) =>
    setPicked((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const apply = () => {
    // keep the existing order, then append new picks (keeps the saved list order)
    const keep = model.picked.filter((id) => picked.has(id));
    const add = model.items.map((d) => d.id).filter((id) => picked.has(id) && !model.picked.includes(id));
    onApply([...keep, ...add]);
  };

  return (
    <div className="dmx-mm" ref={ref} style={{ left, top }}>
      <div className="h">{model.title}</div>
      <input className="dmx-txt" style={{ width: "100%" }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="lst">
        {items.map((d) => (
          <label key={d.id}>
            <input type="checkbox" checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
            {d.name}
            {d.status === "Active" ? "" : <span className="dmx-mut"> (inactive)</span>}
            <span className="dmx-mut"> · {d.department || "not in Employee Master yet"}</span>
          </label>
        ))}
      </div>
      <div className="ft">
        <button type="button" className="emx-mini" onClick={onCancel}>Cancel</button>
        <button type="button" className="emx-mini p" onClick={apply}>Apply</button>
      </div>
    </div>
  );
}

const CSS = `
.dmx{display:flex;flex-direction:column;flex:1;min-height:0;height:calc(100vh - 150px);min-height:420px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;font-size:12.5px;color:#111827;position:relative}
.dmx-tabs{display:flex;background:#FAFAFB;border-bottom:1px solid #E5E7EB;padding:0 14px;flex:none}
.dmx-tabs button{background:none;border:0;border-bottom:2px solid transparent;padding:10px 4px;margin-right:24px;font:inherit;font-size:13px;font-weight:600;color:#6B7280;cursor:pointer;white-space:nowrap}
.dmx-tabs button.on{color:#111827;font-weight:800;border-bottom-color:#102A43}
.dmx-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid #E5E7EB;flex:none}
.dmx-toolbar label{display:flex;gap:6px;align-items:center;color:#6B7280;font-weight:600}
.dmx-stat{color:#6B7280;font-weight:600}.dmx-stat b{color:#102A43}
.dmx-txt,.dmx-ctl{border:1px solid #D1D5DB;border-radius:6px;padding:5px 8px;background:#fff;font:inherit;color:inherit;min-width:0}
.dmx-ctl{background:#FFF9DC;width:100%;max-width:100%}
.dmx-toolbar .dmx-ctl,.dmx-addbar .dmx-ctl,.dmx-pvc .dmx-ctl{width:auto;background:#fff}
.dmx-ctl.ed{background:#DDD6FE;border-color:#8B5CF6}
.dmx-ctl.bad{border-color:#C0392B;outline:1px solid #C0392B}
.dmx-ctl.unm{border-color:#D92D20;color:#B42318;font-weight:700}
.dmx-big{padding:6px 12px;font-size:12.5px}
.emx-mini.tog{background:#E6EEF8;border-color:#9DBDEB;color:#102A43}
.dmx-main{border:1px solid #2F6FED;background:#2F6FED;color:#fff;border-radius:6px;padding:6px 14px;font:inherit;font-weight:800;text-transform:uppercase;letter-spacing:.03em;cursor:pointer}
.dmx-main:hover{background:#2560d4}.dmx-main:disabled{opacity:.5;cursor:not-allowed}
.dmx-addbar{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;padding:10px 14px;background:#DCEBFF;border-bottom:1px solid #B9D3F5;flex:none}
.dmx-addbar label{display:flex;flex-direction:column;gap:3px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#1D4FA8}
.dmx-err{color:#C0392B;font-weight:700;font-size:11.5px}
// .dmx-msg{display:flex;gap:10px;align-items:center;margin:10px 14px 0;padding:9px 12px;border-radius:8px;background:#FEF3F2;border:1px solid #FDA29B;color:#B42318;font-weight:600;flex:none}
// .dmx-msg span{flex:1}

/* Designation Master grid improvements */
.dmx .emx-wrap {
  width: 100%;
  max-width: 100%;
  border: 1px solid #D5DFEB;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(16, 42, 67, 0.05);
  overflow: auto;
}

.dmx .emx-table {
  width: 100% !important;
  font-size: 12.5px;
  border-collapse: separate;
  border-spacing: 0;
}

.dmx .emx-table th {
  background: #E8F0FA;
  color: #193B61;
  font-size: 11px;
  font-weight: 700;
  padding: 12px 10px;
  border-bottom: 1px solid #CBD8E8;
  white-space: nowrap;
}

.dmx .emx-table th:first-child {
  background: #DFEAF7;
}

.dmx .emx-table td {
  padding: 10px 9px;
  line-height: 1.4;
  border-bottom: 1px solid #E5EAF1;
  vertical-align: middle;
}

.dmx .emx-table tbody tr:nth-child(even) td {
  background-color: #F7F9FC;
}

.dmx .emx-table tbody tr:hover td {
  background-color: #EDF4FF;
}

.dmx .emx-table td select.dmx-ctl {
  width: 100%;
  min-height: 36px;
  border: 1px solid #C9D3E0;
  border-radius: 7px;
  background-color: #FFFFFF;
  padding: 6px 9px;
  color: #172B4D;
}

.dmx .emx-table td select.dmx-ctl:focus {
  outline: none;
  border-color: #5688D8;
  box-shadow: 0 0 0 3px rgba(86, 136, 216, 0.15);
}

.dmx .emx-table td select.dmx-ctl.ed {
  background-color: #F0EBFF;
  border-color: #A78BFA;
}

.dmx .emx-table tbody tr.emx-dim td {
  color: #7B8797;
}

.dmx .emx-table td .emx-mini {
  padding: 6px 10px;
  border-radius: 7px;
  border: 1px solid #CBD5E1;
  background: #FFFFFF;
  cursor: pointer;
}

.dmx .emx-table td .emx-mini:hover {
  background: #EFF6FF;
  border-color: #93B4E8;
}

.dmx .emx-work {
  width: 100%;
  min-width: 0;
  padding: 12px 14px;
  min-height: 0;
}
.dmx .emx-work{padding:12px 14px 12px;min-height:0}
.dmx .emx-panel{width:340px}
.dmx-loading{padding:40px;text-align:center;color:#6B7280}
.dmx-mut{color:#6B7280}
.dmx-unmp{display:inline-block;background:#D92D20;color:#fff;border-radius:5px;padding:2px 9px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.dmx-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.dmx-chip{background:#E6EEF8;color:#102A43;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:600}
.dmx-chip.gi{background:#F1F5F9;color:#64748B}
.dmx-mem{display:flex;align-items:center;gap:8px;min-width:0}
.dmx-mem span{overflow:hidden;text-overflow:ellipsis;min-width:0}
.dmx-mem.ed{background:#DDD6FE;border-radius:6px;padding:2px 4px}
.dmx-mem.bad{outline:1px solid #C0392B;border-radius:6px}
.dmx-hist{display:flex;align-items:center;gap:8px;min-width:0}
.dmx-hl{color:#64748B;font-size:10.5px;white-space:normal;line-height:1.25}
.emx-table td select,.emx-table td input[type=text]{font-size:12px}
.dmx-pend{display:flex;gap:10px;align-items:center;padding:10px 14px;margin-top:10px;border:1px solid #B9D3F5;background:#DCEBFF;border-radius:8px;flex:none}
.dmx-pend .m{color:#1D4FA8;font-weight:700}.dmx-pend .e{color:#C0392B;font-weight:700}
.dmx-opt{margin:4px 0;max-width:760px;background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:16px 18px;overflow:auto}
.dmx-opt h3{margin:0 0 4px;font-size:15px;color:#102A43}.dmx-opt p{margin:0 0 10px}
.dmx-opt .orow{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid #F0F1F3;cursor:pointer}
.dmx-opt .orow span{flex:1}.dmx-opt .orow b{display:block}.dmx-opt .orow small{display:block;color:#6B7280;font-weight:600;margin-top:2px}
.dmx-opt .orow em{font-style:normal;color:#6B7280;font-weight:700;font-size:11.5px}
.dmx-info{border:1px solid #E5E7EB;background:#F7F8FA;border-radius:8px;padding:6px 10px;font-size:12px}
.dmx-pvc{display:flex;gap:6px;margin-top:8px}.dmx-pvc .dmx-ctl{flex:1;min-width:0}
.dmx-call{border:1px solid #E5E7EB;border-left:5px solid #2F6FED;border-radius:8px;padding:9px 12px;margin-top:8px;background:#fff}
.dmx-call.am{border-left-color:#B7791F;background:#FEF6E7}.dmx-call.gr{border-left-color:#15803D;background:#ECFDF3}
.dmx-call .tg{font-size:10px;font-weight:800;text-transform:uppercase;color:#1D4FA8;background:#DCEBFF;border-radius:4px;padding:2px 7px}
.dmx-call.am .tg{color:#B7791F;background:#FDEBC8}.dmx-call.gr .tg{color:#15803D;background:#D5F3E1}
.dmx-call .ln{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;font-weight:700}
.dmx-call .sub{color:#6B7280;margin-top:2px}
.dmx-card{border:1px solid #E5E7EB;border-left:5px solid #2F6FED;border-radius:8px;padding:10px 12px;margin-top:8px}
.dmx-card h4{margin:0 0 6px;font-size:10.5px;font-weight:800;letter-spacing:.04em;color:#6B7280;text-transform:uppercase}
.dmx-card .rw{display:flex;justify-content:space-between;gap:8px;padding:3px 0}.dmx-card .rw+.rw{border-top:1px dashed #EEF0F3}
.dmx-note{font-size:10.5px;color:#6B7280;margin-top:4px}
.dmx-cmp{width:100%;border-collapse:collapse}.dmx-cmp td{padding:4px 0;font-size:12px}.dmx-cmp td:first-child{width:50%}
.dmx-mm{position:fixed;z-index:300;width:300px;background:#fff;border:1px solid #C9D8EC;border-radius:10px;box-shadow:0 8px 24px rgba(16,42,67,.18);padding:8px}
.dmx-mm .h{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#6B7280;margin:2px 2px 6px}
.dmx-mm .lst{max-height:220px;overflow:auto;border:1px solid #E5E7EB;border-radius:6px;margin-top:6px;padding:4px}
.dmx-mm .lst label{display:flex;gap:6px;align-items:center;padding:2px 4px;cursor:pointer}
.dmx-mm .ft{display:flex;justify-content:space-between;margin-top:8px}
.dmx-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#102A43;color:#fff;padding:9px 16px;border-radius:8px;font-weight:700;opacity:0;pointer-events:none;transition:opacity .2s;z-index:400}
.dmx-toast.on{opacity:1}
`;