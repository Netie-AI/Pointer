"use strict";
/**
 * Windows .cur / .ani writer + the three Netie pointer faces.
 *
 * We emit REAL cursor files rather than drawing an overlay window, because an
 * overlay cannot replace the system arrow — you would see both. Swapping the
 * actual pointer is the whole identity of Netie Clicks.
 *
 * .cur is the ICO container with type=2 and a hotspot in place of the colour
 * planes: ICONDIR, one ICONDIRENTRY, then a BITMAPINFOHEADER whose height is
 * doubled to cover the XOR (colour) and AND (transparency) masks.
 */

const SIZE = 32;

/** RGBA canvas helper — small enough that a flat array beats a dependency. */
class Canvas {
  constructor(size = SIZE) {
    this.size = size;
    this.px = new Uint8Array(size * size * 4); // RGBA, top-down
  }

  set(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size || a === 0) return;
    const i = (y * this.size + x) * 4;
    if (a === 255) {
      this.px[i] = r; this.px[i + 1] = g; this.px[i + 2] = b; this.px[i + 3] = 255;
      return;
    }
    // Source-over so soft edges layer correctly.
    const sa = a / 255;
    const da = this.px[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) return;
    this.px[i] = Math.round((r * sa + this.px[i] * da * (1 - sa)) / oa);
    this.px[i + 1] = Math.round((g * sa + this.px[i + 1] * da * (1 - sa)) / oa);
    this.px[i + 2] = Math.round((b * sa + this.px[i + 2] * da * (1 - sa)) / oa);
    this.px[i + 3] = Math.round(oa * 255);
  }

  /** Anti-aliased disc. */
  disc(cx, cy, r, [cr, cg, cb], a = 255) {
    const r0 = r - 0.7;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r + 0.7) continue;
        const cov = d <= r0 ? 1 : Math.max(0, (r + 0.7 - d) / 1.4);
        this.set(x, y, cr, cg, cb, Math.round(a * cov));
      }
    }
  }

  /** Round-capped line, used for every stroke so the art keeps one language. */
  stroke(x0, y0, x1, y1, w, colour, a = 255) {
    const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, colour, a);
    }
  }

  /** Quadratic bezier — smiles and arcs. */
  curve(x0, y0, cx, cy, x1, y1, w, colour, a = 255) {
    let px = x0;
    let py = y0;
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      const mt = 1 - t;
      const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
      const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
      this.stroke(px, py, x, y, w, colour, a);
      px = x;
      py = y;
    }
  }
}

const INK = [22, 26, 38];
const WHITE = [255, 255, 255];

/**
 * Open grin: an ink mouth with WHITE teeth. Drawing the teeth in ink (as the
 * first pass did) painted dark-on-dark and they simply vanished.
 */
function fillGrin(c, cx, cy, grin) {
  const left = cx - 7.5;
  const right = cx + 7.5;
  const top = cy + 1.5;
  const depth = 10 * grin;
  // Mouth body: stack shrinking horizontal strokes to fill the arc.
  for (let t = 0; t <= 1; t += 0.06) {
    const w = (right - left) * (1 - t * t) * 0.5;
    c.stroke(cx - w, top + t * depth, cx + w, top + t * depth, 2.2, INK);
  }
  // Teeth hang from the upper lip, clipped to the mouth width.
  for (let i = 0; i < 4; i++) {
    const x = cx - 5.1 + i * 3.4;
    const len = (2.6 - Math.abs(i - 1.5) * 0.5) * grin;
    c.stroke(x, top + 0.9, x, top + 0.9 + len, 1.9, WHITE, 240);
  }
  c.stroke(left, top, right, top, 2.2, INK); // upper lip last, keeps the line crisp
}

/** Classic arrow, drawn as a filled polygon with a light outline for contrast. */
function arrow(c, colour = WHITE, edge = INK) {
  const pts = [
    [2, 1], [2, 20], [7, 15.5], [10.5, 23.5], [14, 22], [10.6, 14.4], [17, 14],
  ];
  // Scanline fill
  for (let y = 0; y < c.size; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if (ay === by) continue;
      if (y + 0.5 >= Math.min(ay, by) && y + 0.5 < Math.max(ay, by)) {
        xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x < xs[k + 1]; x++) c.set(x, y, ...colour, 255);
    }
  }
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    c.stroke(ax, ay, bx, by, 1.5, edge, 235);
  }
}

/** state: 'normal' | 'click' | 'agent' */
function drawFace(state) {
  const c = new Canvas(SIZE);

  if (state === "normal") {
    // Pointer plus a small closed smile — present, not shouting.
    arrow(c);
    c.curve(19, 20, 22.5, 24.5, 26, 20, 2, [120, 170, 255]);
    return { canvas: c, hotspot: [2, 1] };
  }

  if (state === "click") {
    // Arrow + an upward tick and ring: something is being pressed.
    arrow(c);
    const g = [130, 200, 255];
    c.stroke(23, 14, 23, 5, 2, g);
    c.stroke(23, 4.5, 19.5, 8.5, 2, g);
    c.stroke(23, 4.5, 26.5, 8.5, 2, g);
    c.disc(23, 22, 4.2, g, 255);
    c.disc(23, 22, 2.4, [15, 20, 32], 255);
    return { canvas: c, hotspot: [2, 1] };
  }

  // Agent: the wild grin. This is the "I am driving" face, so it fills the box.
  const cx = 16;
  const cy = 16;
  c.disc(cx, cy, 13.5, [255, 214, 110], 255);
  c.disc(cx, cy, 13.5, [255, 150, 90], 60);
  // ^ ^ eyes
  c.stroke(8.5, 13, 11, 9.5, 2.4, INK);
  c.stroke(11, 9.5, 13.5, 13, 2.4, INK);
  c.stroke(18.5, 13, 21, 9.5, 2.4, INK);
  c.stroke(21, 9.5, 23.5, 13, 2.4, INK);
  // Open grin with teeth
  fillGrin(c, 16, 16, 1);
  return { canvas: c, hotspot: [16, 16] };
}

/** Pack an RGBA canvas + hotspot into a .cur buffer. */
function encodeCur(canvas, hotspot) {
  const n = canvas.size;
  const rowXor = n * 4;
  const rowAnd = Math.ceil(n / 32) * 4; // 1bpp rows pad to 4 bytes
  const xor = Buffer.alloc(rowXor * n);
  const and = Buffer.alloc(rowAnd * n);

  for (let y = 0; y < n; y++) {
    const src = n - 1 - y; // DIB rows run bottom-up
    for (let x = 0; x < n; x++) {
      const i = (src * n + x) * 4;
      const o = y * rowXor + x * 4;
      xor[o] = canvas.px[i + 2]; // B
      xor[o + 1] = canvas.px[i + 1]; // G
      xor[o + 2] = canvas.px[i]; // R
      xor[o + 3] = canvas.px[i + 3]; // A
      // AND mask: 1 = transparent. 32bpp cursors use alpha, but Windows still
      // falls back to this mask in some contexts, so keep it honest.
      if (canvas.px[i + 3] < 128) and[y * rowAnd + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }

  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(n, 4);
  header.writeInt32LE(n * 2, 8); // XOR + AND
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16); // BI_RGB
  header.writeUInt32LE(xor.length + and.length, 20);

  const image = Buffer.concat([header, xor, and]);
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(2, 2); // 2 = cursor
  dir.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = n === 256 ? 0 : n;
  entry[1] = n === 256 ? 0 : n;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(hotspot[0], 4);
  entry.writeUInt16LE(hotspot[1], 6);
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([dir, entry, image]);
}

/**
 * .ani wrapper so the agent face can breathe while it works. RIFF ACON with an
 * anih header, a rate chunk and a LIST of .cur frames.
 */
function encodeAni(frames, jiffiesPerFrame = 8) {
  const chunk = (id, body) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, 4, "ascii");
    head.writeUInt32LE(body.length, 4);
    return body.length % 2 ? Buffer.concat([head, body, Buffer.alloc(1)]) : Buffer.concat([head, body]);
  };

  const anih = Buffer.alloc(36);
  anih.writeUInt32LE(36, 0); // cbSize
  anih.writeUInt32LE(frames.length, 4); // cFrames
  anih.writeUInt32LE(frames.length, 8); // cSteps
  anih.writeUInt32LE(0, 12); // cx
  anih.writeUInt32LE(0, 16); // cy
  anih.writeUInt32LE(0, 20); // cBitCount
  anih.writeUInt32LE(0, 24); // cPlanes
  anih.writeUInt32LE(jiffiesPerFrame, 28); // default rate
  anih.writeUInt32LE(0x01, 32); // AF_ICON — frames are .cur, not raw DIBs

  const rate = Buffer.alloc(frames.length * 4);
  frames.forEach((_f, i) => rate.writeUInt32LE(jiffiesPerFrame, i * 4));

  const listBody = Buffer.concat([
    Buffer.from("fram", "ascii"),
    ...frames.map((f) => chunk("icon", f)),
  ]);

  const body = Buffer.concat([
    Buffer.from("ACON", "ascii"),
    chunk("anih", anih),
    chunk("rate", rate),
    chunk("LIST", listBody),
  ]);
  return chunk("RIFF", body);
}

/** Agent face frames: a gentle bob + grin widen, so it reads as "working". */
function agentFrames(count = 8) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const phase = (i / count) * Math.PI * 2;
    const c = new Canvas(SIZE);
    const cy = 16 + Math.sin(phase) * 1.1;
    const grin = 1 + Math.sin(phase) * 0.14;
    c.disc(16, cy, 13.5, [255, 214, 110], 255);
    c.disc(16, cy, 13.5, [255, 150, 90], 60);
    c.stroke(8.5, cy - 3, 11, cy - 6.5, 2.4, INK);
    c.stroke(11, cy - 6.5, 13.5, cy - 3, 2.4, INK);
    c.stroke(18.5, cy - 3, 21, cy - 6.5, 2.4, INK);
    c.stroke(21, cy - 6.5, 23.5, cy - 3, 2.4, INK);
    fillGrin(c, 16, cy, grin);
    out.push(encodeCur(c, [16, 16]));
  }
  return out;
}

function buildAll() {
  const normal = drawFace("normal");
  const click = drawFace("click");
  const agent = drawFace("agent");
  return {
    "netie-normal.cur": encodeCur(normal.canvas, normal.hotspot),
    "netie-click.cur": encodeCur(click.canvas, click.hotspot),
    "netie-agent.cur": encodeCur(agent.canvas, agent.hotspot),
    "netie-agent.ani": encodeAni(agentFrames()),
  };
}

module.exports = { Canvas, drawFace, encodeCur, encodeAni, agentFrames, buildAll, SIZE };
