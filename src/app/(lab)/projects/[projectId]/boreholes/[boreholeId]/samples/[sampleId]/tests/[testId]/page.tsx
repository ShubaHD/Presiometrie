import { TestWorkspace } from "@/components/lab/test-workspace";

export default async function Page({
  params,
}: {
  params: Promise<{
    projectId: string;
    boreholeId: string;
    sampleId: string;
    testId: string;
  }>;
}) {
  const { projectId, boreholeId, sampleId, testId } = await params;
  return (
    <TestWorkspace
      projectId={projectId}
      boreholeId={boreholeId}
      sampleId={sampleId}
      testId={testId}
    />
  );
}
