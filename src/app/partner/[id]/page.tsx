import { PartnerLeadDetailPage } from "@/components/partner/PartnerLeadDetailPage";

export default async function PartnerLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartnerLeadDetailPage leadId={id} />;
}
