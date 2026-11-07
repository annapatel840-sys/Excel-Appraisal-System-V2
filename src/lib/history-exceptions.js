/* Exception cycles in the history panels (Appraisal Sheet + Detailed Screen).
   An exception cycle (cycle type "Exceptional", e.g. "Exceptional 2026") is a change between two annual
   cycles. It is listed in the history, but:
     - it is NOT counted as a cycle ("4 cycles · 1 exception"),
     - the next normal cycle is compared with the previous NORMAL cycle, skipping the exception,
     - it shows no up / down change line and has its own text colour. */

/* Same rule the server uses (cycleTypeOf): the type is the start of the cycle name. */
export const isExceptionRecord = (record) =>
  /^exception/i.test(String(record?.cycleType || "").trim()) ||
  /^exception/i.test(String(record?.cycleName || "").trim());

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