import { useCallback, useRef, useState } from "react";

/*
 * Drag-to-resize columns for the History panels.
 *
 * Widths are percentages of the table width and always add up to 100, so the
 * panel never needs a horizontal scrollbar: dragging the edge of a column
 * moves that edge only (the column on its right gives/takes the difference).
 *
 *   const { widths, startResize, reset } = useColumnResize(defaults, signature);
 *   - defaults:  array of percentages (sum 100)
 *   - signature: any string; when it changes (e.g. a column was hidden by
 *                access rules) the widths go back to `defaults`.
 *   - startResize(index, event, containerEl): call from onMouseDown of the
 *     handle that sits on the RIGHT edge of column `index`.
 *   - reset(): back to the defaults (used on double-click of a handle).
 */
export function useColumnResize(defaults, signature = "", minPct = 4) {
  const [state, setState] = useState({ sig: signature, widths: defaults });
  const widths = state.sig === signature ? state.widths : defaults;
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const startResize = useCallback(
    (index, event, containerEl) => {
      if (!containerEl || index < 0 || index >= widthsRef.current.length - 1)
        return;
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const total = containerEl.getBoundingClientRect().width || 1;
      const start = [...widthsRef.current];
      const pair = start[index] + start[index + 1];

      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (e) => {
        const delta = ((e.clientX - startX) / total) * 100;
        const left = Math.min(
          pair - minPct,
          Math.max(minPct, start[index] + delta),
        );
        const next = [...start];
        next[index] = left;
        next[index + 1] = pair - left;
        setState({ sig: signature, widths: next });
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [signature, minPct],
  );

  const reset = useCallback(
    () => setState({ sig: signature, widths: defaults }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );

  return { widths, startResize, reset };
}