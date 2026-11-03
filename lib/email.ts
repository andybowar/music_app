/**
 * Outgoing email over SMTP (contracts/api.md "Core libs"; CR OWNER-gmail-smtp-email).
 *
 * `sendEmail({ to, subject, react })` renders a react-email template to HTML and plain text
 * and sends both parts through Nodemailer. The module is provider-neutral: it only reads
 * `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `EMAIL_FROM`, so Gmail (the
 * default) can be swapped for any SMTP server by changing env vars.
 *
 * - Without `SMTP_USER` or `SMTP_PASSWORD` nothing is sent: the message is logged (subject,
 *   recipient count and text body, scrubbed by lib/log) and the result says `delivered: false`.
 *   Dev, CI and tests need no credentials. Callers that must not pretend to have sent mail
 *   check `isEmailConfigured()` first.
 * - Port 465 uses implicit TLS; any other port upgrades with STARTTLS.
 * - With only `bcc` given, the To header is the sender's own address, so no recipient sees
 *   the others (Gmail delivers BCC copies normally).
 * - Sending-limit rejections (Gmail's daily quota, "try again later" throttling) throw
 *   `EmailRateLimitError` so actions can return `RATE_LIMITED`. Other failures are rethrown.
 */

import 'server-only';

import type { ReactElement } from 'react';

import { render } from '@react-email/render';
import { createTransport, type Transporter } from 'nodemailer';

import { env } from '@/lib/env';
import { log } from '@/lib/log';

export interface SendEmailInput {
  /** Visible recipients. Optional when `bcc` is given. */
  to?: string | readonly string[];
  /** Hidden recipients. */
  bcc?: string | readonly string[];
  /** Where replies go, e.g. the person who shared the list. */
  replyTo?: string;
  subject: string;
  react: ReactElement;
}

export interface SendEmailResult {
  /** `false` when SMTP is not configured and the message was only logged. */
  delivered: boolean;
}

/** The SMTP server refused the message because a sending limit was reached. */
export class EmailRateLimitError extends Error {
  constructor(message = 'The email sending limit was reached.', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EmailRateLimitError';
  }
}

const DEFAULT_FROM_NAME = 'Worship Library';

/** True when SMTP credentials are set, i.e. `sendEmail` really sends. */
export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
}

/** The From header: `EMAIL_FROM`, else "Worship Library <SMTP_USER>". */
export function emailFrom(): string | undefined {
  if (env.EMAIL_FROM) return env.EMAIL_FROM;
  return env.SMTP_USER ? `${DEFAULT_FROM_NAME} <${env.SMTP_USER}>` : undefined;
}

const toList = (value: string | readonly string[] | undefined): string[] =>
  value === undefined ? [] : typeof value === 'string' ? [value] : [...value];

/**
 * Whether an SMTP error means "sending limit reached". Gmail answers `550 5.4.5 Daily user
 * sending limit exceeded` (also `5.4.5` on 552/554) and throttles with `421 4.7.0 Try again
 * later` / `454 4.7.0 … rate limit`. Matched on the enhanced status code or the wording.
 */
export function isSendingLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { response, responseCode } = error as Error & {
    response?: unknown;
    responseCode?: unknown;
  };
  const text = `${typeof response === 'string' ? response : ''} ${error.message}`.toLowerCase();
  if (/\b5\.4\.5\b/.test(text)) return true;
  if (/sending limit|quota|rate limit|too many messages|try again later/.test(text)) {
    return (
      responseCode === undefined ||
      [421, 450, 451, 452, 454, 550, 552, 554].includes(Number(responseCode))
    );
  }
  return false;
}

let cached: { key: string; transporter: Transporter } | undefined;

function transporter(): Transporter {
  const config = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER ?? '', pass: env.SMTP_PASSWORD ?? '' },
  };
  const key = JSON.stringify(config);
  if (cached?.key !== key) cached = { key, transporter: createTransport(config) };
  return cached.transporter;
}

/** Test-only: forget the cached SMTP transport. */
export function resetEmailTransportForTests(): void {
  cached = undefined;
}

/** Render `react` to HTML + text and send it (or log it when SMTP is not configured). */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const to = toList(input.to);
  const bcc = toList(input.bcc);
  if (to.length + bcc.length === 0) throw new Error('sendEmail needs at least one recipient');

  const [html, text] = await Promise.all([
    render(input.react),
    render(input.react, { plainText: true }),
  ]);

  if (!isEmailConfigured()) {
    log.info('email not sent: SMTP is not configured', {
      subject: input.subject,
      recipientCount: to.length + bcc.length,
      text,
    });
    return { delivered: false };
  }

  const from = emailFrom();
  try {
    await transporter().sendMail({
      from,
      to: to.length ? to : from,
      ...(bcc.length ? { bcc } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      subject: input.subject,
      html,
      text,
    });
  } catch (error) {
    if (isSendingLimitError(error)) throw new EmailRateLimitError(undefined, { cause: error });
    throw error;
  }
  return { delivered: true };
}
