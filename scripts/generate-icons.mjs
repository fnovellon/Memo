// Génère les icônes PWA sans dépendance externe : un carré arrondi aux couleurs de
// l'app, sur lequel se superposent deux cartes — le geste central du produit.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const ACCENT = [0x5b, 0x5b, 0xd6];
const SUPERSAMPLE = 4;

function roundedRectCoverage(x, y, rect) {
  const { left, top, right, bottom, radius } = rect;
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function blend(target, offset, color, alpha) {
  for (let channel = 0; channel < 3; channel += 1) {
    target[offset + channel] = Math.round(
      target[offset + channel] * (1 - alpha) + color[channel] * alpha,
    );
  }
  target[offset + 3] = Math.round(target[offset + 3] * (1 - alpha) + 255 * alpha);
}

function render(size, { inset = 0 } = {}) {
  const pixels = new Uint8Array(size * size * 4);
  const scale = 1 - inset * 2;
  const place = (rect) => ({
    left: (inset + rect.left * scale) * size,
    top: (inset + rect.top * scale) * size,
    right: (inset + rect.right * scale) * size,
    bottom: (inset + rect.bottom * scale) * size,
    radius: rect.radius * scale * size,
  });

  // Le fond reste plein cadre : sur une icône « maskable » c'est le masque du système
  // qui découpe les angles, et un fond rétréci laisserait des bords transparents.
  const background = {
    left: 0,
    top: 0,
    right: size,
    bottom: size,
    radius: (inset > 0 ? 0 : 0.22) * size,
  };

  const layers = [
    { rect: background, color: ACCENT, alpha: 1 },
    {
      rect: place({ left: 0.24, top: 0.2, right: 0.7, bottom: 0.62, radius: 0.05 }),
      color: [255, 255, 255],
      alpha: 0.45,
    },
    {
      rect: place({ left: 0.3, top: 0.36, right: 0.76, bottom: 0.78, radius: 0.05 }),
      color: [255, 255, 255],
      alpha: 1,
    },
    {
      rect: place({ left: 0.37, top: 0.52, right: 0.69, bottom: 0.56, radius: 0.02 }),
      color: ACCENT,
      alpha: 0.35,
    },
    {
      rect: place({ left: 0.37, top: 0.61, right: 0.6, bottom: 0.65, radius: 0.02 }),
      color: ACCENT,
      alpha: 0.2,
    },
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      for (const layer of layers) {
        let hits = 0;
        for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
          for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
            const px = x + (sx + 0.5) / SUPERSAMPLE;
            const py = y + (sy + 0.5) / SUPERSAMPLE;
            if (roundedRectCoverage(px, py, layer.rect)) hits += 1;
          }
        }
        if (hits === 0) continue;
        blend(pixels, offset, layer.color, (hits / SUPERSAMPLE ** 2) * layer.alpha);
      }
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // profondeur
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filtre « none »
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  { file: 'public/icon-192.png', size: 192, options: {} },
  { file: 'public/icon-512.png', size: 512, options: {} },
  { file: 'public/icon-maskable-512.png', size: 512, options: { inset: 0.12 } },
];

for (const { file, size, options } of targets) {
  writeFileSync(file, encodePng(size, render(size, options)));
  console.log(`écrit ${file}`);
}
