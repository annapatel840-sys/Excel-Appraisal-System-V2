// The employee currently selected in the Appraisal Sheet / Detailed Screen.
// Shared so switching screens in the top nav keeps the same person open.
// Frontend only (kept in memory + sessionStorage); no backend involved.

const KEY = "appraisal.selectedEmpId";
let current = "";

export const getSelectedEmpId = () => {
  if (current) return current;

  try {
    current = window.sessionStorage.getItem(KEY) || "";
  } catch (_) {
    // storage unavailable — memory value only
  }

  return current;
};

export const setSelectedEmpId = (empId) => {
  const value = String(empId || "").trim();

  if (!value) return;

  current = value;

  try {
    window.sessionStorage.setItem(KEY, value);
  } catch (_) {
    // storage unavailable — memory value only
  }
};