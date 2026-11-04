// @vitest-environment node
import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';

import { BugReported, bugReportedSubject } from './BugReported';

const props = {
  title: 'Search\nis broken',
  reporter: { name: 'Mia Member', email: 'mia@example.test' },
  pagePath: '/library',
  url: 'https://app.example.test/admin/bugs/1',
};

describe('bugReportedSubject', () => {
  it('is one line and not too long', () => {
    expect(bugReportedSubject('Search\r\nBcc: x@example.test')).toBe(
      'Bug report: Search Bcc: x@example.test',
    );
    const long = bugReportedSubject('x'.repeat(300));
    expect(long.length).toBeLessThanOrEqual(140);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('BugReported', () => {
  it('shows the title, reporter, page and link', async () => {
    const html = await render(<BugReported {...props} />);
    expect(html).toContain('Search is broken');
    expect(html).toContain('Mia Member (mia@example.test)');
    expect(html).toContain('/library');
    expect(html).toContain('href="https://app.example.test/admin/bugs/1"');
  });

  it('says when the page was not captured', async () => {
    const text = await render(<BugReported {...props} pagePath={null} />, { plainText: true });
    expect(text).toContain('Not captured');
  });
});
