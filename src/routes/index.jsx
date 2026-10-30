import { AppShell } from "@/components/appraisal/AppShell";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";

export function Dashboard() {
  return (
    <AppShell>
      <DashboardOverview />
    </AppShell>
  );
}