// Genera iconos PWA sin dependencias: PNG con fondo Mítico y disco naranja.
// Reemplazables luego por el logo real. Colores: bg #0d0d0d, accent #e8622a.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "icons");
mkdirSync(OUT, { recursive: true });

const BG = [0x0d, 0x0d, 0x0d];
const ACCENT = [0xe8, 0x62, 0x2a];
const CREAM = [0xf5, 0xe6, 0xc8];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size, maskable) {
  const cx = size / 2;
  const cy = size / 2;
  const r = maskable ? size * 0.3 : size * 0.38;
  // raw RGBA con filtro 0 por scanline
  const rowBytes = size * 4 + 1;
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // filtro none
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const inDisc = d <= r;
      const inInner = d <= r * 0.55;
      const col = inInner ? CREAM : inDisc ? ACCENT : BG;
      const off = y * rowBytes + 1 + x * 4;
      raw[off] = col[0];
      raw[off + 1] = col[1];
      raw[off + 2] = col[2];
      raw[off + 3] = 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const targets = [
  ["icon-192.png", 192, false],
  ["icon-384.png", 384, false],
  ["icon-512.png", 512, false],
  ["icon-512-maskable.png", 512, true],
  ["apple-icon.png", 180, false],
];

for (const [name, size, maskable] of targets) {
  writeFileSync(join(OUT, name), png(size, maskable));
  console.log("escrito", name, size);
}
