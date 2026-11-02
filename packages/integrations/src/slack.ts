import type { SlackAdapter, SlackMessage, SlackSendResult } from "./types";

/** No-op adapter used when SLACK_WEBHOOK_URL is not configured. */
export class NoopSlackAdapter implements SlackAdapter {
  readonly name = "noop";
  async send(_message: SlackMessage): Promise<SlackSendResult> {
    return { ok: true, skipped: true };
  }
}

/** Optional Slack incoming-webhook adapter. */
export class WebhookSlackAdapter implements SlackAdapter {
  readonly name = "webhook";

  constructor(private readonly webhookUrl: string) {}

  async send(message: SlackMessage): Promise<SlackSendResult> {
    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message.text, ...(message.channel ? { channel: message.channel } : {}) }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Slack webhook failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    return { ok: true };
  }
}

export function createSlackAdapter(webhookUrl?: string): SlackAdapter {
  return webhookUrl && webhookUrl.startsWith("https://")
    ? new WebhookSlackAdapter(webhookUrl)
    : new NoopSlackAdapter();
}
