import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  Search,
  Upload,
} from "lucide-react";

export function EmployeeMasterToolbar({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  onDownloadTemplate,
  onUpload,
  onDownloadData,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleOutside(event) {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
    };
  }, []);

  return (
    <div className="em-toolbar">
      <div className="em-search">
        <Search size={14} />

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search employee..."
        />
      </div>

      <select
        className="em-status-select"
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
      >
        <option value="All">All Status</option>
        <option value="Active">Active</option>
        <option value="Inactive">Inactive</option>
      </select>

      <div className="em-toolbar-spacer" />

      <div className="em-menu-wrapper" ref={menuRef}>
        <button
          type="button"
          className="em-btn em-btn-ghost"
          onClick={() => setMenuOpen((current) => !current)}
        >
          Actions
          <ChevronDown size={14} />
        </button>

        {menuOpen && (
          <div className="em-menu-dropdown">
            <button
              type="button"
              onClick={() => {
                onDownloadTemplate();
                setMenuOpen(false);
              }}
            >
              <FileSpreadsheet size={14} />
              Download Template
            </button>

            <button
              type="button"
              onClick={() => {
                onUpload();
                setMenuOpen(false);
              }}
            >
              <Upload size={14} />
              Upload Employee Data
            </button>

            <button
              type="button"
              onClick={() => {
                onDownloadData();
                setMenuOpen(false);
              }}
            >
              <Download size={14} />
              Download Visible Data
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
