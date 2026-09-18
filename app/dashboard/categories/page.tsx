import { getCategories } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import CategoryManager from "./manager";

export default async function CategoriesPage() {
  const categories = await getCategories();
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Categories" subtitle="Manage report categories shown to citizens" />
      <CategoryManager initial={categories} />
    </div>
  );
}
