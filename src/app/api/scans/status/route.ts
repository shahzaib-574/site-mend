import { handleGetScanRequest } from "@/server/scan-jobs/api-handlers";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleGetScanRequest(request);
}
