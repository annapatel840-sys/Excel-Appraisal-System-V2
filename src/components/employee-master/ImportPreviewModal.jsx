import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ImportPreviewModal({
  open,
  title = "Import Preview",
  message = "",
  changes = [],
  onCancel,
  onConfirm,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-xl border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>

            {message && (
              <p className="mt-1 text-xs text-muted-foreground">{message}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Preview */}
        <div className="max-h-[55vh] overflow-auto p-5">
          {changes.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No changes found.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">
                      Employee
                    </th>

                    <th className="px-3 py-2 text-left font-semibold">
                      Emp ID
                    </th>

                    <th className="px-3 py-2 text-left font-semibold">
                      Change
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {changes.map((change, index) => (
                    <tr key={change.empId || index} className="border-t">
                      <td className="px-3 py-2">{change.name || "-"}</td>

                      <td className="px-3 py-2">{change.empId || "-"}</td>

                      <td className="px-3 py-2">
                        {change.change || change.description || "Updated"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>

          <Button type="button" onClick={onConfirm}>
            Confirm Import
          </Button>
        </div>
      </div>
    </div>
  );
}
