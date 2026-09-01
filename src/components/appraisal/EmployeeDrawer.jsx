import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { AuditList } from "./AuditTrail";
import { StatusBadge } from "./StatusBadge";

import {
  MANAGER_RATINGS,
  hikePct,
  inr,
  payoutPct,
  revisedCTC,
  totalPayout,
} from "@/lib/appraisal-data";

import { useAppraisal } from "@/lib/appraisal-store";

function Field({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

export function EmployeeDrawer({ employee, onOpenChange }) {
  const { updateCell, historyFor } = useAppraisal();

  const [comments, setComments] = useState("");

  useEffect(() => {
    setComments(employee?.comments ?? "");
  }, [employee]);

  if (!employee) {
    return null;
  }

  const history = historyFor(employee.empId);

  const save = () => {
    updateCell(employee.id, "comments", comments, "Drawer");

    toast.success("Appraisal saved", {
      description: `${employee.name} · changes recorded in audit trail.`,
    });
  };

  const submit = () => {
    updateCell(employee.id, "comments", comments, "Drawer");
    updateCell(employee.id, "status", "Submitted", "Drawer");

    toast.success("Appraisal submitted", {
      description: `${employee.name} moved to Submitted.`,
    });

    onOpenChange(false);
  };

  return (
    <div className="relative w-full rounded-xl border border-border bg-card shadow-sm">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-lg font-semibold">Employee Details</h3>

          <p className="text-sm text-muted-foreground">
            {employee.empId} · {employee.department}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onOpenChange(false)}
          aria-label="Close employee details"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* CONTENT */}
      <Tabs defaultValue="details" className="w-full">
        {/* TABS */}
        <div className="border-b border-border px-4 pt-3">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="details" className="min-w-[140px]">
              Appraisal
            </TabsTrigger>

            <TabsTrigger value="history" className="min-w-[140px]">
              History {history.length ? `(${history.length})` : ""}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* APPRAISAL */}
        <TabsContent value="details" className="mt-0">
          <div className="space-y-4 p-4">
            {/* EMPLOYEE INFORMATION */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
              <Field label="Employee ID" value={employee.empId} />

              <Field label="Employee Name" value={employee.name} />

              <Field label="Department" value={employee.department} />

              <Field label="Designation" value={employee.designation} />

              <Field label="Manager" value={employee.manager} />

              <Field
                label="Status"
                value={<StatusBadge status={employee.status} />}
              />
            </div>

            <Separator />

            {/* MANAGER RATING */}
            <div className="max-w-sm space-y-1.5">
              <Label>Current Manager Rating</Label>

              <Select
                value={employee.managerRating}
                onValueChange={(v) =>
                  updateCell(employee.id, "managerRating", v, "Drawer")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {MANAGER_RATINGS.map((rating) => (
                    <SelectItem key={rating} value={rating}>
                      {rating}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* COMPENSATION INFORMATION */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
              <Field
                label="Current CTC"
                value={<span className="num">{inr(employee.currentCTC)}</span>}
              />

              <Field
                label="Revised CTC"
                value={
                  <span className="num text-primary">
                    {inr(revisedCTC(employee))}
                  </span>
                }
              />

              <Field
                label="Target Perf. Bonus"
                value={
                  <span className="num">
                    {inr(employee.targetPerformanceBonus)}
                  </span>
                }
              />

              <Field
                label="Performance Bonus"
                value={
                  <span className="num">{inr(employee.performanceBonus)}</span>
                }
              />

              <Field
                label="Retention Bonus"
                value={
                  <span className="num">{inr(employee.retentionBonus)}</span>
                }
              />

              <Field
                label="Bonus Payout %"
                value={
                  <span className="num">{payoutPct(employee).toFixed(1)}%</span>
                }
              />

              <Field
                label="Hike Amount"
                value={<span className="num">{inr(employee.hikeAmount)}</span>}
              />

              <Field
                label="Hike %"
                value={
                  <span className="num">{hikePct(employee).toFixed(1)}%</span>
                }
              />
            </div>

            {/* TOTAL PAYOUT */}
            <div className="rounded-lg border border-primary/25 bg-primary/6 p-3">
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Total Payout
              </p>

              <p className="num mt-1 text-2xl font-semibold text-primary">
                {inr(totalPayout(employee))}
              </p>
            </div>

            {/* COMMENTS */}
            <div className="space-y-1.5">
              <Label htmlFor="comments">Manager Comments</Label>

              <Textarea
                id="comments"
                rows={4}
                value={comments}
                placeholder="Summary of performance, compensation rationale…"
                onChange={(e) => setComments(e.target.value)}
              />
            </div>

            {/* ACTIONS */}
            <div className="flex gap-2 pb-1">
              <Button variant="outline" className="flex-1" onClick={save}>
                Save
              </Button>

              <Button className="flex-1" onClick={submit}>
                Submit Appraisal
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history" className="mt-0">
          <div className="p-4">
            <AuditList entries={history} compact={true} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
