import { CrmLeadDetailPage } from "@/components/crm/CrmLeadDetailPage";

export default async function CrmLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CrmLeadDetailPage leadId={id} />;
}
