import { createHmac, timingSafeEqual } from 'node:crypto';
import * as net from 'node:net';

/** Local/demo adapter contracts; providers are selected by deployment configuration. */
export interface EmailAdapter {
  send(input: { to: string; subject: string; text: string; idempotencyKey: string }): Promise<void>;
}

export interface StorageAdapter {
  createUpload(input: { key: string; contentType: string }): Promise<{ uploadUrl: string }>;
}

export function webhookSignature(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function verifyWebhookSignature(secret: string, body: string, signature: string): boolean {
  const expected = Buffer.from(webhookSignature(secret, body), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class ConsoleEmailAdapter implements EmailAdapter {
  async send(input: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }): Promise<void> {
    console.info(
      JSON.stringify({
        adapter: 'console-email',
        to: input.to,
        subject: input.subject,
        idempotencyKey: input.idempotencyKey,
      }),
    );
  }
}

export interface SentEmailMessage {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
  sentAt: Date;
}

export class MemoryEmailAdapter implements EmailAdapter {
  public sentMessages: SentEmailMessage[] = [];

  async send(input: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }): Promise<void> {
    this.sentMessages.push({
      ...input,
      sentAt: new Date(),
    });
  }

  getSent(): SentEmailMessage[] {
    return [...this.sentMessages];
  }

  clear(): void {
    this.sentMessages = [];
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  from?: string;
  user?: string;
  pass?: string;
  timeoutMs?: number;
}

/**
 * Lightweight native Node.js SMTP adapter compatible with Mailpit, Mailhog, Postfix, and SMTP relays.
 */
export class SmtpEmailAdapter implements EmailAdapter {
  private readonly config: SmtpConfig;

  constructor(config: SmtpConfig) {
    this.config = {
      timeoutMs: 8000,
      from: 'noreply@worksphere.local',
      ...config,
    };
  }

  async send(input: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }): Promise<void> {
    const fromAddress = this.config.from || 'noreply@worksphere.local';
    const lines = [
      `From: WorkSphere <${fromAddress}>`,
      `To: <${input.to}>`,
      `Subject: ${input.subject}`,
      `X-Idempotency-Key: ${input.idempotencyKey}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${input.idempotencyKey}@worksphere.local>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      input.text,
      '',
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let resolved = false;
      const socket = net.createConnection(this.config.port, this.config.host);
      socket.setEncoding('utf-8');
      socket.setTimeout(this.config.timeoutMs || 8000);

      const cleanup = () => {
        socket.removeAllListeners();
        socket.on('error', () => {});
        socket.destroy();
      };

      const fail = (err: Error) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(err);
        }
      };

      const succeed = () => {
        if (!resolved) {
          resolved = true;
          socket.removeAllListeners();
          socket.on('error', () => {});
          socket.end();
          resolve();
        }
      };

      socket.on('error', fail);
      socket.on('timeout', () => fail(new Error(`SMTP connection timed out after ${this.config.timeoutMs}ms`)));

      let stage = 0;
      socket.on('data', (data: string) => {
        const code = parseInt(data.slice(0, 3), 10);
        if (code >= 400) {
          return fail(new Error(`SMTP error ${code}: ${data.trim()}`));
        }

        switch (stage) {
          case 0: // Banner received
            stage = 1;
            socket.write('EHLO worksphere.local\r\n');
            break;
          case 1: // EHLO response received
            if (this.config.user && this.config.pass) {
              stage = 2;
              socket.write('AUTH LOGIN\r\n');
            } else {
              stage = 4;
              socket.write(`MAIL FROM:<${fromAddress}>\r\n`);
            }
            break;
          case 2: // AUTH LOGIN prompt (Username)
            stage = 3;
            socket.write(`${Buffer.from(this.config.user || '').toString('base64')}\r\n`);
            break;
          case 3: // AUTH LOGIN prompt (Password)
            stage = 4;
            socket.write(`${Buffer.from(this.config.pass || '').toString('base64')}\r\n`);
            break;
          case 4: // MAIL FROM ok
            stage = 5;
            socket.write(`RCPT TO:<${input.to}>\r\n`);
            break;
          case 5: // RCPT TO ok
            stage = 6;
            socket.write('DATA\r\n');
            break;
          case 6: // DATA prompt received (354)
            stage = 7;
            socket.write(lines + '.\r\n');
            break;
          case 7: // Message accepted (250)
            stage = 8;
            socket.write('QUIT\r\n');
            break;
          case 8: // 221 Bye
            succeed();
            break;
          default:
            break;
        }
      });
    });
  }
}

export function createEmailAdapterFromEnv(
  env: Record<string, string | undefined> = process.env,
): EmailAdapter {
  const driver = (env.EMAIL_DRIVER || '').toLowerCase();
  if (driver === 'smtp' || (env.SMTP_HOST && driver !== 'console')) {
    return new SmtpEmailAdapter({
      host: env.SMTP_HOST || '127.0.0.1',
      port: parseInt(env.SMTP_PORT || '1025', 10),
      from: env.EMAIL_FROM || 'noreply@worksphere.local',
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    });
  }
  if (driver === 'memory') {
    return new MemoryEmailAdapter();
  }
  return new ConsoleEmailAdapter();
}


/**
 * Calendar Event Item representing a project task or milestone.
 */
export interface CalendarEventItem {
  id: string;
  title: string;
  description?: string | null;
  startDate: Date;
  endDate?: Date | null;
  type: 'TASK' | 'MILESTONE';
  status?: string;
}

/**
 * Formats a Date into standard iCalendar RFC 5545 UTC timestamp (YYYYMMDDTHHMMSSZ).
 */
export function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escapes special characters for iCalendar text fields according to RFC 5545.
 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Generates an RFC 5545 compliant iCalendar string (.ics) for a project.
 */
export function generateIcsCalendar(options: {
  projectName: string;
  projectDescription?: string | null;
  items: CalendarEventItem[];
}): string {
  const now = formatIcsDate(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WorkSphere//WorkSphere Project Management//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(options.projectName)}`,
  ];

  if (options.projectDescription) {
    lines.push(`X-WR-CALDESC:${escapeIcsText(options.projectDescription)}`);
  }

  for (const item of options.items) {
    const dtStart = formatIcsDate(item.startDate);
    const endDate = item.endDate ?? new Date(item.startDate.getTime() + 60 * 60 * 1000);
    const dtEnd = formatIcsDate(endDate);
    const summary = escapeIcsText(`[${item.type}] ${item.title}`);
    const desc = escapeIcsText(
      item.description
        ? `${item.description} (Status: ${item.status ?? 'ACTIVE'})`
        : `Status: ${item.status ?? 'ACTIVE'}`,
    );

    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.type.toLowerCase()}-${item.id}@worksphere.local`,
      `DTSTAMP:${now}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      `STATUS:${item.status === 'DONE' ? 'COMPLETED' : 'CONFIRMED'}`,
      `CATEGORIES:${item.type}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/**
 * Interface and implementation for webhook dispatching.
 */
export interface WebhookAdapter {
  dispatch(input: {
    targetUrl: string;
    secret: string;
    event: string;
    payload: Record<string, any>;
    idempotencyKey: string;
  }): Promise<{ signature: string; delivered: boolean }>;
}

export class ConsoleWebhookAdapter implements WebhookAdapter {
  async dispatch(input: {
    targetUrl: string;
    secret: string;
    event: string;
    payload: Record<string, any>;
    idempotencyKey: string;
  }): Promise<{ signature: string; delivered: boolean }> {
    const serializedPayload = JSON.stringify(input.payload);
    const signature = webhookSignature(input.secret, serializedPayload);
    console.info(
      JSON.stringify({
        adapter: 'console-webhook',
        targetUrl: input.targetUrl,
        event: input.event,
        idempotencyKey: input.idempotencyKey,
        signature,
      }),
    );
    return { signature, delivered: true };
  }
}
