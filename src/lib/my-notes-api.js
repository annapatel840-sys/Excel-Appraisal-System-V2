/* Tech-Ed "My notes" and Appraisal Sheet "Last Edited" - backend side.

   Both live in the LastEdit_MyNotes table, reached through payrollcycleapi
   (resource=mynotes). The server only serves Tech-Ed logins and only ever
   touches the rows owned by the signed-in employee. Every other login keeps
   using this browser's storage, exactly as before.

   Notes are kept per location, so a Tech-Ed who works in two locations sees
   the notes of the location that is selected. */

import { useCallback, useEffect, useState } from "react";

import { payrollCycleRequest } from "./payroll-cycle-api";
import { useCatalystUser } from "./catalyst-auth";
import { roleIdOf } from "./view-as-store";

// True for a real Tech-Ed login (not an HR login previewing the Tech-Ed view).
export function useIsTechEdLogin() {
  const user = useCatalystUser();
  return roleIdOf(user?.role) === "teched";
}

const mynotes = (options) => payrollCycleRequest("mynotes", options);
const post = (body) => mynotes({ method: "POST", body });

export async function fetchMyNotes({ screen, location }) {
  const data = await mynotes({ query: { type: "notes", screen, location: location || "All" } });
  return Array.isArray(data?.notes) ? data.notes : [];
}

export async function saveMyNote({ screen, location, cycle, text, ctx }) {
  const data = await post({ action: "save_note", screen, location: location || "All", cycle, text, ctx });
  return data?.note || null;
}

export async function deleteMyNote(id) {
  await post({ action: "delete_note", id });
}

export async function fetchLastEditFromServer({ location, cycle }) {
  const data = await mynotes({
    query: { type: "last_edit", location: location || "All", cycle: cycle || "" },
  });
  return data?.lastEdit || null;
}

export async function saveLastEditToServer({ location, cycle, source, batchId, empIds, merge }) {
  const data = await post({
    action: "save_last_edit",
    location: location || "All",
    cycle: cycle || "",
    source,
    batchId,
    empIds,
    merge: Boolean(merge),
  });
  return data?.lastEdit || null;
}

// "20 Nov 2026 14:05" in the browser's own time, like notes written before.
export function formatNoteStamp(ms) {
  const d = ms ? new Date(ms) : new Date();
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    " " +
    `0${d.getHours()}`.slice(-2) +
    ":" +
    `0${d.getMinutes()}`.slice(-2)
  );
}

// Detailed Screen notes saved in the account. Returns null for any login that
// is not a Tech-Ed (those keep their notes in the browser). Each saved note is
// { id, at, text, ctx }, the shape the notes pop-up already draws.
const toView = (note) => ({
  id: String(note.id),
  at: formatNoteStamp(note.editedAtMs),
  text: note.text || "",
  ctx: note.ctx || "",
});

export function useRemoteDetailNotes(enabled, location) {
  const [state, setState] = useState({ notes: [], status: "loading" });

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const list = await fetchMyNotes({ screen: "DETAIL", location });
      setState({ notes: list.map(toView), status: "ready" });
    } catch (error) {
      setState((previous) => ({ ...previous, status: "failed" }));
    }
  }, [enabled, location]);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    setState((previous) => ({ ...previous, status: "loading" }));
    fetchMyNotes({ screen: "DETAIL", location })
      .then((list) => {
        if (alive) setState({ notes: list.map(toView), status: "ready" });
      })
      .catch(() => {
        if (alive) setState({ notes: [], status: "failed" });
      });
    return () => {
      alive = false;
    };
  }, [enabled, location]);

  if (!enabled) return null;

  return {
    notes: state.notes,
    status: state.status,
    reload,
    add: async ({ text, ctx }) => {
      const saved = await saveMyNote({ screen: "DETAIL", location, text, ctx });
      if (saved) setState((previous) => ({ status: "ready", notes: [...previous.notes, toView(saved)] }));
    },
    remove: async (id) => {
      await deleteMyNote(id);
      setState((previous) => ({ ...previous, notes: previous.notes.filter((note) => note.id !== id) }));
    },
  };
}