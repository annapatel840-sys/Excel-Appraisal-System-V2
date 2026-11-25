import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const fmtTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())} ${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function UndoImportModal({ open, batch, busy = false, onCancel, onConfirm }) {
  if (!open || !batch) return null;

  const items = batch.items || [];
  const updated = items.filter((item) => !item.isNew);
  const added = items.filter((item) => item.isNew);
  const cells = updated.reduce((sum, item) => sum + Object.keys(item.fields || {}).length, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold">Undo last import</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm">
          <div className="grid grid-cols-[90px_1fr] gap-y-1">
            <span className="text-muted-foreground">Imported</span>
            <span className="font-medium">
              {fmtTime(batch.at)}
              {batch.by ? ` by ${batch.by}` : ""}
            </span>
            <span className="text-muted-foreground">Updated</span>
            <span className="font-medium">
              {updated.length} employee{updated.length === 1 ? "" : "s"} · {cells} value
              {cells === 1 ? "" : "s"}
            </span>
            <span className="text-muted-foreground">Added</span>
            <span className="font-medium">
              {added.length} new employee{added.length === 1 ? "" : "s"}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            The old values are put back. A value changed again after the import is left as it is.
            {added.length > 0 && " Newly added employees are not removed."}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "Undoing..." : "Undo import"}
          </Button>
        </div>
      </div>
    </div>
  );
}
