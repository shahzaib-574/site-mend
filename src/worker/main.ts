import { CrawlerError } from "./crawler/errors";
import { startScanWorker } from "./scan-worker-runtime";

function reportError(event: string, error: unknown): void {
  const code = error instanceof CrawlerError ? error.code : "WORKER_ERROR";
  console.error(JSON.stringify({ code, event, service: "scan-worker" }));
}

async function main(): Promise<void> {
  const running = await startScanWorker({
    onError: (error) => reportError("worker-error", error),
  });
  let closing = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (closing) {
      return;
    }

    closing = true;
    console.info(
      JSON.stringify({ event: "shutdown", service: "scan-worker", signal }),
    );

    try {
      await running.close();
    } catch (error) {
      reportError("shutdown-error", error);
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  console.info(JSON.stringify({ event: "ready", service: "scan-worker" }));
}

main().catch((error) => {
  reportError("startup-error", error);
  process.exitCode = 1;
});
