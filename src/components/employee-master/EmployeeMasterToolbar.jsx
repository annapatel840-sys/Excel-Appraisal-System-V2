import { useEffect, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  History,
  Search,
  Upload,
} from "lucide-react";

import { usePanel } from "./panelStore";
import "./employee-master-ui.css";

export function EmployeeMasterToolbar({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  onDownloadTemplate,
  onUpload,
  onDownloadData,
  onAuditHistory,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [panel, updatePanel] = usePanel("em");

  useEffect(() => {
    const outside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target))
        setMenuOpen(false);
    };
    const esc = (event) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const run = (fn) => () => {
    setMenuOpen(false);
    fn?.();
  };

  return (
    <div className="em-toolbar">
      <div className="em-search">
        <Search size={14} />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setMenuOpen(false);
          }}
          placeholder="Search name, ID, email, manager"
        />
      </div>

      <select
        className="em-status-select"
        value={statusFilter}
        onChange={(event) => {
          setStatusFilter(event.target.value);
          setMenuOpen(false);
        }}
      >
        <option value="All">All Status</option>
        <option value="Active">Active</option>
        <option value="Inactive">Inactive</option>
      </select>

      <div className="em-toolbar-spacer" />

      <div className="em-menu-wrapper" ref={menuRef}>
        <button
          type="button"
          className="em-btn em-btn-primary"
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((current) => !current);
          }}
        >
          Menu ▾
        </button>

        {menuOpen && (
          <div
            className="em-menu-dropdown"
            role="menu"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={run(onDownloadTemplate)}
            >
              <FileSpreadsheet size={14} />
              <span>Download Template</span>
            </button>

            {onUpload && (
              <button type="button" role="menuitem" onClick={run(onUpload)}>
                <Upload size={14} />
                <span>Upload Employee Data</span>
              </button>
            )}

            <button type="button" role="menuitem" onClick={run(onDownloadData)}>
              <Download size={14} />
              <span>Export to Excel</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={run(() =>
                updatePanel({
                  open: true,
                  tab: "aud",
                  fullAudit: onAuditHistory || null,
                }),
              )}
            >
              <History size={14} />
              <span>Audit Trail</span>
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className="em-btn"
        onClick={() =>
          updatePanel({
            open: !panel.open,
            fullAudit: onAuditHistory || panel.fullAudit,
          })
        }
      >
        Panel {panel.open ? "‹" : "›"}
      </button>
    </div>
  );
}
