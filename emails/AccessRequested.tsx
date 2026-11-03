/**
 * "Someone asked for an account" email to admins (ADM-04, REQ-AUTH-08).
 *
 * Shows who asked (name, email, how they signed up) and the branch their sign-in suggests,
 * with a link to the access requests in Admin › Users. Rendered to HTML and plain text by
 * lib/email.
 */

import type { AuthProvider } from '@/types/domain';

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

export interface AccessRequestedEmailProps {
  requester: { name: string; email: string; authProvider: AuthProvider };
  /** The branch suggested by the requester's SSO groups, or `null` when there is none. */
  branchName: string | null;
  /** The access requests view in Admin › Users. */
  url: string;
}

/** How the requester signed up, as admins see it. */
export const PROVIDER_LABEL: Record<AuthProvider, string> = {
  password: 'Email and password',
  google: 'Google',
  microsoft: 'Microsoft',
  saml: 'Organization single sign-on (SAML)',
};

/** One line of text: a user-entered name must not break a header or the layout. */
export function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Subject line, e.g. "Access request from Ana Example". */
export function accessRequestedSubject(requester: { name: string }): string {
  return `Access request from ${oneLine(requester.name)}`;
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
  text: { color: '#333333', fontSize: '15px', lineHeight: '22px', margin: '0 0 12px' },
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

export function AccessRequested({ requester, branchName, url }: AccessRequestedEmailProps) {
  const name = oneLine(requester.name);
  const details: Array<[string, string]> = [
    ['Name', name],
    ['Email', requester.email],
    ['Signed up with', PROVIDER_LABEL[requester.authProvider]],
    ['Suggested branch', branchName ?? 'None. Choose one when you approve.'],
  ];
  return (
    <Html lang="en">
      <Head />
      <Preview>{accessRequestedSubject(requester)}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading as="h1" style={styles.heading}>
            New access request
          </Heading>
          <Text style={styles.text}>
            {name} asked for a Worship Library account. They can&apos;t see anything until an admin
            approves them.
          </Text>

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
              Review access requests
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
