// ============================================================
// DROPDOWN OPTIONS
// ============================================================

export const MANAGER_RATINGS = [
    "Exceeds Expectation",
    "Meets Expectation",
    "Sometimes Meets Expectation",
];

export const STATUSES = [
    "Pending",
    "In Progress",
    "Completed",
    "Submitted",
];

export const INSTALMENT_OPTIONS = ["1", "2", "4"];

export const PROMOTION_OPTIONS = ["Yes", "No"];

export const NEW_TITLES = [
    "Program Executive",
    "Senior Analyst",
    "Team Lead",
    "Manager",
    "Associate",
    "Specialist",
    "Senior Manager",
    "Assistant Manager",
    "Deputy Manager",
];

export const DEPARTMENTS = [
    "Sales",
    "HR",
    "Marketing",
    "Operations",
    "Engineering",
    "Finance",
];

export const MANAGERS = [
    "Priya Nair",
    "Vikram Iyer",
    "Neha Gupta",
    "Arjun Mehta",
    "Sunita Rao",
];


// ============================================================
// CALCULATION FUNCTIONS
// ============================================================

// RR %
export const rrPct = (r) =>
    r.interviewCount
        ? (r.rrPct ?? 0)
        : 0;


// Total PB
export const totalPB = (r) =>
    Number(r.allocatedPBAmount || 0) +
    Number(r.newPBToBeOffered || 0);


// Total Bonus = Total PB + New RB
export const totalBonus = (r) =>
    totalPB(r) + Number(r.newRB || 0);


// Hike %
export const hikePct = (r) =>
    r.currentAnnualBasePay
        ? (Number(r.hikeAmount || 0) / Number(r.currentAnnualBasePay)) * 100
        : 0;


// Total CTC with Rewards
export const totalCTCWithRewards = (r) =>
    Number(r.newBaseSalary || 0) +
    totalBonus(r);


// Previous Total Bonus
export const previousTotalBonus = (r) =>
    Number(r.rbToBePaid || 0) +
    Number(r.pbToBePaid || 0);


// Total Bonus Hike Amount
export const totalBonusHikeAmount = (r) =>
    totalBonus(r) - previousTotalBonus(r);


// Total Bonus Hike %
export const totalBonusHikePct = (r) =>
    previousTotalBonus(r)
        ? (totalBonusHikeAmount(r) / previousTotalBonus(r)) * 100
        : 0;


// Total Rewards Hike Amount
export const totalRewardsHikeAmount = (r) =>
    Number(r.totalCTCWithRewards || totalCTCWithRewards(r)) -
    (
        Number(r.currentAnnualBasePay || 0) +
        previousTotalBonus(r)
    );


// Total Rewards Hike %
export const totalRewardsHikePct = (r) =>
    r.currentAnnualBasePay || previousTotalBonus(r)
        ? (
            totalRewardsHikeAmount(r) /
            (
                Number(r.currentAnnualBasePay || 0) +
                previousTotalBonus(r)
            )
        ) * 100
        : 0;


// New Base Salary
export const newBaseSalary = (r) =>
    Number(r.currentAnnualBasePay || 0) +
    Number(r.hikeAmount || 0);


// Target PB for Next Year
export const targetPBNextYear = (r) =>
    Number(r.targetPBForNextYear || 0);


// ============================================================
// MAIN COLUMNS
// ============================================================

export const COLUMNS = [

    // 1
    {
        key: "empId",
        label: "EMP ID",
        type: "text",
        editable: false,
        width: 100,
    },

    // 2
    {
        key: "name",
        label: "Employee Name",
        type: "text",
        editable: false,
        width: 190,
    },

    // 3
    {
        key: "designation",
        label: "Designation",
        type: "text",
        editable: false,
        width: 170,
    },

    // 4
    {
        key: "reportingManager",
        label: "Reporting Manager",
        type: "text",
        editable: false,
        width: 160,
    },

    // 5
    {
        key: "compManager",
        label: "Comp. Manager",
        type: "text",
        editable: false,
        width: 160,
    },

    // 6
    {
        key: "appraiserTechED",
        label: "Appraiser Tech-ED",
        type: "text",
        editable: false,
        width: 170,
    },

    // 7
    {
        key: "wissenExperience",
        label: "Wissen Experience",
        type: "decimal",
        editable: false,
        width: 150,
    },

    // 8
    {
        key: "totalExperience",
        label: "Total Experience",
        type: "decimal",
        editable: false,
        width: 140,
    },

    // 9
    {
        key: "lastAppraisalDate",
        label: "Last Appraisal (Date)",
        type: "date",
        editable: false,
        width: 160,
    },

    // 10
    {
        key: "managerRating",
        label: "Manager Rating",
        type: "enum",
        editable: true,
        options: MANAGER_RATINGS,
        width: 200,
    },

    // 11
    {
        key: "interviewCount",
        label: "Interview Count",
        type: "number",
        editable: true,
        width: 140,
    },

    // 12
    {
        key: "rrPct",
        label: "RR%",
        type: "percent",
        editable: true,
        width: 100,
    },

    // 13
    {
        key: "grossMargin",
        label: "Gross Margin",
        type: "decimal",
        editable: true,
        width: 130,
    },

    // 14
    {
        key: "rbToBePaid",
        label: "RB to be paid",
        type: "currency",
        editable: true,
        width: 140,
    },

    // 15
    {
        key: "monthRB",
        label: "Month (RB)",
        type: "text",
        editable: true,
        width: 120,
    },

    // 16
    {
        key: "pbToBePaid",
        label: "PB to be paid",
        type: "currency",
        editable: true,
        width: 140,
    },

    // 17
    {
        key: "monthPB",
        label: "Month (PB)",
        type: "text",
        editable: true,
        width: 120,
    },

    // 18
    {
        key: "currentAnnualBasePay",
        label: "Current Annual Base Pay",
        type: "currency",
        editable: false,
        width: 170,
    },

    // 19
    {
        key: "targetPBMay",
        label: "Target PB allocated for May",
        type: "currency",
        editable: true,
        width: 190,
    },

    // 20
    {
        key: "allocatedPBAmount",
        label: "Allocated PB Amount",
        type: "currency",
        editable: true,
        width: 160,
    },

    // 21
    {
        key: "pbInstalment",
        label: "Instalment",
        type: "enum",
        editable: true,
        options: INSTALMENT_OPTIONS,
        width: 110,
    },

    // 22
    {
        key: "newPBToBeOffered",
        label: "New PB to be Offered",
        type: "currency",
        editable: true,
        width: 170,
    },

    // 23
    {
        key: "newPBInstalment",
        label: "Instalment",
        type: "enum",
        editable: true,
        options: INSTALMENT_OPTIONS,
        width: 110,
    },

    // 24
    {
        key: "newRB",
        label: "New RB",
        type: "currency",
        editable: true,
        width: 130,
    },

    // 25
    {
        key: "eligibleForPromotion",
        label: "Eligible for Promotion",
        type: "enum",
        editable: true,
        options: PROMOTION_OPTIONS,
        width: 170,
    },

    // 26
    {
        key: "newTitle",
        label: "New Title",
        type: "enum",
        editable: true,
        options: NEW_TITLES,
        width: 170,
    },

    // 27
    {
        key: "atRisk",
        label: "At Risk",
        type: "textarea",
        editable: true,
        width: 220,
    },

    // Existing status
    {
        key: "status",
        label: "Status",
        type: "enum",
        editable: true,
        options: STATUSES,
        width: 130,
    },
];


// ============================================================
// CALCULATED COLUMNS
// ============================================================

export const COMPUTED_COLUMNS = [

    // 28
    {
        key: "totalPB",
        label: "Total of PB",
        fn: totalPB,
        kind: "currency",
        width: 150,
    },

    // 29
    {
        key: "totalBonus",
        label: "Total Bonus (PB and RB)",
        fn: totalBonus,
        kind: "currency",
        width: 180,
    },

    // 30
    {
        key: "hikeAmount",
        label: "Hike Amount",
        fn: (r) => Number(r.hikeAmount || 0),
        kind: "currency",
        width: 140,
    },

    // 31
    {
        key: "hikePct",
        label: "Hike%",
        fn: hikePct,
        kind: "percent",
        width: 100,
    },

    // 32
    {
        key: "totalCTCWithRewards",
        label: "Total CTC with Rewards",
        fn: totalCTCWithRewards,
        kind: "currency",
        width: 190,
    },

    // 33
    {
        key: "totalBonusHikeAmount",
        label: "Total Bonus Hike Amount",
        fn: totalBonusHikeAmount,
        kind: "currency",
        width: 190,
    },

    // 34
    {
        key: "totalBonusHikePct",
        label: "Total Bonus Hike%",
        fn: totalBonusHikePct,
        kind: "percent",
        width: 160,
    },

    // 35
    {
        key: "totalRewardsHikeAmount",
        label: "Total Rewards Hike Amount",
        fn: totalRewardsHikeAmount,
        kind: "currency",
        width: 200,
    },

    // 36
    {
        key: "totalRewardsHikePct",
        label: "Total Rewards Hike%",
        fn: totalRewardsHikePct,
        kind: "percent",
        width: 170,
    },

    // 37
    {
        key: "newBaseSalary",
        label: "New Base Salary",
        fn: newBaseSalary,
        kind: "currency",
        width: 160,
    },

    // 38
    {
        key: "targetPBForNextYear",
        label: "Target PB for Next Year",
        fn: targetPBNextYear,
        kind: "currency",
        width: 180,
    },
];


// ============================================================
// EDITABLE KEYS
// ============================================================

export const EDITABLE_KEYS = COLUMNS
    .filter((c) => c.editable)
    .map((c) => c.key);


// ============================================================
// SAMPLE DATA
// ============================================================

const FIRST = [
    "Rahul",
    "Anita",
    "Sahil",
    "Meera",
    "Karan",
    "Divya",
    "Rohit",
    "Sneha",
    "Amit",
    "Pooja",
    "Vivek",
    "Isha",
    "Nikhil",
    "Tara",
    "Manoj",
    "Farah",
    "Dev",
    "Ritu",
    "Aakash",
    "Leena",
];

const LAST = [
    "Sharma",
    "Roy",
    "Khan",
    "Pillai",
    "Verma",
    "Menon",
    "Das",
    "Kulkarni",
    "Bose",
    "Chopra",
    "Nanda",
    "Sen",
];

const DESIGNATIONS = [
    "Program Executive",
    "Senior Analyst",
    "Team Lead",
    "Manager",
    "Associate",
    "Specialist",
];

function mulberry(seed) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;

        let t = Math.imul(
            seed ^ (seed >>> 15),
            1 | seed
        );

        t =
            (t +
                Math.imul(
                    t ^ (t >>> 7),
                    61 | t
                )) ^
            t;

        return (
            ((t ^ (t >>> 14)) >>> 0) /
            4294967296
        );
    };
}


// ============================================================
// BUILD EMPLOYEES
// ============================================================

export function buildEmployees(count = 250) {

    const rand = mulberry(42);

    const pick = (arr) =>
        arr[Math.floor(rand() * arr.length)];

    const rows = [];

    for (let i = 0; i < count; i++) {

        const currentBase =
            Math.round(
                (600000 + rand() * 2400000) /
                    10000
            ) * 10000;

        const targetPB =
            Math.round(
                (currentBase *
                    (0.06 + rand() * 0.1)) /
                    1000
            ) * 1000;

        const rating = pick(MANAGER_RATINGS);

        const factor =
            rating === "Exceeds Expectation"
                ? 1.15
                : rating === "Meets Expectation"
                    ? 0.95
                    : 0.6;

        const hike =
            Math.round(
                (currentBase *
                    (0.04 + rand() * 0.12)) /
                    1000
            ) * 1000;

        const rb =
            rand() > 0.65
                ? Math.round(
                    (currentBase *
                        0.03 *
                        rand()) /
                        1000
                ) * 1000
                : 0;

        const pb =
            Math.round(
                (targetPB * factor) /
                    1000
            ) * 1000;

        const allocatedPB =
            Math.round(
                (targetPB * 0.5) /
                    1000
            ) * 1000;

        const newPB =
            Math.round(
                (targetPB * 0.25) /
                    1000
            ) * 1000;

        const newRB =
            Math.round(
                (currentBase *
                    0.02 *
                    rand()) /
                    1000
            ) * 1000;

        rows.push({

            id: `emp-${i + 1}`,

            // Employee information
            empId: `E${String(i + 1).padStart(3, "0")}`,
            name: `${pick(FIRST)} ${pick(LAST)}`,
            designation: pick(DESIGNATIONS),

            reportingManager: pick(MANAGERS),
            compManager: pick(MANAGERS),
            appraiserTechED: pick(MANAGERS),

            wissenExperience:
                Number(
                    (1 + rand() * 8).toFixed(1)
                ),

            totalExperience:
                Number(
                    (2 + rand() * 12).toFixed(1)
                ),

            lastAppraisalDate:
                "2026-04-01",

            // Appraisal
            managerRating: rating,

            interviewCount:
                Math.floor(
                    rand() * 15
                ),

            rrPct:
                Number(
                    (20 + rand() * 80).toFixed(2)
                ),

            grossMargin:
                Number(
                    (0.10 + rand() * 0.50).toFixed(3)
                ),

            // Existing bonus
            rbToBePaid: rb,
            monthRB: "May",

            pbToBePaid: pb,
            monthPB: "May",

            // Compensation
            currentAnnualBasePay:
                currentBase,

            targetPBMay:
                targetPB,

            allocatedPBAmount:
                allocatedPB,

            pbInstalment:
                pick(INSTALMENT_OPTIONS),

            newPBToBeOffered:
                newPB,

            newPBInstalment:
                pick(INSTALMENT_OPTIONS),

            newRB:
                newRB,

            // Hike
            hikeAmount:
                hike,

            // Promotion
            eligibleForPromotion:
                pick(PROMOTION_OPTIONS),

            newTitle:
                pick(NEW_TITLES),

            // Risk
            atRisk:
                "",

            // Status
            status:
                pick(STATUSES),
        });
    }

    return rows;
}


// ============================================================
// FORMATTING
// ============================================================

export const inr = (n) =>
    "₹" +
    Math.round(
        Number(n || 0)
    ).toLocaleString("en-IN");


export const pct = (n) =>
    `${Number(n || 0).toFixed(1)}%`;


export function formatValue(row, col) {

    const value = row[col.key];

    if (
        col.type === "currency"
    ) {
        return inr(value);
    }

    if (
        col.type === "percent"
    ) {
        return pct(value);
    }

    if (
        col.type === "decimal"
    ) {
        return Number(value || 0)
            .toFixed(3);
    }

    return String(
        value ?? ""
    );
}
