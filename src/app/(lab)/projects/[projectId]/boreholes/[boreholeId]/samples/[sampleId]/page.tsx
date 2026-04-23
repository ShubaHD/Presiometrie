import { SampleDetailClient } from "@/components/lab/sample-detail-client";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; boreholeId: string; sampleId: string }>;
}) {
  const { projectId, boreholeId, sampleId } = await params;
  return (
    <SampleDetailClient projectId={projectId} boreholeId={boreholeId} sampleId={sampleId} />
  );
}
