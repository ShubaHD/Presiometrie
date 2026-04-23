import { ProjectDetailClient } from "@/components/lab/project-detail-client";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectDetailClient projectId={projectId} />;
}
