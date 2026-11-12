/* Appraisal cycle names.
   An org-wide cycle is "<Type> <Year>" ("Annual 2027"); a location cycle puts
   the location first: "<Location> - <Type> <Year>" ("Dubai - Annual 2027").
   Several screens read the cycle type from the start of the name, so they use
   cycleNameWithoutLocation() to skip the "<Location> - " part first.
   Keep in step with cycleNameWithoutLocation in functions/payrollcycleapi/index.js. */

const CYCLE_TYPE_START = /^(annual|mid-year|exceptional|new joiner)\b/i;

export function cycleNameWithoutLocation(name) {
  const text = String(name || "").trim();
  const match = text.match(/^(.+?)\s+-\s+(.+)$/);
  return match && CYCLE_TYPE_START.test(match[2]) ? match[2] : text;
}

// "Dubai - Annual 2027" -> "Dubai"; "Annual 2027" -> "".
export function cycleNameLocation(name) {
  const text = String(name || "").trim();
  const match = text.match(/^(.+?)\s+-\s+(.+)$/);
  return match && CYCLE_TYPE_START.test(match[2]) ? match[1] : "";
}

export function withCycleLocation(baseName, location, isAll) {
  return isAll ? baseName : `${String(location).trim()} - ${baseName}`;
}
