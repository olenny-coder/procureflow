import { randomUUID } from "node:crypto";
import type { EmailAdapter, EmailMessage, EmailSendResult } from "./types";

/** Local development adapter: prints the full message as a structured log. */
export class ConsoleEmailAdapter implements EmailAdapter {
  readonly name = "console";

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const id = `console-${randomUUID()}`;
    console.log(
      JSON.stringify({
        level: "info",
        msg: "email_console_delivery",
        id,
        to: message.to,
        subject: message.subject,
        body: message.body,
      }),
    );
    return { id };
  }
}

export interface ResendConfig {
  apiKey: string;
  from: string;
}

/**
 * Production adapter for Resend. The MVP ships this working when RESEND_API_KEY
 * is set; otherwise the registry falls back to the console adapter.
 */
export class ResendEmailAdapter implements EmailAdapter {
  readonly name = "resend";

  constructor(private readonly config: ResendConfig) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [message.to],
        subject: message.subject,
        text: message.body,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend delivery failed (${response.status}): ${detail.slice(0, 500)}`);
    }

    const payload = (await response.json()) as { id?: string };
    return { id: payload.id ?? `resend-${randomUUID()}` };
  }
}

export class NoopEmailAdapter implements EmailAdapter {
  readonly name = "noop";
  async send(): Promise<EmailSendResult> {
    return { id: `noop-${randomUUID()}`, skipped: true };
  }
}

export function createEmailAdapter(options: {
  kind: string;
  from: string;
  resendApiKey?: string;
}): EmailAdapter {
  if (options.kind === "resend" && options.resendApiKey) {
    return new ResendEmailAdapter({ apiKey: options.resendApiKey, from: options.from });
  }
  return new ConsoleEmailAdapter();
}
