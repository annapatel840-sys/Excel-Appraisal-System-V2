import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ============================================================
   IMPORT - COLUMN MAPPING (shown before the preview)

   Every importable column of the file is listed with the field it will
   update. Columns that match a field are mapped automatically. The key
   column (Emp ID) is always mapped and cannot be changed or taken by
   another column.
============================================================ */

export function ImportMappingModal({
  open,
  title = "Import - map columns",
  fileName = "",
  rowCount = 0,
  headers = [],
  mapping = {},
  targets = [],
  keyField,
  keyLabel = "Emp ID",
  sampleOf,
  busy = false,
  onChange,
  onCancel,
  onContinue,
}) {
  if (!open) return null;

  const used = {};
  Object.values(mapping).forEach((key) => {
    if (key) used[key] = (used[key] || 0) + 1;
  });
  const duplicates = Object.entries(used)
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
  const labelOf = (key) => targets.find((t) => t.key === key)?.label || key;

  const hasKey = !!used[keyField];
  const dataColumns = Object.values(mapping).filter(
    (key) => key && key !== keyField,
  ).length;

  let error = "";
  if (!hasKey) error = `Map one column to ${keyLabel} so the rows can be matched.`;
  else if (duplicates.length)
    error = `More than one column is mapped to ${duplicates
      .map(labelOf)
      .join(", ")}. Each field can be mapped once.`;
  else if (!dataColumns) error = "Map at least one column to import.";

  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const skippedCount = headers.length - mappedCount;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {fileName} - {rowCount} row(s), {headers.length} column(s):{" "}
              <span className="text-emerald-700">{mappedCount} mapped</span>
              {skippedCount > 0 && (
                <span className="text-amber-700">
                  , {skippedCount} not imported
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Matching columns are mapped for you. {keyLabel} is always the key:
              a new {keyLabel} is added as a new employee, an existing one is
              updated.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Column in file</th>
                <th className="px-3 py-2 text-left font-semibold">Example</th>
                <th className="px-3 py-2 text-left font-semibold">Import into</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {headers.map((header) => {
                const key = mapping[header] || "";
                const isKey = key === keyField;
                const dup = key && duplicates.includes(key);

                return (
                  <tr key={header} className="border-t">
                    <td className="px-3 py-2 font-medium">{header}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {sampleOf ? sampleOf(header) : ""}
                    </td>
                    <td className="px-3 py-2">
                      {isKey ? (
                        <span className="inline-block w-full max-w-[240px] rounded border bg-muted/50 px-2 py-1.5 font-medium">
                          {keyLabel} (fixed)
                        </span>
                      ) : (
                        <select
                          value={key}
                          onChange={(event) => onChange(header, event.target.value)}
                          className={`h-8 w-full max-w-[240px] rounded border bg-background px-1.5 ${
                            dup ? "border-red-400" : ""
                          }`}
                        >
                          <option value="">- Don't import -</option>
                          {targets.map((target) => (
                            <option key={target.key} value={target.key}>
                              {target.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isKey ? (
                        <span className="text-muted-foreground">Key</span>
                      ) : key ? (
                        <span className="text-emerald-700">Mapped</span>
                      ) : (
                        <span className="text-amber-700">Not imported</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="border-t border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onContinue} disabled={!!error || busy}>
            {busy ? "Comparing..." : "Review changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}