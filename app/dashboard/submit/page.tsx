import { getCategories } from "@/lib/data";
import SubmitReportClient from "./submit-client";

export default async function SubmitPage() {
  const [categories, profile] = await Promise.all([
    getCategories(),
    import("@/lib/data").then((m) => m.requireProfile()),
  ]);
  return (
    <SubmitReportClient
      categories={categories
        .filter((c) => c.is_active)
        .map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
      profile={{ full_name: profile.full_name }}
    />
  );
}
