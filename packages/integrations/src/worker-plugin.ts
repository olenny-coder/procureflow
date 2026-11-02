import type { WorkerOptions, WorkerPlugin } from "@temporalio/worker";
import { adapterConfigFromEnv, configureAdapters } from "./registry";

/**
 * Worker Plugin extension point.
 *
 * The plugin instantiates the configured email/Slack/ERP/storage/AI adapters
 * before the Worker starts, then activities obtain them from the registry. To
 * swap a provider you change environment configuration and (at most) this plugin
 * — never workflow or activity code.
 */
export class IntegrationsWorkerPlugin implements WorkerPlugin {
  get name(): string {
    return "procureflow-integrations";
  }

  configureWorker(options: WorkerOptions): WorkerOptions {
    const config = adapterConfigFromEnv();
    const adapters = configureAdapters(config);
    console.log(
      JSON.stringify({
        level: "info",
        msg: "worker_plugin_configured",
        plugin: this.name,
        email: adapters.email.name,
        slack: adapters.slack.name,
        erp: adapters.erp.name,
        storage: adapters.storage.name,
        aiRisk: adapters.aiRisk.name,
      }),
    );
    return options;
  }
}

export function createIntegrationsWorkerPlugin(): WorkerPlugin {
  return new IntegrationsWorkerPlugin();
}
