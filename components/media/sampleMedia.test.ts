import { describe, expect, it } from 'vitest';
import { buildSamplePdf } from './sampleMedia';

describe('buildSamplePdf', () => {
  it('declares the requested page count', () => {
    const pdf = buildSamplePdf(4);
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf).toContain('/Count 4');
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(4);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('has an xref table whose offsets point at each object', () => {
    const pdf = buildSamplePdf(3);
    const startxref = Number(/startxref\n(\d+)\n/.exec(pdf)![1]);
    expect(pdf.slice(startxref).startsWith('xref\n')).toBe(true);
    const offsets = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );
    expect(offsets).toHaveLength(3 + 3 * 2);
    offsets.forEach((off, i) => expect(pdf.slice(off).startsWith(`${i + 1} 0 obj\n`)).toBe(true));
  });

  it('gives each content stream its exact length', () => {
    const pdf = buildSamplePdf(2);
    for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) {
      expect(m[2]!.length).toBe(Number(m[1]));
    }
  });

  it('builds at least one page', () => {
    expect(buildSamplePdf(0)).toContain('/Count 1');
  });
});
