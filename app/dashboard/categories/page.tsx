import { getCategories, getDepartments } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import CategoryManager from "./manager";

export default async function CategoriesPage() {
  const [categories, departments] = await Promise.all([
    getCategories(),
    getDepartments(),
  ]);
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Categories" subtitle="Manage report categories and AI department routing" />
      <CategoryManager
        initial={categories}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
      />
    </div>
  );
}
