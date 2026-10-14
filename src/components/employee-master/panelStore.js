import { useSyncExternalStore } from "react";

const DEFAULT = { open: false, tab: "view", fullAudit: null };
const state = {};
const listeners = new Set();

const get = (key) => state[key] || DEFAULT;

export function setPanel(key, patch) {
  state[key] = { ...get(key), ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* const [panel, update] = usePanel("em") */
export function usePanel(key) {
  const panel = useSyncExternalStore(subscribe, () => get(key));
  return [panel, (patch) => setPanel(key, patch)];
}
