// Builds a certificate PDF: the instructor's design as the background, then each field drawn on top (pdf-lib).
// pdf-lib, fontkit and qrcode load only when a certificate is made, so they do not slow down the rest of the app.
import { anchorX, fitSize, hexToRgb01, imagePageSize, inkOf, isQr, needsUploadedFont, paperRgb01, pdfSafeText } from './certificateRules.js';

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

/** Checks that a font file can be embedded. Throws a readable message otherwise. */
export async function checkFont(fontBytes) {
  const [{ PDFDocument }, fontkit] = await Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit')]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit.default || fontkit);
  try { await doc.embedFont(fontBytes, { subset: true }); } catch { throw new Error('This font file could not be read. Use a .ttf or .otf file.'); }
}

/** The QR code as rows of dark squares: { size, dark(row, col) }. */
export async function qrMatrix(text) {
  const mod = await import('qrcode');
  const qr = (mod.default || mod).create(text, { errorCorrectionLevel: 'M' });
  const { size, data } = qr.modules;
  return { size, dark: (r, c) => Boolean(data[r * size + c]) };
}

/**
 * template: { file_kind, page_width, page_height, fields }. bytes: the design file. text: { fieldKey: string }.
 * fontBytes: the uploaded font, if any. Returns the PDF as a Uint8Array.
 */
export async function renderCertificate(template, bytes, text, title = 'Certificate', fontBytes = null) {
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

  let uploaded = null;
  if (fontBytes) {
    const fontkit = await import('@pdf-lib/fontkit');
    doc.registerFontkit(fontkit.default || fontkit);
    uploaded = await doc.embedFont(fontBytes, { subset: true });
  }
  const fonts = {};
  for (const f of template.fields.filter((x) => x.enabled)) {
    const raw = text[f.key];
    if (!raw) continue;
    const { r, g, b } = hexToRgb01(inkOf(f));
    const ink = rgb(r, g, b);

    if (isQr(f)) {
      const qr = await qrMatrix(raw);
      const quiet = 2; // white margin in modules, so it scans on any background
      const cell = f.size / (qr.size + quiet * 2);
      const left = f.x * width - f.size / 2;
      const top = height * (1 - f.y) + f.size / 2;
      const paper = paperRgb01();
      page.drawRectangle({ x: left, y: top - f.size, width: f.size, height: f.size, color: rgb(paper.r, paper.g, paper.b) });
      for (let row = 0; row < qr.size; row += 1) {
        for (let col = 0; col < qr.size; col += 1) {
          if (!qr.dark(row, col)) continue;
          let run = 1; // merge dark squares in a row into one rectangle
          while (col + run < qr.size && qr.dark(row, col + run)) run += 1;
          page.drawRectangle({ x: left + (col + quiet) * cell, y: top - (row + quiet + 1) * cell, width: run * cell, height: cell, color: ink });
          col += run - 1;
        }
      }
      continue;
    }

    // The uploaded font when chosen, or automatically for names the built-in fonts cannot print.
    const useUploaded = uploaded && (f.font === 'Custom' || needsUploadedFont(raw));
    const value = useUploaded ? String(raw).normalize('NFC') : pdfSafeText(raw);
    let font = uploaded;
    if (!useUploaded) {
      const id = f.font === 'Custom' ? 'Helvetica' : f.font;
      fonts[id] ||= await doc.embedFont(StandardFonts[id]);
      font = fonts[id];
    }
    const size = fitSize((s) => font.widthOfTextAtSize(value, s), f.size, f.maxWidth * width);
    const textWidth = font.widthOfTextAtSize(value, size);
    page.drawText(value, { x: anchorX(f.x, width, textWidth, f.align), y: height * (1 - f.y), size, font, color: ink });
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
