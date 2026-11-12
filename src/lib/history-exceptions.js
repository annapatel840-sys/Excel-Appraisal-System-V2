/* Exception cycles in the history panels (Appraisal Sheet + Detailed Screen).
   An exception cycle (cycle type "Exceptional", e.g. "Exceptional 2026") is a change between two annual
   cycles. It is listed in the history, but:
     - it is NOT counted as a cycle ("4 cycles · 1 exception"),
     - the next normal cycle is compared with the previous NORMAL cycle, skipping the exception,
     - it shows no up / down change line and has its own text colour. */

import { cycleNameWithoutLocation } from "@/lib/cycle-name";

/* Same rule the server uses (cycleTypeOf): the type is the start of the cycle name,
   after any "<Location> - " prefix ("Dubai - Exceptional 2027"). */
export const isExceptionRecord = (record) =>
  /^exception/i.test(String(record?.cycleType || "").trim()) ||
  /^exception/i.test(cycleNameWithoutLocation(record?.cycleName));

/* The next older record that is a normal cycle (used as "previous" for the change %). */
export const olderNormal = (records, index) => {
  for (let i = index + 1; i < (records || []).length; i += 1) {
    if (!isExceptionRecord(records[i])) return records[i];
  }
  return undefined;
};

export const countCycles = (records) => {
  const list = records || [];
  const exceptions = list.filter(isExceptionRecord).length;
  return { cycles: list.length - exceptions, exceptions };
};

/* "4 cycles · 1 exception" */
export const cycleCountText = (records) => {
  const { cycles, exceptions } = countCycles(records);
  return (
    `${cycles} cycle${cycles === 1 ? "" : "s"}` +
    (exceptions ? ` · ${exceptions} exception${exceptions === 1 ? "" : "s"}` : "")
  );
};

/* Look of an exception row (from the reference screen). */
export const EXCEPTION_ROW_BG = "#FBFCFD";
export const EXCEPTION_TEXT = "#5F7482";
export const EXCEPTION_NAME = "#8A4B00";

/* Base pay chain: a row's Current Base Pay is the New Base Pay of the row before it (older), which may be an
   exception or a normal cycle. Records are newest first. Rows that follow an exception are re-based on it:
   Current Base Pay = the exception's New Base Pay, New Base Pay = that + the row's hike, Total CTC moves with it. */
export const chainBases = (records) => {
  const list = Array.isArray(records) ? records.slice() : [];
  for (let i = list.length - 2; i >= 0; i -= 1) {
    const older = list[i + 1];
    const base = Number(older?.newBasePay) || 0;
    if (!isExceptionRecord(older) || base <= 0) continue;
    const row = list[i];
    const hike = Number(row.hikeAmount) || 0;
    const bonuses = (Number(row.newCTC) || 0) - (Number(row.newBasePay) || 0);
    list[i] = {
      ...row,
      basePay: base,
      newBasePay: base + hike,
      newCTC: base + hike + bonuses,
    };
  }
  return list;
};