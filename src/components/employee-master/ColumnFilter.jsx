import { useEffect, useRef, useState } from "react";
import { Filter, Search, X } from "lucide-react";

export function ColumnFilter({ column, rows, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value?.type === "text" ? value.term : "");

  const ref = useRef(null);

  const values = [
    ...new Set(
      rows.map((row) => column.get?.(row) ?? "").filter((item) => item !== ""),
    ),
  ].sort();

  const selectedValues =
    value?.type === "select" ? value.values : new Set(values);

  useEffect(() => {
    function handleOutside(event) {
      if (!ref.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
    };
  }, []);

  const toggleValue = (item) => {
    const next = new Set(selectedValues);

    if (next.has(item)) {
      next.delete(item);
    } else {
      next.add(item);
    }

    onChange({
      type: "select",
      values: next,
    });
  };

  const clearFilter = () => {
    onChange(null);
    setText("");
    setOpen(false);
  };

  const applyText = () => {
    if (!text.trim()) {
      onChange(null);
    } else {
      onChange({
        type: "text",
        term: text.trim(),
      });
    }

    setOpen(false);
  };

  const hasFilter =
    value &&
    ((value.type === "text" && value.term) ||
      (value.type === "select" && value.values.size !== values.length));

  return (
    <div ref={ref} className="em-column-filter">
      <button
        type="button"
        className={`em-filter-button ${hasFilter ? "active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        title="Filter column"
      >
        <Filter size={12} />
      </button>

      {open && (
        <div className="em-column-filter-panel">
          {column.type === "text" ? (
            <div className="em-text-filter">
              <div className="em-filter-search">
                <Search size={13} />

                <input
                  autoFocus
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      applyText();
                    }
                  }}
                  placeholder="Search..."
                />
              </div>

              <div className="em-filter-actions">
                <button type="button" onClick={applyText}>
                  Apply
                </button>

                <button type="button" onClick={clearFilter}>
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="em-filter-top">
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      type: "select",
                      values: new Set(values),
                    })
                  }
                >
                  Select all
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      type: "select",
                      values: new Set(),
                    })
                  }
                >
                  Clear
                </button>
              </div>

              <div className="em-filter-values">
                {values.map((item) => (
                  <label key={item} className="em-filter-option">
                    <input
                      type="checkbox"
                      checked={selectedValues.has(item)}
                      onChange={() => toggleValue(item)}
                    />

                    <span>{item}</span>
                  </label>
                ))}
              </div>

              <button
                type="button"
                className="em-filter-close"
                onClick={() => setOpen(false)}
              >
                <X size={12} />
                Done
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
