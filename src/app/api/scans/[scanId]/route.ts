import { handleGetScanRequest } from "@/server/scan-jobs/api-handlers";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scanId: string }> },
): Promise<Response> {
  const { scanId } = await params;
  return handleGetScanRequest(request, scanId);
}
