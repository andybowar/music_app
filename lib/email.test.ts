// @vitest-environment node
import { createElement } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envValues: Record<string, unknown> = {};
vi.mock('@/lib/env', () => ({
  env: new Proxy({}, { get: (_t, key: string) => envValues[key] }),
}));

const logInfo = vi.fn();
vi.mock('@/lib/log', () => ({ log: { info: (...a: unknown[]) => logInfo(...a) } }));

const sendMail = vi.fn<(message: Record<string, unknown>) => Promise<unknown>>();
const createTransport = vi.fn((_config: unknown) => ({ sendMail }));
vi.mock('nodemailer', () => ({ createTransport: (c: unknown) => createTransport(c) }));

const {
  EmailRateLimitError,
  emailFrom,
  isEmailConfigured,
  isSendingLimitError,
  resetEmailTransportForTests,
  sendEmail,
} = await import('./email');

function Template({ name }: { name: string }) {
  return createElement('p', null, `Hello ${name}`);
}
const react = createElement(Template, { name: 'team' });

function configure(values: Record<string, unknown> = {}) {
  for (const key of Object.keys(envValues)) delete envValues[key];
  Object.assign(
    envValues,
    { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: 465, SMTP_USER: 'app@example.test' },
    { SMTP_PASSWORD: 'app-password' },
    values,
  );
}

function smtpError(message: string, responseCode?: number, response?: string) {
  return Object.assign(new Error(message), { responseCode, response });
}

beforeEach(() => {
  configure();
  resetEmailTransportForTests();
  sendMail.mockReset().mockResolvedValue({});
  createTransport.mockClear();
  logInfo.mockClear();
});

describe('isEmailConfigured / emailFrom', () => {
  it('needs both user and password', () => {
    expect(isEmailConfigured()).toBe(true);
    configure({ SMTP_PASSWORD: undefined });
    expect(isEmailConfigured()).toBe(false);
    configure({ SMTP_USER: undefined });
    expect(isEmailConfigured()).toBe(false);
  });

  it('uses EMAIL_FROM, else a display name around SMTP_USER', () => {
    expect(emailFrom()).toBe('Worship Library <app@example.test>');
    configure({ EMAIL_FROM: 'Team <app@example.test>' });
    expect(emailFrom()).toBe('Team <app@example.test>');
    configure({ SMTP_USER: undefined });
    expect(emailFrom()).toBeUndefined();
  });
});

describe('sendEmail', () => {
  it('logs instead of sending when SMTP is not configured', async () => {
    configure({ SMTP_USER: undefined, SMTP_PASSWORD: undefined });
    await expect(sendEmail({ to: 'a@example.test', subject: 'Hi', react })).resolves.toEqual({
      delivered: false,
    });
    expect(createTransport).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith(
      'email not sent: SMTP is not configured',
      expect.objectContaining({ subject: 'Hi', recipientCount: 1, text: 'Hello team' }),
    );
  });

  it('sends HTML and text over implicit TLS on port 465', async () => {
    await expect(
      sendEmail({ to: ['a@example.test', 'b@example.test'], subject: 'Hi', react }),
    ).resolves.toEqual({ delivered: true });
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: 'app@example.test', pass: 'app-password' },
    });
    const message = sendMail.mock.calls[0]![0];
    expect(message).toMatchObject({
      from: 'Worship Library <app@example.test>',
      to: ['a@example.test', 'b@example.test'],
      subject: 'Hi',
      text: 'Hello team',
    });
    expect(message.html).toContain('<p>Hello team</p>');
    expect(message).not.toHaveProperty('bcc');
    expect(message).not.toHaveProperty('replyTo');
  });

  it('uses STARTTLS on other ports and reuses the transport', async () => {
    configure({ SMTP_PORT: 587, SMTP_HOST: 'smtp.example.test' });
    await sendEmail({ to: 'a@example.test', subject: 'Hi', react });
    await sendEmail({ to: 'a@example.test', subject: 'Hi', react });
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.test', port: 587, secure: false }),
    );
  });

  it('addresses BCC-only mail to the sender, with reply-to', async () => {
    await sendEmail({
      bcc: ['a@example.test', 'b@example.test'],
      replyTo: 'leader@example.test',
      subject: 'Hi',
      react,
    });
    expect(sendMail.mock.calls[0]![0]).toMatchObject({
      from: 'Worship Library <app@example.test>',
      to: 'Worship Library <app@example.test>',
      bcc: ['a@example.test', 'b@example.test'],
      replyTo: 'leader@example.test',
    });
  });

  it('refuses a message without recipients', async () => {
    await expect(sendEmail({ subject: 'Hi', react })).rejects.toThrow(/at least one recipient/);
  });

  it('maps sending-limit rejections to EmailRateLimitError', async () => {
    sendMail.mockRejectedValue(
      smtpError('Message failed', 550, '550 5.4.5 Daily user sending limit exceeded.'),
    );
    await expect(sendEmail({ to: 'a@example.test', subject: 'Hi', react })).rejects.toBeInstanceOf(
      EmailRateLimitError,
    );
  });

  it('rethrows other SMTP failures', async () => {
    const error = smtpError('Invalid login', 535, '535 5.7.8 Username and Password not accepted');
    sendMail.mockRejectedValue(error);
    await expect(sendEmail({ to: 'a@example.test', subject: 'Hi', react })).rejects.toBe(error);
  });
});

describe('isSendingLimitError', () => {
  it.each([
    [smtpError('x', 550, '550 5.4.5 Daily user sending limit exceeded'), true],
    [smtpError('x', 552, '552 5.4.5 quota'), true],
    [smtpError('x', 421, '421 4.7.0 Try again later, closing connection.'), true],
    [smtpError('x', 454, '454 4.7.0 Too many login attempts, rate limit exceeded'), true],
    [new Error('Daily sending limit reached'), true],
    [smtpError('x', 535, '535 5.7.8 Username and Password not accepted'), false],
    [smtpError('x', 250, '250 quota fine'), false],
    [new Error('Connection timeout'), false],
    ['550 5.4.5', false],
    [null, false],
  ])('%#', (error, expected) => {
    expect(isSendingLimitError(error)).toBe(expected);
  });
});
