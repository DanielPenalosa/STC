import { requireProfile } from "@/lib/data";
import CitizenHome from "./citizen-home";
import AdminDashboard from "./admin-dashboard";
import StaffDashboard from "./staff-dashboard";

export default async function DashboardPage() {
  const profile = await requireProfile();
  if (profile.role === "citizen") return <CitizenHome profile={profile} />;
  if (profile.role === "admin") return <AdminDashboard profile={profile} />;
  return <StaffDashboard profile={profile} />;
}
