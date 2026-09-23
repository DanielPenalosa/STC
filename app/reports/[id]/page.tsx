import { redirect } from "next/navigation";

/**
 * The report detail page moved inside the dashboard shell
 * (app/dashboard/reports/[id]) so it shares the app's header and sidebar.
 * Old URLs — shared links, bookmarks, prints — keep working via this
 * permanent redirect.
 */
export default async function LegacyReportRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/reports/${id}`);
}
