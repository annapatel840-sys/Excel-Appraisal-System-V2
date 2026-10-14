# Appraisal_Cycle_Master — optional columns

`payrollcycleapi` reads the table's columns and saves these values only when the
column exists, so it works before and after they are added. Add them in
Catalyst console → Data Store → Appraisal_Cycle_Master:

| Column | Type | Used for |
|---|---|---|
| `cycle_type` | Var Char (30) | Annual / Mid-Year / Exceptional / New Joiner (else guessed from the name) |
| `process` | Var Char (30) | Annual / Exceptional / None; locked once the cycle is activated (else the HR Config default for the type) |
| `effective_date` | Date | Effective date (else the start date) |
| `cancel_reason` | Text | Reason entered on Cancel cycle (else read from the remarks) |

None is mandatory or unique. The function re-reads the column list every
5 minutes, so new columns are picked up without a redeploy.

## Cycle rules (enforced by the API)
- Only one cycle can be Active (access scoping follows the Active cycle).
- Status moves: Upcoming → Active, Active → Closed, Closed → Active (reopen).
- Archive only a Closed cycle; archived and cancelled cycles are read-only.
- Cancel: Upcoming or Active cycles, with a reason.
- Delete: Upcoming cycles before their start date (IST), with no payroll rows.
- "No process" cycles need only the effective date; others need start < close.
- Remarks are a running log (new remarks are appended).
- Times are saved in IST (Asia/Kolkata).
