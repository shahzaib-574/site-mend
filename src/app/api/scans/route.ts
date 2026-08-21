import { handleCreateScanRequest } from "@/server/scan-jobs/api-handlers";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleCreateScanRequest(request);
}
