// Generates simple PNG app icons (indigo square with a white ring) without extra dependencies.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

function crc32(buf) {
  let c;
  const table = Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const bg = [79, 70, 229];
  const fg = [255, 255, 255];
  const mid = size / 2;
  const outer = size * 0.3;
  const inner = size * 0.18;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - mid, y - mid);
      const ring = d <= outer && d >= inner;
      const dot = d <= size * 0.07;
      const c = ring || dot ? fg : bg;
      raw[o++] = c[0];
      raw[o++] = c[1];
      raw[o++] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../public/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, dir), png(size));
}

// Source art for @capacitor/assets (Android launcher icon and splash screen).
mkdirSync(new URL('../assets/', import.meta.url), { recursive: true });
writeFileSync(new URL('../assets/icon-only.png', import.meta.url), png(1024));
writeFileSync(new URL('../assets/splash.png', import.meta.url), png(2732));
console.log('icons and assets written');
