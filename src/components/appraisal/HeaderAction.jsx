import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

/* Same tokens as DetailScreenPage */
const INK = "#102A43";
const LINE = "#E3E9EC";
const SOFT = "#EEF3F3";
const MUTED = "#5F7482";
const RED = "#B42318";
const LTEAL = "#0B7A75";
const FONT = '"Manrope", "Segoe UI", system-ui, Arial, sans-serif';

const initialsOf = (name) =>
  String(name || "?")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

/* Small click-outside + Esc helper */
function useDismiss(open, setOpen, attr) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!e.target?.closest?.(`[${attr}]`)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, attr]);
}

/* ------------------------------------------------------------------
   ProfileMenu — round icon with initials, login name in small text
   below it. Click opens a pop-up on the right, under the icon:
   name, email, the options that used to live in the gear button,
   and Sign out.

   items: [{ key, label, icon?: ReactNode, onClick?: fn, href?: string, divider?: bool }]
   ------------------------------------------------------------------ */
export function ProfileMenu({ user, items = [], onSignOut, dark = true }) {
  const [open, setOpen] = useState(false);
  useDismiss(open, setOpen, "data-profile-menu");

  const name = user?.name || "User";
  const email = user?.email || "";
  const role = user?.role || "";
  const firstName = name.split(/\s+/)[0];

  return (
    <div className="relative" data-profile-menu style={{ fontFamily: FONT }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={name}
        className="flex flex-col items-center gap-0.5 rounded-md px-2 py-0.5"
        style={{ background: "transparent" }}
      >
        <span
          className="grid h-[28px] w-[28px] place-items-center rounded-full text-[11px] font-extrabold"
          style={{
            background: "#E6F3F2",
            color: "#0B5F5B",
            boxShadow: open ? "0 0 0 3px rgba(11,122,117,.35)" : "none",
          }}
        >
          {initialsOf(name)}
        </span>
        <span
          className="max-w-[72px] truncate text-[10px] font-semibold leading-none"
          style={{ color: dark ? "#D6E0EC" : MUTED }}
        >
          {firstName}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[400] mt-1.5 w-[300px] overflow-hidden rounded-xl border bg-white text-[13px] shadow-[0_10px_30px_rgba(16,42,67,.16)]"
          style={{ borderColor: LINE, color: INK }}
        >
          <div
            className="flex items-center gap-3 border-b p-4"
            style={{ borderColor: SOFT }}
          >
            <div
              className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full text-[15px] font-extrabold"
              style={{ background: "#E6F3F2", color: "#0B5F5B" }}
            >
              {initialsOf(name)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[14.5px] font-extrabold">
                {name}
              </div>
              {email ? (
                <div
                  className="truncate text-[12px]"
                  style={{ color: MUTED }}
                  title={email}
                >
                  {email}
                </div>
              ) : null}
              {role ? (
                <span
                  className="mt-1 inline-block rounded px-2 py-px text-[10.5px] font-bold text-white"
                  style={{ background: LTEAL }}
                >
                  {role}
                </span>
              ) : null}
            </div>
          </div>

          <div className="max-h-[360px] overflow-auto p-1.5">
            <div
              className="flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide"
              style={{ color: MUTED }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </div>
            {items.map((it) =>
              it.divider ? (
                <hr
                  key={it.key}
                  className="my-1.5 border-0 border-t"
                  style={{ borderColor: SOFT }}
                />
              ) : (
                <button
                  key={it.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    if (it.href) window.location.assign(it.href);
                    else if (it.onClick) it.onClick();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-semibold hover:bg-[#F6F9F9]"
                  style={{ color: "#334E5C" }}
                >
                  {it.icon ? <span className="shrink-0">{it.icon}</span> : null}
                  {it.label}
                </button>
              ),
            )}
          </div>

          <div className="border-t p-2" style={{ borderColor: SOFT }}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (onSignOut) onSignOut();
              }}
              className="w-full rounded-lg border px-3 py-2 text-[13px] font-bold"
              style={{ borderColor: "#F4B4AE", color: RED, background: "#fff" }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   HeaderActions — View budget · My notes · Profile.
   Drop this at the right end of the top bar, where the gear icon is.
   NotesPopover is the one from the Detail screen file (export it).
   ------------------------------------------------------------------ */
export function HeaderActions({
  user,
  menuItems,
  onSignOut,
  onViewBudget,
  NotesPopover,
  notesContext,
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  useDismiss(notesOpen, setNotesOpen, "data-detail-notes");

  const btn = {
    borderColor: "rgba(255,255,255,.35)",
    background: "rgba(255,255,255,.08)",
    color: "#fff",
  };

  return (
    <div className="flex items-center gap-2" style={{ fontFamily: FONT }}>
      <button
        type="button"
        onClick={onViewBudget}
        className="rounded border px-3 py-1 text-[12.5px] font-semibold"
        style={btn}
      >
        View budget
      </button>

      <div className="relative" data-detail-notes>
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          className="rounded border px-3 py-1 text-[12.5px] font-semibold"
          style={btn}
        >
          ✎ My notes
        </button>
        {notesOpen && NotesPopover ? (
          <NotesPopover contextLabel={notesContext} />
        ) : null}
      </div>

      <ProfileMenu user={user} items={menuItems} onSignOut={onSignOut} />
    </div>
  );
}

/* ------------------------------------------------------------------
   HeaderSlot — puts its children in the top bar, at the far right.
   1) If your header has <div id="app-header-actions" />, it renders there.
   2) Otherwise it pins itself to the top-right corner of the window,
      over the gear, using the same navy as the header.
   Change HEADER_H if your header is not 61px tall.
   ------------------------------------------------------------------ */
const HEADER_H = 61;
export function HeaderSlot({ children }) {
  if (typeof document === "undefined") return null;
  const slot = document.getElementById("app-header-actions");
  if (slot) return createPortal(children, slot);
  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: HEADER_H,
        padding: "0 16px 0 24px",
        display: "flex",
        alignItems: "center",
        background: "#12304f",
        zIndex: 500,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}