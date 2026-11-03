/**
 * "Your account was approved" email to the requester (ADM-04, REQ-AUTH-08).
 *
 * Tells them they can sign in now, with a link to `/login`. Rendered to HTML and plain text
 * by lib/email. Rejections send no email; `/account-status` explains them.
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

import { oneLine } from './AccessRequested';

export interface AccessApprovedEmailProps {
  /** The approved user's display name. */
  name: string;
  /** The sign-in page. */
  url: string;
}

export const ACCESS_APPROVED_SUBJECT = 'Your Worship Library account is ready';

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

export function AccessApproved({ name, url }: AccessApprovedEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{ACCESS_APPROVED_SUBJECT}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading as="h1" style={styles.heading}>
            You&apos;re in
          </Heading>
          <Text style={styles.text}>{`Hi ${oneLine(name)},`}</Text>
          <Text style={styles.text}>
            An admin approved your Worship Library account. Sign in the same way you signed up to
            start using the library.
          </Text>

          <Hr />
          <Section>
            <Button href={url} style={styles.button}>
              Sign in
            </Button>
          </Section>
          <Text style={styles.footer}>
            Or copy this link: <Link href={url}>{url}</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
