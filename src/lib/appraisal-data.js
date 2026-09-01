export const COLUMNS = [
    {
        key: "empId",
        label: "EMP ID",
        type: "text",
        editable: false,
        width: 100,
    },

    {
        key: "name",
        label: "Employee Name",
        type: "text",
        editable: false,
        width: 190,
    },

    {
        key: "designation",
        label: "Designation",
        type: "text",
        editable: false,
        width: 170,
    },

    {
        key: "reportingManager",
        label: "Reporting Manager",
        type: "text",
        editable: false,
        width: 170,
    },

    {
        key: "compManager",
        label: "Comp. Manager",
        type: "text",
        editable: false,
        width: 150,
    },

    {
        key: "appraiserTechED",
        label: "Appraiser Tech-ED",
        type: "text",
        editable: true,
        width: 160,
    },

    {
        key: "wissenExperience",
        label: "Wissen Experience",
        type: "decimal",
        editable: true,
        width: 150,
    },

    {
        key: "totalExperience",
        label: "Total Experience",
        type: "decimal",
        editable: true,
        width: 140,
    },

    {
        key: "lastAppraisalDate",
        label: "Last Appraisal (Date)",
        type: "date",
        editable: true,
        width: 160,
    },

    {
        key: "managerRating",
        label: "Manager Rating",
        type: "enum",
        editable: true,
        options: MANAGER_RATINGS,
        width: 210,
    },

    {
        key: "interviewCount",
        label: "Interview Count",
        type: "number",
        editable: true,
        width: 140,
    },

    {
        key: "rrPercent",
        label: "RR%",
        type: "percent",
        editable: true,
        width: 100,
    },

    {
        key: "grossMargin",
        label: "Gross Margin",
        type: "decimal",
        editable: true,
        width: 130,
    },

    {
        key: "rbToBePaid",
        label: "RB to be paid",
        type: "currency",
        editable: true,
        width: 140,
    },

    {
        key: "monthRB",
        label: "Month (RB)",
        type: "text",
        editable: true,
        width: 120,
    },

    {
        key: "pbToBePaid",
        label: "PB to be paid",
        type: "currency",
        editable: true,
        width: 140,
    },

    {
        key: "monthPB",
        label: "Month (PB)",
        type: "text",
        editable: true,
        width: 120,
    },

    {
        key: "currentAnnualBasePay",
        label: "Current Annual Base Pay",
        type: "currency",
        editable: true,
        width: 180,
    },

    {
        key: "targetPBAllocatedForMay",
        label: "Target PB allocated for May",
        type: "currency",
        editable: true,
        width: 190,
    },

    {
        key: "allocatedPBAmount",
        label: "Allocated PB Amount",
        type: "currency",
        editable: true,
        width: 170,
    },

    {
        key: "pbInstallment",
        label: "Instalment",
        type: "enum",
        editable: true,
        options: INSTALLMENT_OPTIONS,
        width: 110,
    },

    {
        key: "newPBToBeOffered",
        label: "New PB to be Offered",
        type: "currency",
        editable: true,
        width: 170,
    },

    {
        key: "newPBInstallment",
        label: "Instalment",
        type: "enum",
        editable: true,
        options: INSTALLMENT_OPTIONS,
        width: 110,
    },

    {
        key: "totalOfPB",
        label: "Total of PB",
        type: "currency",
        editable: false,
        width: 140,
    },

    {
        key: "newRB",
        label: "New RB",
        type: "currency",
        editable: true,
        width: 120,
    },

    {
        key: "totalBonus",
        label: "Total Bonus (PB and RB)",
        type: "currency",
        editable: false,
        width: 190,
    },

    {
        key: "hikeAmount",
        label: "Hike Amount",
        type: "currency",
        editable: false,
        width: 140,
    },

    {
        key: "hikePct",
        label: "Hike%",
        type: "percent",
        editable: false,
        width: 100,
    },

    {
        key: "totalCTCWithRewards",
        label: "Total CTC with Rewards",
        type: "currency",
        editable: false,
        width: 190,
    },

    {
        key: "totalBonusHikeAmount",
        label: "Total Bonus Hike Amount",
        type: "currency",
        editable: false,
        width: 190,
    },

    {
        key: "totalBonusHikePct",
        label: "Total Bonus Hike%",
        type: "percent",
        editable: false,
        width: 160,
    },

    {
        key: "totalRewardsHikeAmount",
        label: "Total Rewards Hike Amount",
        type: "currency",
        editable: false,
        width: 200,
    },

    {
        key: "totalRewardsHikePct",
        label: "Total Rewards Hike%",
        type: "percent",
        editable: false,
        width: 170,
    },

    {
        key: "newBaseSalary",
        label: "New Base Salary",
        type: "currency",
        editable: true,
        width: 160,
    },

    {
        key: "targetPBNextYear",
        label: "Target PB for Next Year",
        type: "currency",
        editable: true,
        width: 180,
    },

    {
        key: "eligibleForPromotion",
        label: "Eligible for Promotion",
        type: "enum",
        editable: true,
        options: PROMOTION_OPTIONS,
        width: 170,
    },

    {
        key: "newTitle",
        label: "New Title",
        type: "enum",
        editable: true,
        options: NEW_TITLES,
        width: 170,
    },

    {
        key: "atRisk",
        label: "At Risk",
        type: "textarea",
        editable: true,
        width: 220,
    },
];
