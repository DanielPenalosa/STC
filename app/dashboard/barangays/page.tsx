import { getBarangays } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import BarangayManager from "./manager";

export default async function BarangaysPage() {
  const barangays = await getBarangays();
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Barangays" subtitle="Manage barangay coverage areas" />
      <BarangayManager initial={barangays} />
    </div>
  );
}
