import { getDepartments } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import DepartmentManager from "./manager";

export default async function DepartmentsPage() {
  const departments = await getDepartments();
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Departments" subtitle="Manage departments that handle reports" />
      <DepartmentManager initial={departments} />
    </div>
  );
}
