/** Trebuie să coincidă cu `REPORTS_BUCKET` din report-service (implicit `reports`). */
export function reportsStorageBucket(): string {
  return (
    process.env.REPORTS_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_REPORTS_BUCKET?.trim() ||
    "reports"
  );
}
