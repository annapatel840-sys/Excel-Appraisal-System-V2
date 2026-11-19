/* ============================================================
   Location Master: Currency type + Display format dropdowns
   (modelled on the Zoho Creator currency field).

   - CurrencyTypeSelect   searchable list of every currency, "INR Indian Rupee"
   - DisplayFormatSelect  Default / 1,234,567.89 / 12,34,567.89 / 1 234 567,89 / 1.234.567,89
   - CurrencyPreview      shows a sample amount in the chosen type + format

   The list opens in a portal with fixed positioning, so it is never clipped
   by the scrolling Location Master table or a modal.
   ============================================================ */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  DISPLAY_FORMATS,
  currencyOptions,
  moneyWithSymbol,
} from "@/lib/currency-format";

function PickerSelect({
  value,
  onChange,
  options,
  searchable = false,
  placeholder = "Select",
  disabled = false,
  title,
  ariaLabel,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const activeRef = useRef(null);

  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const room = window.innerHeight - r.bottom;
    const menuHeight = Math.min(320, 52 + options.length * 36);
    // Open upwards when there is no room below.
    const up = room < menuHeight + 12 && r.top > room;
    setRect({
      left: r.left,
      width: Math.max(r.width, 220),
      top: up ? undefined : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : undefined,
      maxHeight: Math.max(160, Math.min(320, (up ? r.top : room) - 16)),
    });
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (triggerRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    if (searchable) searchRef.current?.focus();
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [open, searchable]);

  const choose = (next) => {
    onChange?.(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`em-picker-trigger ${open ? "is-open" : ""} ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected ? "" : "em-picker-placeholder"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className="em-picker-chevron" />
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            className="em-picker-menu"
            role="presentation"
            style={{
              left: rect.left,
              width: rect.width,
              top: rect.top,
              bottom: rect.bottom,
              maxHeight: rect.maxHeight,
            }}
          >
            {searchable && (
              <div className="em-picker-search">
                <Search size={14} />
                <input
                  ref={searchRef}
                  value={query}
                  aria-label="Search"
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (shown[0]) choose(shown[0].value);
                    }
                  }}
                />
              </div>
            )}
            <div className="em-picker-list" role="listbox">
              {shown.map((o) => {
                const isActive = o.value === value;
                return (
                  <button
                    key={o.value}
                    ref={isActive ? activeRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={isActive ? "is-active" : ""}
                    onClick={() => choose(o.value)}
                  >
                    <span>{o.label}</span>
                    {isActive && <Check size={14} />}
                  </button>
                );
              })}
              {!shown.length && <div className="em-picker-empty">No match</div>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

const FORMAT_OPTIONS = DISPLAY_FORMATS.map((f) => ({ value: f.value, label: f.label }));

export function CurrencyTypeSelect({ value, onChange, ...rest }) {
  const code = String(value || "").trim().toUpperCase();
  const options = useMemo(() => {
    const list = currencyOptions().map((c) => ({ value: c.code, label: c.label }));
    // A code saved earlier that is not in the standard list stays selectable.
    return code && !list.some((o) => o.value === code)
      ? [{ value: code, label: code }, ...list]
      : list;
  }, [code]);
  return (
    <PickerSelect
      value={code}
      onChange={onChange}
      options={options}
      searchable
      placeholder="Select currency type"
      {...rest}
    />
  );
}

export function DisplayFormatSelect({ value, onChange, ...rest }) {
  return (
    <PickerSelect
      value={String(value || "").trim() || "Default"}
      onChange={onChange}
      options={FORMAT_OPTIONS}
      placeholder="Select display format"
      {...rest}
    />
  );
}

export function CurrencyPreview({ code, format }) {
  const sample = moneyWithSymbol(1234567.89, {
    decimals: 2,
    config: { code, format },
  });
  return (
    <div className="em-currency-preview" aria-live="polite">
      <span>Preview</span>
      <strong>{sample}</strong>
    </div>
  );
}