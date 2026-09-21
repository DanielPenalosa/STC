import { requireProfile } from "@/lib/data";
import CitizenHome from "./citizen-home";
import AdminDashboard from "./overview-dashboard";

export default async function DashboardPage() {
  const profile = await requireProfile();
  if (profile.role === "citizen") return <CitizenHome profile={profile} />;
  // admin, department and barangay all get the same overview design —
  // the component scopes its data to the viewer's role.
  return <AdminDashboard profile={profile} />;
}
