// @vitest-environment node
import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';

import { AUTH_PROVIDERS } from '@/types/domain';

import {
  AccessRequested,
  accessRequestedSubject,
  oneLine,
  PROVIDER_LABEL,
} from './AccessRequested';

const URL = 'https://app.example.test/admin/users';
const requester = {
  name: 'Sam Example',
  email: 'sam@example.test',
  authProvider: 'password' as const,
};

describe('accessRequestedSubject', () => {
  it('names the requester on one line', () => {
    expect(accessRequestedSubject(requester)).toBe('Access request from Sam Example');
    expect(accessRequestedSubject({ name: ' Sam\r\nBcc: x@example.test ' })).toBe(
      'Access request from Sam Bcc: x@example.test',
    );
  });
});

describe('oneLine', () => {
  it('collapses whitespace and trims', () => {
    expect(oneLine('  a \n\t b  ')).toBe('a b');
  });
});

describe('PROVIDER_LABEL', () => {
  it('labels every provider', () => {
    for (const provider of AUTH_PROVIDERS) expect(PROVIDER_LABEL[provider]).toBeTruthy();
  });
});

describe('AccessRequested', () => {
  it('shows who asked, how, the suggested branch and the review link', async () => {
    const html = await render(
      <AccessRequested
        requester={{ ...requester, authProvider: 'google' }}
        branchName="Example Branch (EXB)"
        url={URL}
      />,
    );
    expect(html).toContain('New access request');
    expect(html).toContain('Sam Example');
    expect(html).toContain('sam@example.test');
    expect(html).toContain('Google');
    expect(html).toContain('Example Branch (EXB)');
    expect(html).toContain(`href="${URL}"`);
  });

  it('says when no branch is suggested, in the plain-text part too', async () => {
    const text = await render(
      <AccessRequested requester={requester} branchName={null} url={URL} />,
      { plainText: true },
    );
    expect(text).toContain('Email and password');
    expect(text).toContain('None. Choose one when you approve.');
    expect(text).toContain(URL);
  });

  it('escapes user-entered names', async () => {
    const html = await render(
      <AccessRequested
        requester={{ ...requester, name: '<script>alert(1)</script>' }}
        branchName={null}
        url={URL}
      />,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
