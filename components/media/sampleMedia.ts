/**
 * Generated placeholder media for the media gallery and tests: no real sheet music or recordings.
 *
 * `buildSamplePdf` builds a tiny, valid, multi-page PDF (plain ASCII, Helvetica). Its default
 * output is the content of `public/dev/sample.pdf`
 * (agent-spec/change-requests/UI-08-gallery-and-sample-pdf.md).
 */
export function buildSamplePdf(pageCount = 3): string {
  const pages = Math.max(1, Math.trunc(pageCount));
  const objects: string[] = [];
  // 1: catalog, 2: page tree, 3: font, then (page, content) pairs.
  const pageIds = Array.from({ length: pages }, (_, i) => 4 + i * 2);

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages} >>`,
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  for (let i = 0; i < pages; i++) {
    const n = i + 1;
    const stream = [
      '0.9 g 36 36 540 720 re f',
      '0 g BT /F1 36 Tf 72 680 Td (Sample page ' + n + ') Tj ET',
      'BT /F1 14 Tf 72 640 Td (Placeholder PDF for the media gallery. ' +
        n +
        ' of ' +
        pages +
        ') Tj ET',
      '0 G 2 w 72 600 m 540 600 l S',
    ].join('\n');
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return out;
}

/** Object URL for an in-memory sample PDF. Callers revoke it with `URL.revokeObjectURL`. */
export function samplePdfObjectUrl(pageCount = 3): string {
  return URL.createObjectURL(new Blob([buildSamplePdf(pageCount)], { type: 'application/pdf' }));
}

/**
 * A short generated tone as a 16-bit mono WAV (placeholder audio, no recordings).
 * Returns an object URL; callers revoke it with `URL.revokeObjectURL`.
 */
export function sampleToneObjectUrl(seconds = 4, hz = 440, sampleRate = 8000): string {
  const samples = Math.floor(seconds * sampleRate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, i / 400, (samples - i) / 400);
    view.setInt16(
      44 + i * 2,
      Math.sin((2 * Math.PI * hz * i) / sampleRate) * 0.3 * fade * 0x7fff,
      true,
    );
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}
