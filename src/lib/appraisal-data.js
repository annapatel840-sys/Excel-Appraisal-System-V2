export const MANAGER_RATINGS = [
    "Exceeds Expectation",
    "Meets Expectation",
    "Sometimes Meets Expectation",
];
export const STATUSES = ["Pending", "In Progress", "Completed", "Submitted"];
export const hikePct = (r) => (r.currentCTC ? (r.hikeAmount / r.currentCTC) * 100 : 0);
export const revisedCTC = (r) => r.currentCTC + r.hikeAmount;
export const payoutPct = (r) => r.targetPerformanceBonus ? (r.performanceBonus / r.targetPerformanceBonus) * 100 : 0;
export const totalPayout = (r) => r.performanceBonus + r.retentionBonus;
export const COLUMNS = [
    { key: "empId", label: "Emp ID", type: "text", editable: false, width: 96 },
    { key: "name", label: "Employee Name", type: "text", editable: false, width: 190 },
    { key: "department", label: "Department", type: "enum", editable: false, width: 130 },
    { key: "designation", label: "Designation", type: "text", editable: false, width: 170 },
    { key: "manager", label: "Manager", type: "enum", editable: false, width: 150 },
    { key: "currentCTC", label: "Current CTC", type: "currency", editable: true, width: 130 },
    { key: "targetPerformanceBonus", label: "Target Perf. Bonus", type: "currency", editable: true, width: 150 },
    { key: "performanceBonus", label: "Performance Bonus", type: "currency", editable: true, width: 150 },
    { key: "retentionBonus", label: "Retention Bonus", type: "currency", editable: true, width: 140 },
    { key: "hikeAmount", label: "Hike Amount", type: "currency", editable: true, width: 130 },
    { key: "managerRating", label: "Manager Rating", type: "enum", editable: true, options: MANAGER_RATINGS, width: 200 },
    { key: "status", label: "Status", type: "enum", editable: true, options: STATUSES, width: 130 },
];
export const COMPUTED_COLUMNS = [
    { key: "payoutPct", label: "Bonus Payout %", fn: payoutPct, kind: "percent", width: 130 },
    { key: "totalPayout", label: "Total Payout", fn: totalPayout, kind: "currency", width: 130 },
    { key: "hikePct", label: "Hike %", fn: hikePct, kind: "percent", width: 100 },
    { key: "revisedCTC", label: "Revised CTC", fn: revisedCTC, kind: "currency", width: 140 },
];
export const EDITABLE_KEYS = COLUMNS.filter((c) => c.editable).map((c) => c.key);
export const DEPARTMENTS = ["Sales", "HR", "Marketing", "Operations", "Engineering", "Finance"];
export const MANAGERS = ["Priya Nair", "Vikram Iyer", "Neha Gupta", "Arjun Mehta", "Sunita Rao"];
const DESIGNATIONS = ["Program Executive", "Senior Analyst", "Team Lead", "Manager", "Associate", "Specialist"];
const FIRST = ["Rahul", "Anita", "Sahil", "Meera", "Karan", "Divya", "Rohit", "Sneha", "Amit", "Pooja", "Vivek", "Isha", "Nikhil", "Tara", "Manoj", "Farah", "Dev", "Ritu", "Aakash", "Leena"];
const LAST = ["Sharma", "Roy", "Khan", "Pillai", "Verma", "Menon", "Das", "Kulkarni", "Bose", "Chopra", "Nanda", "Sen"];
function mulberry(seed) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export function buildEmployees(count = 250) {
    const rand = mulberry(42);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const rows = [];
    for (let i = 0; i < count; i++) {
        const ctc = Math.round((600000 + rand() * 2400000) / 10000) * 10000;
        const target = Math.round((ctc * (0.06 + rand() * 0.1)) / 1000) * 1000;
        const rating = pick(MANAGER_RATINGS);
        const factor = rating === "Exceeds Expectation" ? 1.15 : rating === "Meets Expectation" ? 0.95 : 0.6;
        const status = pick(STATUSES);
        rows.push({
            id: `emp-${i + 1}`,
            empId: `E${String(i + 1).padStart(3, "0")}`,
            name: `${pick(FIRST)} ${pick(LAST)}`,
            department: pick(DEPARTMENTS),
            designation: pick(DESIGNATIONS),
            manager: pick(MANAGERS),
            currentCTC: ctc,
            targetPerformanceBonus: target,
            performanceBonus: Math.round((target * factor) / 1000) * 1000,
            retentionBonus: rand() > 0.65 ? Math.round((ctc * 0.03 * rand()) / 1000) * 1000 : 0,
            hikeAmount: Math.round((ctc * (0.04 + rand() * 0.12)) / 1000) * 1000,
            managerRating: rating,
            status,
            comments: "",
        });
    }
    return rows;
}
export const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
export const pct = (n) => `${n.toFixed(1)}%`;
export function formatValue(row, col) {
    const v = row[col.key];
    if (col.type === "currency")
        return inr(Number(v));
    if (col.type === "percent")
        return pct(Number(v));
    return String(v);
}
