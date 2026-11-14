// Builds a certificate PDF: the instructor's design as the background, then each field drawn on top (pdf-lib).
// pdf-lib is loaded only when a certificate is made, so it does not slow down the rest of the app.
import { anchorX, fitSize, hexToRgb01, imagePageSize, inkOf, pdfSafeText } from './certificateRules.js';

/** Page size in points of a design file: the first PDF page, or the image scaled to A4 size. */
export async function measureTemplate(bytes, kind) {
  const { PDFDocument } = await import('pdf-lib');
  if (kind === 'pdf') {
    const doc = await PDFDocument.load(bytes);
    if (doc.getPageCount() === 0) throw new Error('This PDF has no pages.');
    const { width, height } = doc.getPage(0).getSize();
    return { width: Math.round(width), height: Math.round(height) };
  }
  const doc = await PDFDocument.create();
  const img = kind === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  return imagePageSize(img.width, img.height);
}

/**
 * template: { file_kind, page_width, page_height, fields }. bytes: the design file. text: { fieldKey: string }.
 * Returns the PDF as a Uint8Array.
 */
export async function renderCertificate(template, bytes, text, title = 'Certificate') {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  let page;
  if (template.file_kind === 'pdf') {
    const source = await PDFDocument.load(bytes);
    const [copied] = await doc.copyPages(source, [0]);
    page = doc.addPage(copied);
  } else {
    const img = template.file_kind === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    page = doc.addPage([Number(template.page_width), Number(template.page_height)]);
    page.drawImage(img, { x: 0, y: 0, width: Number(template.page_width), height: Number(template.page_height) });
  }
  const { width, height } = page.getSize();
  const fonts = {};
  for (const f of template.fields.filter((x) => x.enabled)) {
    const value = pdfSafeText(text[f.key]);
    if (!value) continue;
    fonts[f.font] ||= await doc.embedFont(StandardFonts[f.font]);
    const font = fonts[f.font];
    const size = fitSize((s) => font.widthOfTextAtSize(value, s), f.size, f.maxWidth * width);
    const textWidth = font.widthOfTextAtSize(value, size);
    const { r, g, b } = hexToRgb01(inkOf(f));
    page.drawText(value, { x: anchorX(f.x, width, textWidth, f.align), y: height * (1 - f.y), size, font, color: rgb(r, g, b) });
  }
  doc.setTitle(title);
  doc.setCreator('JDK Learning System');
  return doc.save();
}

/** Saves bytes as a file on the device. */
export function saveFile(bytes, filename, type = 'application/pdf') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
