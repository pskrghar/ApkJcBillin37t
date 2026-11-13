import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const androidResDir = path.resolve('android', 'app', 'src', 'main', 'res');

if (!fs.existsSync(androidResDir)) {
  console.warn('Android res directory not found yet. Run "npx cap add android" first.');
  process.exit(0);
}

function crc32(buf) {
  let c;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }

  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crcPayload = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  chunk.writeUInt32BE(crc32(crcPayload), 8 + len);
  return chunk;
}

function createPng(width, height, drawFn) {
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

  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(height * scanlineLength);
  for (let y = 0; y < height; y++) {
    rawData[y * scanlineLength] = 0;
    rgba.copy(rawData, y * scanlineLength + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawEmblemPixel(nx, ny, scale, transparentBg = false, roundMask = false) {
  if (roundMask) {
    const dx = nx - 0.5;
    const dy = ny - 0.5;
    if (dx * dx + dy * dy > 0.24) {
      return [0, 0, 0, 0];
    }
  } else if (!transparentBg) {
    // Soft rounded square for legacy ic_launcher
    const rx = Math.min(nx, 1 - nx);
    const ry = Math.min(ny, 1 - ny);
    const r = 0.22;
    if (rx < r && ry < r) {
      const dx = r - rx;
      const dy = r - ry;
      if (dx * dx + dy * dy > r * r) {
        return [0, 0, 0, 0];
      }
    }
  }

  const t = (nx + ny) / 2;
  const bgR = Math.round(30 + t * 40);
  const bgG = Math.round(27 + t * 50);
  const bgB = Math.round(75 + t * 145);

  const cx = nx - 0.5;
  const cy = ny - 0.5;
  const docHalfW = 0.22 * scale;
  const docHalfH = 0.28 * scale;

  if (Math.abs(cx) < docHalfW && Math.abs(cy) < docHalfH) {
    const beamY = -0.05 * scale;
    const beamDist = Math.abs(cy - beamY);
    if (beamDist < 0.015 * scale) {
      return [16, 185, 129, 255];
    } else if (beamDist < 0.04 * scale) {
      const alpha = 1 - beamDist / (0.04 * scale);
      return [
        Math.round(248 * (1 - alpha * 0.4) + 16 * (alpha * 0.4)),
        Math.round(250 * (1 - alpha * 0.4) + 185 * (alpha * 0.4)),
        Math.round(252 * (1 - alpha * 0.4) + 129 * (alpha * 0.4)),
        255,
      ];
    }
    if (cy > -0.22 * scale && cy < -0.16 * scale && Math.abs(cx) < 0.16 * scale) {
      return [79, 70, 229, 255];
    }
    if (cy > -0.11 * scale && cy < -0.09 * scale && Math.abs(cx) < 0.16 * scale) {
      return [148, 163, 184, 255];
    }
    if (cy > 0.03 * scale && cy < 0.05 * scale && Math.abs(cx) < 0.16 * scale) {
      return [148, 163, 184, 255];
    }
    if (cy > 0.09 * scale && cy < 0.11 * scale && Math.abs(cx) < 0.16 * scale) {
      return [148, 163, 184, 255];
    }
    if (cy > 0.16 * scale && cy < 0.22 * scale && Math.abs(cx) < 0.16 * scale) {
      return [99, 102, 241, 255];
    }
    return [248, 250, 252, 255];
  }

  const bracketW = 0.32 * scale;
  const bracketH = 0.38 * scale;
  const arm = 0.07 * scale;
  const thick = 0.02 * scale;
  const inBracketX = Math.abs(cx) > bracketW - thick && Math.abs(cx) < bracketW && Math.abs(cy) < bracketH;
  const inBracketY = Math.abs(cy) > bracketH - thick && Math.abs(cy) < bracketH && Math.abs(cx) < bracketW;
  const nearCorner = (Math.abs(cx) > bracketW - arm && inBracketY) || (Math.abs(cy) > bracketH - arm && inBracketX);

  if (nearCorner) {
    return [52, 211, 153, 255];
  }

  return transparentBg ? [0, 0, 0, 0] : [bgR, bgG, bgB, 255];
}

function drawSplashPixel(x, y, w, h) {
  const minDim = Math.min(w, h);
  const iconSize = minDim * 0.34;
  const left = (w - iconSize) / 2;
  const top = (h - iconSize) / 2;

  const ny = y / h;
  const bgR = Math.round(9 + ny * 18);
  const bgG = Math.round(13 + ny * 16);
  const bgB = Math.round(22 + ny * 48);

  if (x >= left && x < left + iconSize && y >= top && y < top + iconSize) {
    const nx = (x - left) / iconSize;
    const niy = (y - top) / iconSize;
    const pixel = drawEmblemPixel(nx, niy, 0.78, false, false);
    if (pixel[3] > 0) return pixel;
  }

  return [bgR, bgG, bgB, 255];
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

console.log('Generating Android launcher icons & splash screens...');

const mipmaps = [
  { folder: 'mipmap-mdpi', size: 48, fgSize: 108 },
  { folder: 'mipmap-hdpi', size: 72, fgSize: 162 },
  { folder: 'mipmap-xhdpi', size: 96, fgSize: 216 },
  { folder: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
  { folder: 'mipmap-xxxhdpi', size: 192, fgSize: 432 },
];

for (const m of mipmaps) {
  const dir = path.join(androidResDir, m.folder);
  ensureDir(dir);

  const launcher = createPng(m.size, m.size, (x, y, w, h) =>
    drawEmblemPixel(x / w, y / h, 0.78, false, false)
  );
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), launcher);

  const launcherRound = createPng(m.size, m.size, (x, y, w, h) =>
    drawEmblemPixel(x / w, y / h, 0.72, false, true)
  );
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), launcherRound);

  const fg = createPng(m.fgSize, m.fgSize, (x, y, w, h) =>
    drawEmblemPixel(x / w, y / h, 0.56, true, false)
  );
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fg);
}

// Adaptive Icon XMLs (Android 8+)
const anydpiDir = path.join(androidResDir, 'mipmap-anydpi-v26');
ensureDir(anydpiDir);
const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
fs.writeFileSync(path.join(anydpiDir, 'ic_launcher.xml'), adaptiveIconXml);
fs.writeFileSync(path.join(anydpiDir, 'ic_launcher_round.xml'), adaptiveIconXml);

// Adaptive Icon Background color
const valuesDir = path.join(androidResDir, 'values');
ensureDir(valuesDir);
fs.writeFileSync(
  path.join(valuesDir, 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#1e1b4b</color>
</resources>
`
);

// Branded Splash Screens
const splashes = [
  { folder: 'drawable', w: 480, h: 800 },
  { folder: 'drawable-port-mdpi', w: 320, h: 480 },
  { folder: 'drawable-port-hdpi', w: 480, h: 800 },
  { folder: 'drawable-port-xhdpi', w: 720, h: 1280 },
  { folder: 'drawable-port-xxhdpi', w: 960, h: 1600 },
  { folder: 'drawable-land-mdpi', w: 480, h: 320 },
  { folder: 'drawable-land-hdpi', w: 800, h: 480 },
  { folder: 'drawable-land-xhdpi', w: 1280, h: 720 },
];

for (const s of splashes) {
  const dir = path.join(androidResDir, s.folder);
  ensureDir(dir);
  const png = createPng(s.w, s.h, drawSplashPixel);
  fs.writeFileSync(path.join(dir, 'splash.png'), png);
}

console.log('Android launcher icons and splash screens generated successfully!');
