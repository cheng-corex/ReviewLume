/**
 * Generate a simple 48×48 PNG icon for the ReviewLume Activity Bar.
 * Uses only Node.js built-in modules — no external dependencies.
 *
 * Run: node scripts/generate-icon.js
 * Output: resources/icon.png
 */
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

/* ---- CRC-32 (IEEE) ---- */
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, t, data, crc]);
}

/* ---- Simple icon pixels ---- */
const W = 48, H = 48;
const raw = Buffer.alloc(H * (1 + W * 4));

for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0; // filter: None
  for (let x = 0; x < W; x++) {
    const o = y * (1 + W * 4) + 1 + x * 4;
    const cx = x - W / 2, cy = y - H / 2;
    const dist = Math.sqrt(cx * cx + cy * cy);
    const inCircle = dist < 22;

    if (inCircle) {
      // Blue gradient (approximated)
      const t = dist / 22;
      raw[o] = Math.round(45 + t * (108 - 45));       // R
      raw[o + 1] = Math.round(123 + t * (92 - 123));   // G
      raw[o + 2] = Math.round(212 + t * (231 - 212));  // B
      raw[o + 3] = 255;
    } else {
      // Transparent
      raw[o] = 0; raw[o + 1] = 0; raw[o + 2] = 0; raw[o + 3] = 0;
    }

    // Draw a simple "R" letter shape
    if (inCircle) {
      const lx = x - 24, ly = y - 24;
      // Vertical bar of R
      if (lx >= -6 && lx <= -2 && ly >= -12 && ly <= 12) {
        raw[o] = 255; raw[o + 1] = 255; raw[o + 2] = 255; // white
      }
      // Top arc of R
      if (lx >= -2 && lx <= 6 && ly >= -12 && ly <= -8) {
        raw[o] = 255; raw[o + 1] = 255; raw[o + 2] = 255;
      }
      // Right arc of R (upper half)
      if (lx >= 6 && lx <= 10 && ly >= -12 && ly <= 0) {
        raw[o] = 255; raw[o + 1] = 255; raw[o + 2] = 255;
      }
      // Bottom of upper loop
      if (lx >= -2 && lx <= 6 && ly >= 0 && ly <= 4) {
        raw[o] = 255; raw[o + 1] = 255; raw[o + 2] = 255;
      }
      // Diagonal leg of R
      if (lx >= 0 && ly >= 4 && lx <= 8 && ly <= 12 && (ly - 4) >= (lx * 8 / 8)) {
        raw[o] = 255; raw[o + 1] = 255; raw[o + 2] = 255;
      }
    }
  }
}

/* ---- Build PNG ---- */
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const compressed = zlib.deflateSync(raw);
const png = Buffer.concat([
  sig,
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', compressed),
  pngChunk('IEND', Buffer.alloc(0)),
]);

const outPath = path.resolve(__dirname, '..', 'resources', 'icon.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, png);
console.log(`Icon generated: ${outPath} (${png.length} bytes)`);
