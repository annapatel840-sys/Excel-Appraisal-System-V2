/* ============================================================
   Currency type + display format (set per location in Location Master).

   Location Master stores two settings for every location:
     currency_code            -> Currency type, e.g. "INR", "AED"
     currency_display_format  -> Display format, e.g. "12,34,567.89"

   The signed-in user's selected location (top bar) decides which pair is
   active. location-store.js calls setActiveCurrency() whenever the selected
   location or Location Master changes, and every screen formats money
   through the helpers below, so one change in Location Master shows up
   everywhere there is an amount.

   "All Locations" (no single location) keeps the original look: INR with
   the Default format.
   ============================================================ */
import { useSyncExternalStore } from "react";

/* ---------- Display formats (same list as the Zoho Creator currency field) ---------- */

export const DEFAULT_FORMAT = "Default";

// value = what is stored in Location Master (the sample itself, so it is readable in the table).
export const DISPLAY_FORMATS = [
  { value: "Default", label: "Default", group: "auto", decimal: "." },
  { value: "1,234,567.89", label: "1,234,567.89", group: ",", decimal: ".", indian: false },
  { value: "12,34,567.89", label: "12,34,567.89", group: ",", decimal: ".", indian: true },
  { value: "1 234 567,89", label: "1 234 567,89", group: "\u00A0", decimal: ",", indian: false },
  { value: "1.234.567,89", label: "1.234.567,89", group: ".", decimal: ",", indian: false },
];

const formatByValue = (value) => {
  const key = String(value ?? "").trim();
  return DISPLAY_FORMATS.find((f) => f.value === key) || DISPLAY_FORMATS[0];
};

/* ---------- Currency types (all ISO 4217 currencies the browser knows) ---------- */

const FALLBACK_CODES = [
  "AED", "AUD", "BDT", "BHD", "CAD", "CHF", "CNY", "EUR", "GBP", "HKD", "IDR", "INR", "JPY",
  "KRW", "KWD", "LKR", "MYR", "NPR", "NZD", "OMR", "PHP", "PKR", "QAR", "SAR", "SEK", "SGD",
  "THB", "USD", "ZAR",
];

let currencyListCache = null;

/** [{ code: "INR", name: "Indian Rupee", label: "INR Indian Rupee" }] sorted by code. */
export function currencyOptions() {
  if (currencyListCache) return currencyListCache;
  let codes = FALLBACK_CODES;
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      const all = Intl.supportedValuesOf("currency");
      if (all && all.length) codes = all;
    }
  } catch (_) {
    /* use the fallback list */
  }
  let names = null;
  try {
    names = new Intl.DisplayNames(["en"], { type: "currency" });
  } catch (_) {
    /* names are optional */
  }
  currencyListCache = [...new Set(codes)]
    .sort()
    .map((code) => {
      let name = "";
      try {
        name = (names && names.of(code)) || "";
      } catch (_) {
        name = "";
      }
      if (name === code) name = "";
      return { code, name, label: name ? `${code} ${name}` : code };
    });
  return currencyListCache;
}

/** "INR India Rupees" style label for a stored code (used in tables). */
export function currencyLabel(code) {
  const key = String(code ?? "").trim().toUpperCase();
  if (!key) return "";
  return currencyOptions().find((c) => c.code === key)?.label || key;
}

const symbolCache = new Map();

/** "₹", "AED", "$"... (falls back to the code; CAD -> "CA$", AUD -> "A$" so dollars stay distinguishable). */
export function currencySymbol(code) {
  const key = String(code ?? "").trim().toUpperCase() || "INR";
  if (symbolCache.has(key)) return symbolCache.get(key);
  let symbol = key;
  try {
    const part = new Intl.NumberFormat("en", {
      style: "currency",
      currency: key,
      currencyDisplay: "symbol",
    })
      .formatToParts(1)
      .find((p) => p.type === "currency");
    if (part && part.value) symbol = part.value;
  } catch (_) {
    /* unknown code: show it as typed */
  }
  symbolCache.set(key, symbol);
  return symbol;
}

/* ---------- Active configuration ---------- */

const DEFAULT_CONFIG = Object.freeze({ code: "INR", format: DEFAULT_FORMAT });
let active = DEFAULT_CONFIG;
const listeners = new Set();

const normalizeConfig = (cfg) => ({
  code: String(cfg?.code ?? cfg?.currency_code ?? "").trim().toUpperCase() || DEFAULT_CONFIG.code,
  format: formatByValue(cfg?.format ?? cfg?.currency_display_format).value,
});

export function getActiveCurrency() {
  return active;
}

export function setActiveCurrency(cfg) {
  const next = normalizeConfig(cfg);
  if (next.code === active.code && next.format === active.format) return;
  active = Object.freeze(next);
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Re-renders the component whenever the active currency / format changes. */
export function useCurrencyConfig() {
  return useSyncExternalStore(subscribe, getActiveCurrency, () => DEFAULT_CONFIG);
}

/* ---------- Formatting ---------- */

// "Default" follows the currency's own convention: lakh grouping for INR, thousands elsewhere.
function resolveFormat(cfg) {
  const fmt = formatByValue(cfg.format);
  if (fmt.value !== DEFAULT_FORMAT) return fmt;
  return cfg.code === "INR"
    ? formatByValue("12,34,567.89")
    : formatByValue("1,234,567.89");
}

function groupDigits(digits, fmt) {
  if (fmt.indian) {
    if (digits.length <= 3) return digits;
    const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, fmt.group);
    return head + fmt.group + digits.slice(-3);
  }
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, fmt.group);
}

/**
 * Number in the active display format, no symbol: 1234567 -> "12,34,567".
 * decimals = digits after the point (the appraisal screens show whole amounts).
 */
export function money(value, { decimals = 0, config } = {}) {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(typeof value === "string" ? value.replace(/[^0-9.+\-eE]/g, "") : value);
  if (!Number.isFinite(n)) return "";
  const fmt = resolveFormat(config ? normalizeConfig(config) : active);
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const body = groupDigits(int, fmt) + (frac ? fmt.decimal + frac : "");
  // Never print "-0".
  return n < 0 && Number(fixed) !== 0 ? `-${body}` : body;
}

/** "₹ 12,34,567" / "AED 1,234,567" using the active currency. */
export function moneyWithSymbol(value, opts = {}) {
  const body = money(value, opts);
  if (body === "") return "";
  const symbol = currencySymbol((opts.config ? normalizeConfig(opts.config) : active).code);
  return body.startsWith("-") ? `-${symbol} ${body.slice(1)}` : `${symbol} ${body}`;
}

/** True when the active format groups in lakhs (12,34,567), so L / Cr short forms make sense. */
export const usesLakhGrouping = () => Boolean(resolveFormat(active).indian);

/**
 * Amount without symbol in lakhs ("12.50 L") for lakh-grouped formats, otherwise
 * thousands / millions ("1.20 M"). Used by the budget bars and side panels.
 */
export function moneyLakhs(value) {
  const n = Number(value) || 0;
  if (usesLakhGrouping()) return `${(n / 1e5).toFixed(2)} L`;
  return moneyCompact(n, { withSymbol: false });
}

/** Symbol of the active currency. */
export const activeSymbol = () => currencySymbol(active.code);

/**
 * Short form for tight spaces. Lakh / crore when the format groups in lakhs
 * ("₹ 4.25 Cr", "₹ 12.50 L"), otherwise thousands / millions ("AED 1.20 M").
 */
export function moneyCompact(value, { withSymbol = true } = {}) {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const fmt = resolveFormat(active);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const sym = withSymbol ? `${activeSymbol()} ` : "";
  const dec = (x) => x.toFixed(2).replace(".", fmt.decimal);
  let text;
  if (fmt.indian) {
    if (abs >= 1e7) text = `${dec(abs / 1e7)} Cr`;
    else if (abs >= 1e5) text = `${dec(abs / 1e5)} L`;
    else text = money(abs);
  } else if (abs >= 1e9) text = `${dec(abs / 1e9)} B`;
  else if (abs >= 1e6) text = `${dec(abs / 1e6)} M`;
  else if (abs >= 1e3) text = `${dec(abs / 1e3)} K`;
  else text = money(abs);
  return `${sign}${sym}${text}`;
}

/** Excel number-format code for the active currency (used by export-excel). */
export function excelCurrencyFormat() {
  const fmt = resolveFormat(active);
  const sym = `"${activeSymbol().replace(/"/g, "")}"`;
  // Excel groups per the viewer's locale; lakh grouping needs an explicit conditional mask.
  if (fmt.indian) {
    return `[>=10000000]${sym}##\\,##\\,##\\,##0;[>=100000]${sym}##\\,##\\,##0;${sym}##,##0`;
  }
  return `${sym}#,##0`;
}

/** Parse what a person typed back into a number: "12,34,567", "1.234.567,50", "₹ 5000". */
export function parseMoney(text) {
  if (typeof text === "number") return text;
  let s = String(text ?? "").replace(/[^\d.,\-\u00A0 ]/g, "").replace(/[\u00A0 ]/g, "");
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Whichever comes last is the decimal mark.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = /,\d{1,2}$/.test(s) && s.split(",").length === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot > -1 && s.split(".").length > 2) {
    s = s.replace(/\./g, "");
  }
  return Number(s);
}