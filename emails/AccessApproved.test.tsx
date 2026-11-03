// @vitest-environment node
import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';

import { ACCESS_APPROVED_SUBJECT, AccessApproved } from './AccessApproved';

const URL = 'https://app.example.test/login';

describe('AccessApproved', () => {
  it('has a fixed subject', () => {
    expect(ACCESS_APPROVED_SUBJECT).toBe('Your Worship Library account is ready');
  });

  it('greets the user and links to sign-in', async () => {
    const html = await render(<AccessApproved name="Sam Example" url={URL} />);
    expect(html).toContain('Hi Sam Example,');
    expect(html).toContain('approved your Worship Library account');
    expect(html).toContain(`href="${URL}"`);
  });

  it('includes the link in the plain-text part', async () => {
    const text = await render(<AccessApproved name={'Sam\nExample'} url={URL} />, {
      plainText: true,
    });
    expect(text).toContain('Hi Sam Example,');
    expect(text).toContain(URL);
  });
});
