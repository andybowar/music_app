/**
 * "New bug report" email to admins (ADM-08, REQ-ADM-03).
 *
 * The title, who reported it and on which page, with a link to the report in Admin › Bug
 * reports. The description stays in the app (it can be long and may hold details the
 * reporter only meant for the app). Rendered to HTML and plain text by lib/email.
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

import { oneLine } from '@/emails/AccessRequested';

export interface BugReportedEmailProps {
  title: string;
  reporter: { name: string; email: string };
  /** The page the reporter was on, or null when it wasn't captured. */
  pagePath: string | null;
  /** The report in Admin › Bug reports. */
  url: string;
}

/** Subject line, e.g. "Bug report: Song search returns nothing". */
export function bugReportedSubject(title: string): string {
  const line = oneLine(title);
  return `Bug report: ${line.length > 120 ? `${line.slice(0, 119)}…` : line}`;
}

const styles = {
  body: {
    backgroundColor: '#f6f6f6',
    color: '#1a1a1a',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    margin: 0,
    padding: '24px 0',
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    maxWidth: '560px',
    padding: '24px',
  },
  heading: { fontSize: '22px', lineHeight: '28px', margin: '0 0 12px' },
  label: { color: '#555555', fontSize: '13px', lineHeight: '18px', margin: '8px 0 0' },
  value: { color: '#1a1a1a', fontSize: '15px', lineHeight: '22px', margin: '0' },
  button: {
    backgroundColor: '#1a1a1a',
    borderRadius: '6px',
    color: '#ffffff',
    display: 'inline-block',
    fontSize: '15px',
    fontWeight: 600,
    padding: '12px 20px',
    textDecoration: 'none',
  },
  footer: { color: '#777777', fontSize: '12px', lineHeight: '18px', margin: '16px 0 0' },
} as const;

export function BugReported({ title, reporter, pagePath, url }: BugReportedEmailProps) {
  const details: Array<[string, string]> = [
    ['What went wrong', oneLine(title)],
    ['Reported by', `${oneLine(reporter.name)} (${reporter.email})`],
    ['Page', pagePath ?? 'Not captured'],
  ];
  return (
    <Html lang="en">
      <Head />
      <Preview>{bugReportedSubject(title)}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading as="h1" style={styles.heading}>
            New bug report
          </Heading>
          <Section>
            {details.map(([label, value]) => (
              <Section key={label}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.value}>{value}</Text>
              </Section>
            ))}
          </Section>
          <Hr />
          <Section>
            <Button href={url} style={styles.button}>
              Open the report
            </Button>
          </Section>
          <Text style={styles.footer}>
            Or copy this link: <Link href={url}>{url}</Link>
            <br />
            You get this email because you are a Worship Library admin.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
