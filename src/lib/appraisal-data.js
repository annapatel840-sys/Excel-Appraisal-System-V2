// ============================================================
// APPRAISAL DATA
// ============================================================

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

export const INSTALLMENT_OPTIONS = [
    "1",
    "2",
    "4",
];

export const PROMOTION_OPTIONS = [
    "Yes",
    "No",
];

export const NEW_TITLES = [
    "Program Executive",
    "Senior Analyst",
    "Team Lead",
    "Manager",
    "Associate",
    "Specialist",
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

// Bonus Payout %
export const payoutPct = (r) => {
    const target = Number(r.targetPBAllocatedForMay || 0);
    const allocated = Number(r.allocatedPBAmount || 0);

    return target
        ? (allocated / target) * 100
        : 0;
};


// Total of PB
export const totalPB = (r) => {
    return (
        Number(r.targetPBAllocatedForMay || 0) +
        Number(r.allocatedPBAmount || 0) +
        Number(r.newPBToBeOffered || 0)
    );
};


// Total Bonus = Total PB + New RB
export const totalBonus = (r) => {
    return (
        Number(totalPB(r) || 0) +
        Number(r.newRB || 0)
    );
};


// Hike Amount
export const hikeAmount = (r) => {
    const currentBase =
        Number(r.currentAnnualBasePay || 0);

    const newBase =
        Number(r.newBaseSalary || 0);

    return Math.max(
        0,
        newBase - currentBase
    );
};


// Hike %
export const hikePct = (r) => {
    const currentBase =
        Number(r.currentAnnualBasePay || 0);

    const hike =
        Number(
            r.hikeAmount ??
            hikeAmount(r)
        );

    return currentBase
        ? (hike / currentBase) * 100
        : 0;
};


// Revised CTC
export const revisedCTC = (r) => {
    return (
        Number(r.currentAnnualBasePay || 0) +
        Number(
            r.hikeAmount ??
            hikeAmount(r)
        )
    );
};


// Total Payout
// Kept for compatibility with existing application files.
export const totalPayout = (r) => {
    return (
        Number(r.performanceBonus || 0) +
        Number(r.retentionBonus || 0)
    );
};


// Total CTC with Rewards
export const totalCTCWithRewards = (r) => {
    return (
        Number(r.currentAnnualBasePay || 0) +
        Number(
            r.hikeAmount ??
            hikeAmount(r)
        ) +
        Number(totalBonus(r) || 0)
    );
};


// Total Bonus Hike Amount
export const totalBonusHikeAmount = (r) => {
    return Number(totalBonus(r) || 0);
};


// Total Bonus Hike %
export const totalBonusHikePct = (r) => {
    const currentBase =
        Number(r.currentAnnualBasePay || 0);

    const bonus =
        Number(totalBonus(r) || 0);

    return currentBase
        ? (bonus / currentBase) * 100
        : 0;
};


// Total Rewards Hike Amount
export const totalRewardsHikeAmount = (r) => {
    return (
        Number(
            r.hikeAmount ??
            hikeAmount(r)
        ) +
        Number(totalBonus(r) || 0)
    );
};


// Total Rewards Hike %
export const totalRewardsHikePct = (r) => {
    const currentBase =
        Number(r.currentAnnualBasePay || 0);

    const rewards =
        Number(
            totalRewardsHikeAmount(r)
        );

    return currentBase
        ? (rewards / currentBase) * 100
        : 0;
};


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
        width: 170,
    },

    // 5
    {
        key: "compManager",
        label: "Comp. Manager",
        type: "text",
        editable: false,
        width: 150,
    },

    // 6
    {
        key: "appraiserTechED",
        label: "Appraiser Tech-ED",
        type: "text",
        editable: true,
        width: 160,
    },

    // 7
    {
        key: "wissenExperience",
        label: "Wissen Experience",
        type: "decimal",
        editable: true,
        width: 150,
    },

    // 8
    {
        key: "totalExperience",
        label: "Total Experience",
        type: "decimal",
        editable: true,
        width: 140,
    },

    // 9
    {
        key: "lastAppraisalDate",
        label: "Last Appraisal (Date)",
        type: "date",
        editable: true,
        width: 160,
    },

    // 10
    {
        key: "managerRating",
        label: "Manager Rating",
        type: "enum",
        editable: true,
        options: MANAGER_RATINGS,
        width: 210,
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
        key: "rrPercent",
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
        editable: true,
        width: 180,
    },

    // 19
    {
        key: "targetPBAllocatedForMay",
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
        width: 170,
    },

    // 21
    {
        key: "pbInstallment",
        label: "Instalment",
        type: "enum",
        editable: true,
        options: INSTALLMENT_OPTIONS,
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
        key: "newPBInstallment",
        label: "Instalment",
        type: "enum",
        editable: true,
        options: INSTALLMENT_OPTIONS,
        width: 110,
    },

    // 24
    {
        key: "totalOfPB",
        label: "Total of PB",
        type: "currency",
        editable: false,
        width: 140,
    },

    // 25
    {
        key: "newRB",
        label: "New RB",
        type: "currency",
        editable: true,
        width: 120,
    },

    // 26
    {
        key: "totalBonus",
        label: "Total Bonus (PB and RB)",
        type: "currency",
        editable: false,
        width: 190,
    },

    // 27
    {
        key: "hikeAmount",
        label: "Hike Amount",
        type: "currency",
        editable: false,
        width: 140,
    },

    // 28
    {
        key: "hikePct",
        label: "Hike%",
        type: "percent",
        editable: false,
        width: 100,
    },

    // 29
    {
        key: "totalCTCWithRewards",
        label: "Total CTC with Rewards",
        type: "currency",
        editable: false,
        width: 190,
    },

    // 30
    {
        key: "totalBonusHikeAmount",
        label: "Total Bonus Hike Amount",
        type: "currency",
        editable: false,
        width: 190,
    },

    // 31
    {
        key: "totalBonusHikePct",
        label: "Total Bonus Hike%",
        type: "percent",
        editable: false,
        width: 160,
    },

    // 32
    {
        key: "totalRewardsHikeAmount",
        label: "Total Rewards Hike Amount",
        type: "currency",
        editable: false,
        width: 200,
    },

    // 33
    {
        key: "totalRewardsHikePct",
        label: "Total Rewards Hike%",
        type: "percent",
        editable: false,
        width: 170,
    },

    // 34
    {
        key: "newBaseSalary",
        label: "New Base Salary",
        type: "currency",
        editable: true,
        width: 160,
    },

    // 35
    {
        key: "targetPBNextYear",
        label: "Target PB for Next Year",
        type: "currency",
        editable: true,
        width: 180,
    },

    // 36
    {
        key: "eligibleForPromotion",
        label: "Eligible for Promotion",
        type: "enum",
        editable: true,
        options: PROMOTION_OPTIONS,
        width: 170,
    },

    // 37
    {
        key: "newTitle",
        label: "New Title",
        type: "enum",
        editable: true,
        options: NEW_TITLES,
        width: 170,
    },

    // 38
    {
        key: "atRisk",
        label: "At Risk",
        type: "textarea",
        editable: true,
        width: 220,
    },

];


// ============================================================
// COMPUTED COLUMNS
// ============================================================

export const COMPUTED_COLUMNS = [

    {
        key: "computedTotalOfPB",
        label: "Total of PB",
        fn: totalPB,
        kind: "currency",
        width: 140,
    },

    {
        key: "computedTotalBonus",
        label: "Total Bonus (PB and RB)",
        fn: totalBonus,
        kind: "currency",
        width: 190,
    },

    {
        key: "computedHikeAmount",
        label: "Hike Amount",
        fn: hikeAmount,
        kind: "currency",
        width: 140,
    },

    {
        key: "computedHikePct",
        label: "Hike%",
        fn: hikePct,
        kind: "percent",
        width: 100,
    },

    {
        key: "computedTotalCTCWithRewards",
        label: "Total CTC with Rewards",
        fn: totalCTCWithRewards,
        kind: "currency",
        width: 190,
    },

    {
        key: "computedTotalBonusHikeAmount",
        label: "Total Bonus Hike Amount",
        fn: totalBonusHikeAmount,
        kind: "currency",
        width: 190,
    },

    {
        key: "computedTotalBonusHikePct",
        label: "Total Bonus Hike%",
        fn: totalBonusHikePct,
        kind: "percent",
        width: 160,
    },

    {
        key: "computedTotalRewardsHikeAmount",
        label: "Total Rewards Hike Amount",
        fn: totalRewardsHikeAmount,
        kind: "currency",
        width: 200,
    },

    {
        key: "computedTotalRewardsHikePct",
        label: "Total Rewards Hike%",
        fn: totalRewardsHikePct,
        kind: "percent",
        width: 170,
    },

];


// ============================================================
// EDITABLE KEYS
// ============================================================

export const EDITABLE_KEYS =
    COLUMNS
        .filter((c) => c.editable)
        .map((c) => c.key);


// ============================================================
// SAMPLE EMPLOYEE DATA
// ============================================================

const DESIGNATIONS = [
    "Program Executive",
    "Senior Analyst",
    "Team Lead",
    "Manager",
    "Associate",
    "Specialist",
];

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


// ============================================================
// RANDOM DATA GENERATOR
// ============================================================

function mulberry(seed) {

    return () => {

        seed |= 0;

        seed =
            (seed + 0x6d2b79f5) |
            0;

        let t =
            Math.imul(
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
            (t ^ (t >>> 14)) >>> 0
        ) / 4294967296;

    };
}


// ============================================================
// BUILD EMPLOYEES
// ============================================================

export function buildEmployees(
    count = 250
) {

    const rand =
        mulberry(42);

    const pick =
        (arr) =>
            arr[
                Math.floor(
                    rand() *
                    arr.length
                )
            ];

    const rows = [];

    for (
        let i = 0;
        i < count;
        i++
    ) {

        const currentBase =
            Math.round(
                (
                    600000 +
                    rand() *
                    2400000
                ) / 10000
            ) * 10000;


        const targetPB =
            Math.round(
                (
                    currentBase *
                    (
                        0.06 +
                        rand() * 0.1
                    )
                ) / 1000
            ) * 1000;


        const rating =
            pick(
                MANAGER_RATINGS
            );


        const factor =
            rating ===
            "Exceeds Expectation"
                ? 1.15
                : rating ===
                    "Meets Expectation"
                    ? 0.95
                    : 0.6;


        const allocatedPB =
            Math.round(
                (
                    targetPB *
                    factor
                ) / 1000
            ) * 1000;


        const newPB =
            Math.round(
                (
                    currentBase *
                    (
                        0.02 +
                        rand() * 0.08
                    )
                ) / 1000
            ) * 1000;


        const newRB =
            rand() > 0.65
                ? Math.round(
                    (
                        currentBase *
                        0.03 *
                        rand()
                    ) / 1000
                ) * 1000
                : 0;


        const newBase =
            Math.round(
                (
                    currentBase *
                    (
                        1.04 +
                        rand() * 0.12
                    )
                ) / 1000
            ) * 1000;


        const rr =
            Number(
                (
                    60 +
                    rand() * 40
                ).toFixed(2)
            );


        const grossMargin =
            Number(
                (
                    0.15 +
                    rand() * 0.35
                ).toFixed(3)
            );


        rows.push({

            id:
                `emp-${i + 1}`,

            empId:
                `E${String(
                    i + 1
                ).padStart(3, "0")}`,

            name:
                `${pick(FIRST)} ${pick(LAST)}`,

            designation:
                pick(
                    DESIGNATIONS
                ),

            reportingManager:
                pick(
                    MANAGERS
                ),

            compManager:
                pick(
                    MANAGERS
                ),

            appraiserTechED:
                "Tech-ED",

            wissenExperience:
                Number(
                    (
                        1 +
                        rand() * 8
                    ).toFixed(1)
                ),

            totalExperience:
                Number(
                    (
                        2 +
                        rand() * 12
                    ).toFixed(1)
                ),

            lastAppraisalDate:
                "2026-04-01",

            managerRating:
                rating,

            interviewCount:
                Math.floor(
                    rand() * 10
                ),

            rrPercent:
                rr,

            grossMargin:
                grossMargin,

            rbToBePaid:
                newRB,

            monthRB:
                "May",

            pbToBePaid:
                allocatedPB,

            monthPB:
                "May",

            currentAnnualBasePay:
                currentBase,

            targetPBAllocatedForMay:
                targetPB,

            allocatedPBAmount:
                allocatedPB,

            pbInstallment:
                pick(
                    INSTALLMENT_OPTIONS
                ),

            newPBToBeOffered:
                newPB,

            newPBInstallment:
                pick(
                    INSTALLMENT_OPTIONS
                ),

            totalOfPB:
                targetPB +
                allocatedPB +
                newPB,

            newRB:
                newRB,

            totalBonus:
                targetPB +
                allocatedPB +
                newPB +
                newRB,

            hikeAmount:
                newBase -
                currentBase,

            hikePct:
                currentBase
                    ? (
                        (
                            newBase -
                            currentBase
                        ) /
                        currentBase
                    ) *
                    100
                    : 0,

            totalCTCWithRewards:
                newBase +
                newRB +
                allocatedPB +
                newPB,

            totalBonusHikeAmount:
                newRB +
                allocatedPB +
                newPB,

            totalBonusHikePct:
                currentBase
                    ? (
                        (
                            newRB +
                            allocatedPB +
                            newPB
                        ) /
                        currentBase
                    ) *
                    100
                    : 0,

            totalRewardsHikeAmount:
                (
                    newBase -
                    currentBase
                ) +
                newRB +
                allocatedPB +
                newPB,

            totalRewardsHikePct:
                currentBase
                    ? (
                        (
                            (
                                newBase -
                                currentBase
                            ) +
                            newRB +
                            allocatedPB +
                            newPB
                        ) /
                        currentBase
                    ) *
                    100
                    : 0,

            newBaseSalary:
                newBase,

            targetPBNextYear:
                Math.round(
                    (
                        newBase *
                        0.1
                    ) / 1000
                ) * 1000,

            eligibleForPromotion:
                rand() > 0.7
                    ? "Yes"
                    : "No",

            newTitle:
                pick(
                    NEW_TITLES
                ),

            atRisk:
                "",

            // Compatibility with old application
            currentCTC:
                currentBase,

            targetPerformanceBonus:
                targetPB,

            performanceBonus:
                allocatedPB,

            retentionBonus:
                newRB,

            manager:
                pick(
                    MANAGERS
                ),

            comments:
                "",

            status:
                pick(STATUSES),

        });

    }

    return rows;
}


// ============================================================
// FORMATTING FUNCTIONS
// ============================================================

export const inr = (n) =>
    "₹" +
    Math.round(
        Number(n) || 0
    ).toLocaleString(
        "en-IN"
    );


export const pct = (n) =>
    `${Number(n || 0).toFixed(1)}%`;


// ============================================================
// FORMAT VALUE
// ============================================================

export function formatValue(
    row,
    col
) {

    const v =
        row[col.key];


    if (
        col.type ===
        "currency"
    ) {

        return inr(
            Number(v)
        );

    }


    if (
        col.type ===
        "percent"
    ) {

        return pct(
            Number(v)
        );

    }


    if (
        col.type ===
        "decimal"
    ) {

        return Number(
            v || 0
        ).toFixed(3);

    }


    return String(
        v ?? ""
    );
}
