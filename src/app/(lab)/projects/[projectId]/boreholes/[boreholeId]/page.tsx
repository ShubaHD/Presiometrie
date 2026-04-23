import { BoreholeDetailClient } from "@/components/lab/borehole-detail-client";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; boreholeId: string }>;
}) {
  const { projectId, boreholeId } = await params;
  return <BoreholeDetailClient projectId={projectId} boreholeId={boreholeId} />;
}
