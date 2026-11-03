/**
 * "A list was shared with you" email (SHR-03, REQ-SHARE-02).
 *
 * A summary of the list (name, type, event date, branch) and every song in order with the
 * key, BPM and energy the team will use. Values changed for this list (overrides) are marked
 * and show the song's own value, so nobody prepares the wrong key. Ends with the read-only
 * share link. Rendered to HTML and plain text by lib/email.
 */

import type { ListDetail, ResolvedItem } from '@/types/domain';

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

import { ENERGY_META } from '@/types/domain';

export interface ShareListEmailProps {
  list: ListDetail;
  /** The public, read-only link to the list. */
  url: string;
  /** Name of the person who shared it. */
  senderName: string;
}

const LIST_TYPE_LABEL: Record<ListDetail['type'], string> = {
  setlist: 'Setlist',
  playlist: 'Playlist',
};

/** A plain event date ('YYYY-MM-DD', no time zone), e.g. "Sunday, November 8, 2026". */
export function formatEmailDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(parsed);
}

/** Subject line, e.g. "Ana shared “Sunday worship” with you". */
export function shareListSubject(list: Pick<ListDetail, 'name'>, senderName: string): string {
  return `${senderName} shared “${list.name}” with you`;
}

/** The details shown for one song: key, BPM and energy, overrides marked with the original. */
export function itemDetails(item: ResolvedItem): string[] {
  const parts: string[] = [];
  if (item.key !== null) {
    parts.push(
      item.isOverridden.key
        ? `Key ${item.key} (changed${item.song.primaryKey ? ` from ${item.song.primaryKey}` : ''})`
        : `Key ${item.key}`,
    );
  }
  if (item.bpm !== null) {
    parts.push(
      item.isOverridden.bpm
        ? `${item.bpm} BPM (changed${item.song.tempoBpm !== null ? ` from ${item.song.tempoBpm}` : ''})`
        : `${item.bpm} BPM`,
    );
  }
  if (item.energy !== null) {
    const label = ENERGY_META[item.energy].label;
    const original = item.song.energyLevel;
    parts.push(
      item.isOverridden.energy
        ? `${label} (changed${original ? ` from ${ENERGY_META[original].label}` : ''})`
        : label,
    );
  }
  return parts;
}

function summaryLine(list: ListDetail): string {
  const parts = [LIST_TYPE_LABEL[list.type]];
  if (list.eventDate) parts.push(formatEmailDate(list.eventDate));
  if (list.branchCode) parts.push(list.branchCode);
  const count = list.items.length;
  parts.push(count === 1 ? '1 song' : `${count} songs`);
  return parts.join(' · ');
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
  heading: { fontSize: '22px', lineHeight: '28px', margin: '0 0 4px' },
  muted: { color: '#555555', fontSize: '14px', lineHeight: '20px', margin: '0 0 16px' },
  songTitle: { fontSize: '16px', fontWeight: 600, lineHeight: '22px', margin: '12px 0 0' },
  songDetails: { color: '#333333', fontSize: '14px', lineHeight: '20px', margin: '2px 0 0' },
  note: {
    color: '#555555',
    fontSize: '14px',
    fontStyle: 'italic',
    lineHeight: '20px',
    margin: '2px 0 0',
  },
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

export function ShareList({ list, url, senderName }: ShareListEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{shareListSubject(list, senderName)}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading as="h1" style={styles.heading}>
            {list.name}
          </Heading>
          <Text style={styles.muted}>{summaryLine(list)}</Text>
          <Text style={styles.muted}>{senderName} shared this list with you.</Text>

          <Section>
            {list.items.length === 0 ? (
              <Text style={styles.songDetails}>This list has no songs yet.</Text>
            ) : (
              list.items.map((item, index) => {
                const details = itemDetails(item);
                return (
                  <Section key={item.item.id}>
                    <Text style={styles.songTitle}>
                      {index + 1}. {item.song.title}
                    </Text>
                    {details.length > 0 && (
                      <Text style={styles.songDetails}>{details.join(' · ')}</Text>
                    )}
                    {item.item.notes && <Text style={styles.note}>{item.item.notes}</Text>}
                  </Section>
                );
              })
            )}
          </Section>

          <Hr />
          <Section>
            <Button href={url} style={styles.button}>
              Open the list
            </Button>
          </Section>
          <Text style={styles.footer}>
            Or copy this link: <Link href={url}>{url}</Link>
            <br />
            Anyone with the link can view the list. Opening files needs a Worship Library account.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
