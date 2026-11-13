import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Function to generate a valid PNG buffer using raw pixel data and zlib
function createPng(width, height, drawFn) {
  // RGBA buffer
  const rgba = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }

  // PNG requires a filter byte (0 = None) at the beginning of each scanline
  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    rawData[y * scanlineLength] = 0; // Filter: None
    rgba.copy(rawData, y * scanlineLength + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA (6)
  ihdr[10] = 0; // Compression: Deflate
  ihdr[11] = 0; // Filter: Default
  ihdr[12] = 0; // Interlace: None

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }

  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crcPayload = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcVal = crc32(crcPayload);
  chunk.writeUInt32BE(crcVal, 8 + len);
  return chunk;
}

// Icon design: Indigo/Violet gradient with glowing JC Billing scanner icon
function drawIconPixel(x, y, w, h, isMaskable = false) {
  const nx = x / w; // 0 to 1
  const ny = y / h; // 0 to 1

  // Safe zone for maskable icons (padded ~15%)
  const margin = isMaskable ? 0.0 : 0.08;
  const cornerRadius = isMaskable ? 0 : 0.22;

  // Background Gradient from Deep Navy/Indigo (#1e1b4b) to Electric Violet (#4338ca -> #6366f1)
  const t = (nx + ny) / 2;
  const bgR = Math.round(30 + t * 40); // 30 -> 70
  const bgG = Math.round(27 + t * 50); // 27 -> 77
  const bgB = Math.round(75 + t * 145); // 75 -> 220

  // If not maskable, round corners
  if (!isMaskable) {
    const rx = Math.min(x, w - x);
    const ry = Math.min(y, h - y);
    const rPx = w * cornerRadius;
    if (rx < rPx && ry < rPx) {
      const dx = rPx - rx;
      const dy = rPx - ry;
      if (dx * dx + dy * dy > rPx * rPx) {
        return [0, 0, 0, 0]; // Transparent outside rounded corner
      }
    }
  }

  // Draw central emblem: Document card + Scanner beam + "JC" typography
  // Center is (0.5, 0.5)
  const cx = nx - 0.5;
  const cy = ny - 0.5;
  const scale = isMaskable ? 0.65 : 0.78;

  // Document rectangle: -0.22 to +0.22 x, -0.28 to +0.28 y
  const docHalfW = 0.22 * scale;
  const docHalfH = 0.28 * scale;

  if (Math.abs(cx) < docHalfW && Math.abs(cy) < docHalfH) {
    // Inside document
    // Document background: crisp off-white #f8fafc with subtle gradient
    const docT = (cy + docHalfH) / (docHalfH * 2);

    // Scanner beam across the middle
    const beamY = -0.05 * scale;
    const beamDist = Math.abs(cy - beamY);

    if (beamDist < 0.015 * scale) {
      // Glowing emerald laser scan line
      return [16, 185, 129, 255]; // Emerald-500
    } else if (beamDist < 0.04 * scale) {
      // Laser beam aura
      const alpha = 1 - (beamDist / (0.04 * scale));
      return [
        Math.round(248 * (1 - alpha * 0.4) + 16 * (alpha * 0.4)),
        Math.round(250 * (1 - alpha * 0.4) + 185 * (alpha * 0.4)),
        Math.round(252 * (1 - alpha * 0.4) + 129 * (alpha * 0.4)),
        255
      ];
    }

    // Bill lines on document
    // Line 1: header title bar
    if (cy > -0.22 * scale && cy < -0.16 * scale && Math.abs(cx) < 0.16 * scale) {
      return [79, 70, 229, 255]; // Indigo bar
    }
    // Line 2: invoice rows
    if (cy > -0.11 * scale && cy < -0.09 * scale && Math.abs(cx) < 0.16 * scale) {
      return [148, 163, 184, 255];
    }
    // Line 3: lower rows
    if (cy > 0.03 * scale && cy < 0.05 * scale && Math.abs(cx) < 0.16 * scale) {
      return [148, 163, 184, 255];
    }
    // Line 4: lower rows
    if (cy > 0.09 * scale && cy < 0.11 * scale && Math.abs(cx) < 0.16 * scale) {
      return [148, 163, 184, 255];
    }
    // Total badge at bottom
    if (cy > 0.16 * scale && cy < 0.22 * scale && cx > -0.16 * scale && cx < 0.16 * scale) {
      return [99, 102, 241, 255];
    }

    return [248, 250, 252, 255];
  }

  // Corner targeting brackets for OCR camera scan
  const bracketW = 0.32 * scale;
  const bracketH = 0.38 * scale;
  const arm = 0.07 * scale;
  const thick = 0.02 * scale;

  const inBracketX = Math.abs(cx) > bracketW - thick && Math.abs(cx) < bracketW && Math.abs(cy) < bracketH;
  const inBracketY = Math.abs(cy) > bracketH - thick && Math.abs(cy) < bracketH && Math.abs(cx) < bracketW;

  const nearCorner = (Math.abs(cx) > bracketW - arm && inBracketY) || (Math.abs(cy) > bracketH - arm && inBracketX);

  if (nearCorner) {
    return [52, 211, 153, 255]; // Emerald-400 camera target reticle
  }

  return [bgR, bgG, bgB, 255];
}

console.log('Generating PWA Icons...');

// Generate 192x192
const icon192 = createPng(192, 192, (x, y, w, h) => drawIconPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), icon192);

// Generate 512x512
const icon512 = createPng(512, 512, (x, y, w, h) => drawIconPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), icon512);

// Generate Maskable 512x512 (with safe-zone margins and full background)
const iconMaskable = createPng(512, 512, (x, y, w, h) => drawIconPixel(x, y, w, h, true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), iconMaskable);

// Generate Apple Touch Icon 180x180
const iconApple = createPng(180, 180, (x, y, w, h) => drawIconPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), iconApple);

// Generate favicon (32x32)
const icon32 = createPng(32, 32, (x, y, w, h) => drawIconPixel(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icon32);

// Generate SVG Icon
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b" />
      <stop offset="50%" stop-color="#312e81" />
      <stop offset="100%" stop-color="#4f46e5" />
    </linearGradient>
    <linearGradient id="laser" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#34d399" stop-opacity="0.2" />
      <stop offset="50%" stop-color="#10b981" stop-opacity="1" />
      <stop offset="100%" stop-color="#34d399" stop-opacity="0.2" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)" />
  <!-- Reticles -->
  <path d="M 96 170 L 96 112 A 16 16 0 0 1 112 96 L 170 96" fill="none" stroke="#34d399" stroke-width="16" stroke-linecap="round" />
  <path d="M 416 170 L 416 112 A 16 16 0 0 0 400 96 L 342 96" fill="none" stroke="#34d399" stroke-width="16" stroke-linecap="round" />
  <path d="M 96 342 L 96 400 A 16 16 0 0 0 112 416 L 170 416" fill="none" stroke="#34d399" stroke-width="16" stroke-linecap="round" />
  <path d="M 416 342 L 416 400 A 16 16 0 0 1 400 416 L 342 416" fill="none" stroke="#34d399" stroke-width="16" stroke-linecap="round" />
  <!-- Document -->
  <rect x="144" y="128" width="224" height="256" rx="20" fill="#f8fafc" />
  <rect x="176" y="164" width="160" height="24" rx="8" fill="#4f46e5" />
  <rect x="176" y="210" width="120" height="12" rx="6" fill="#94a3b8" />
  <rect x="176" y="238" width="140" height="12" rx="6" fill="#cbd5e1" />
  <rect x="176" y="280" width="160" height="12" rx="6" fill="#cbd5e1" />
  <rect x="176" y="324" width="160" height="32" rx="10" fill="#6366f1" />
  <!-- Laser Beam -->
  <rect x="120" y="250" width="272" height="8" rx="4" fill="url(#laser)" filter="url(#glow)" />
</svg>`;
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgIcon);

// Web App Manifest
const manifest = {
  id: '/',
  start_url: '/',
  scope: '/',
  name: 'Remix JCBillingV3',
  short_name: 'JCBilling',
  description: 'Smart Billing and Manifest OCR Scanner with offline persistence, camera queue, and multi-device sync.',
  display: 'standalone',
  orientation: 'any',
  theme_color: '#1e1b4b',
  background_color: '#090d16',
  categories: ['business', 'productivity', 'utilities'],
  icons: [
    {
      src: '/pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: '/pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: '/pwa-maskable-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable'
    }
  ]
};

fs.writeFileSync(path.join(publicDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

console.log('PWA assets generated successfully!');
