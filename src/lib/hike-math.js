/* ============================================================
HIKE % <-> HIKE AMOUNT  (one rule, used everywhere)

  Typed Hike Amount  -> the amount is saved exactly as typed;
                        Hike % = amount / current base pay x 100,
                        rounded to 2 decimals.
  Typed Hike %       -> Hike % is saved rounded to 2 decimals;
                        Hike Amount = base pay x % / 100,
                        rounded to the NEAREST 100 (half rounds up).

Only the field that was typed drives the other one. A Hike % that is
merely the rounded display of an amount must never be used to rebuild
that amount (27,000 -> 14.54% -> 26,992).
============================================================ */

// Round to `decimals` places, half away from zero, without the usual
// floating-point surprises (1.005 -> 1.01).
const roundTo = (value, decimals) => {
  const factor = 10 ** decimals;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const scaled = Number((Math.abs(n) * factor).toFixed(6));
  return (Math.sign(n) * Math.round(scaled)) / factor;
};

export const roundPct = (pct) => roundTo(pct, 2);

// Typed Hike % -> Hike Amount, nearest 100, half rounds up.
export const hikeAmountFromPct = (basePay, pct) => {
  const base = Number(basePay) || 0;
  const p = Number(pct) || 0;
  const hundreds = Number(((base * p) / 100 / 100).toFixed(8));
  return Math.round(hundreds) * 100;
};

// Typed Hike Amount -> Hike %, 2 decimals.
export const hikePctFromAmount = (basePay, amount) => {
  const base = Number(basePay) || 0;
  return base ? roundPct(((Number(amount) || 0) / base) * 100) : 0;
};