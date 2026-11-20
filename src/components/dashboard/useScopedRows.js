import { useMemo } from "react";

import { useAppraisal } from "@/lib/appraisal-store";
import { useViewAs, currentUserMatchesManager } from "@/lib/view-as-store";
import { useCatalystUser } from "@/lib/catalyst-auth";

/* The people every Dashboard tab reports on: Active + Eligible employees the
   Appraisal store already narrowed to the selected location and the signed-in
   (or "View as") login. Overview and Dashboard both use this, so their numbers
   always agree. */
export function useScopedRows() {
  const { rows: allRows, audit } = useAppraisal();
  const { effectiveId, actualId } = useViewAs();
  const catalystUser = useCatalystUser();

  const rows = useMemo(
    () =>
      allRows.filter(
        (r) =>
          String(r.status || "").trim().toLowerCase() === "active" &&
          String(r.eligibility || "").trim().toLowerCase() === "eligible" &&
          // Tech-ED previewing as a Comp Manager: only that Comp Manager's own team,
          // same rule as the Appraisal Sheet.
          (!(effectiveId === "compmanager" && actualId === "teched") ||
            currentUserMatchesManager(r.compManagerDisplay || r.compManager, catalystUser, allRows)),
      ),
    [allRows, effectiveId, actualId, catalystUser],
  );

  return { rows, allRows, audit, effectiveId };
}