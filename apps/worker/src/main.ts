import "@procureflow/shared/load-env";
import { createRequire } from "node:module";
import { NativeConnection, Worker } from "@temporalio/worker";
import { envBool, getTemporalConfig } from "@procureflow/shared";
import { createIntegrationsWorkerPlugin } from "@procureflow/integrations";
import {
  createActivities,
  createOutboxActivities,
  createVendorActivities,
} from "@procureflow/workflows/activities";
import { createActivityInterceptors } from "@procureflow/workflows/activity-interceptors";

const require = createRequire(import.meta.url);

function log(msg: string, fields: Record<string, unknown> = {}): void {
  console.log(
    JSON.stringify({
      level: "info",
      time: new Date().toISOString(),
      service: "procureflow-worker",
      msg,
      ...fields,
    }),
  );
}

async function main(): Promise<void> {
  const config = getTemporalConfig();
  const auditInterceptorsEnabled = envBool("PROCUREFLOW_AUDIT_INTERCEPTOR_ENABLED", true);
  const workerPluginEnabled = envBool("PROCUREFLOW_WORKER_PLUGIN_ENABLED", true);

  const connection = await NativeConnection.connect({
    address: config.address,
    ...(config.tls ? { tls: true } : {}),
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  });

  const worker = await Worker.create({
    connection,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    workflowsPath: require.resolve("@procureflow/workflows/workflows"),
    activities: {
      ...createActivities(),
      ...createVendorActivities(),
      ...createOutboxActivities(),
    },
    interceptors: {
      activity: auditInterceptorsEnabled ? [() => createActivityInterceptors()] : [],
      workflowModules: auditInterceptorsEnabled
        ? [require.resolve("@procureflow/workflows/interceptors")]
        : [],
    },
    plugins: workerPluginEnabled ? [createIntegrationsWorkerPlugin()] : [],
  });

  log("worker_started", {
    address: config.address,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    reworkEnabled: config.reworkEnabled,
    auditInterceptorsEnabled,
    workerPluginEnabled,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("worker_shutdown_started", { signal });
    try {
      await worker.shutdown();
      await connection.close();
    } finally {
      log("worker_shutdown_complete", { signal });
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await worker.run();
  log("worker_stopped");
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      service: "procureflow-worker",
      msg: "worker_fatal",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  process.exit(1);
});
