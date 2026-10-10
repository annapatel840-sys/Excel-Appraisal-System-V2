import { useEffect, useRef, useState } from "react";
import { Check, LogOut, RotateCcw, Save } from "lucide-react";

import { useCatalystSignOut, useCatalystUser } from "@/lib/catalyst-auth";
import { DEFAULT_SETTINGS, useSettings } from "@/lib/settings-store";
import { cn } from "@/lib/utils";

// Same options the old gear / Settings page offered.
const THEMES = [
  { id: "navy", label: "Navy Blue", description: "Current project theme", swatch: "#173b63" },
  { id: "slate", label: "Slate Blue", description: "A softer alternate blue", swatch: "#334155" },
  { id: "mono", label: "Black & White", description: "High-contrast monochrome", swatch: "#111111" },
];

const NAV_POSITIONS = [
  { id: "top", label: "Top header" },
  { id: "left", label: "Left / vertical" },
];

const initialsOf = (name, email) => {
  const parts = String(name || "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const source = parts.length ? parts : [String(email || "?")];
  return source
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
};

function SectionLabel({ children }) {
  return (
    <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </p>
  );
}

/**
 * Profile icon for the top bar. Replaces the old gear: clicking it opens a
 * pop-up with the login's name, email and role, the appearance / navigation
 * options that used to live behind the gear, and Sign out.
 */
export function ProfileMenu({ isVertical, isCollapsed, showSettings }) {
  const user = useCatalystUser();
  const signOut = useCatalystSignOut();
  const { settings, saveSettings, resetSettings } = useSettings();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(settings);
  const rootRef = useRef(null);

  const name = user?.name || "User";
  const email = user?.email || "";
  const role = user?.role || "";
  const initials = initialsOf(user?.name, email);
  const firstName = name.trim().split(/\s+/)[0];

  // Start each opening from the saved settings.
  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const update = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = () => {
    saveSettings(draft);
    setOpen(false);
  };
  const reset = () => {
    resetSettings();
    setDraft(DEFAULT_SETTINGS);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Profile and settings"
        title={name}
        className={cn(
          "flex items-center rounded-md text-white transition-colors hover:bg-white/10",
          open && "bg-white/10",
          isVertical
            ? "w-full gap-2 px-2 py-1.5"
            : "flex-col justify-center gap-0.5 px-2 py-0.5",
          isCollapsed && "justify-center px-0",
        )}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[var(--app-brand)]">
          {initials}
        </span>
        {!isCollapsed && (
          <span
            className={cn(
              "truncate leading-none text-white/80",
              isVertical ? "text-xs" : "max-w-[64px] text-[9px]",
            )}
          >
            {isVertical ? name : firstName}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Profile and settings"
          className={cn(
            "absolute z-[200] max-h-[calc(100vh-4rem)] w-[300px] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-[#d8e0ea] bg-white text-[#1f2f3d] shadow-xl",
            isVertical ? "bottom-0 left-full ml-2" : "right-0 top-full mt-1.5",
          )}
        >
          {/* Who is signed in */}
          <div className="flex items-center gap-3 border-b border-[#eef3f3] p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--app-brand)] text-sm font-bold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#102a43]">
                {name}
              </p>
              {email && (
                <p className="truncate text-xs text-slate-500" title={email}>
                  {email}
                </p>
              )}
              {role && (
                <span className="mt-1 inline-block rounded bg-slate-100 px-2 py-px text-[10px] font-semibold text-slate-700">
                  {role}
                </span>
              )}
            </div>
          </div>

          {/* What used to be behind the gear */}
          {showSettings && (
            <div className="space-y-4 p-3">
              <section>
                <SectionLabel>Theme</SectionLabel>
                <div className="space-y-1">
                  {THEMES.map((theme) => {
                    const selected = draft.theme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => update("theme", theme.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition",
                          selected
                            ? "border-[var(--app-brand)] ring-2 ring-[var(--app-brand)]/15"
                            : "border-[#e3e9ec] hover:border-[var(--app-brand)]/50",
                        )}
                      >
                        <span
                          className="size-6 shrink-0 rounded-md border border-black/10"
                          style={{ backgroundColor: theme.swatch }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium">
                            {theme.label}
                          </span>
                          <span className="block truncate text-[10px] text-slate-500">
                            {theme.description}
                          </span>
                        </span>
                        {selected && (
                          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--app-brand)] text-white">
                            <Check className="size-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <SectionLabel>Navigation</SectionLabel>
                <div className="grid grid-cols-2 gap-1.5">
                  {NAV_POSITIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => update("menuPosition", item.id)}
                      className={cn(
                        "rounded-lg border px-2.5 py-2 text-xs font-medium transition",
                        draft.menuPosition === item.id
                          ? "border-[var(--app-brand)] ring-2 ring-[var(--app-brand)]/15"
                          : "border-[#e3e9ec] hover:border-[var(--app-brand)]/50",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {draft.menuPosition === "left" && (
                  <label className="mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-[#e3e9ec] px-2.5 py-2">
                    <span>
                      <span className="block text-xs font-medium">
                        Collapse navigation labels
                      </span>
                      <span className="block text-[10px] text-slate-500">
                        Show only icons in the sidebar.
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(draft.menuCollapsed)}
                      onChange={(event) =>
                        update("menuCollapsed", event.target.checked)
                      }
                      className="size-4 shrink-0 accent-[var(--app-brand)]"
                    />
                  </label>
                )}
              </section>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#e3e9ec] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                >
                  <RotateCcw className="size-3.5" />
                  Reset to default
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--app-brand)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  <Save className="size-3.5" />
                  Save changes
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-[#eef3f3] p-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                if (typeof signOut === "function") signOut();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}