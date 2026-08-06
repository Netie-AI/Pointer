"use strict";
/**
 * Safe-first Word coworker — write .docx without stealing focus (EPIC-P03).
 * Pure OOXML zip; no Word COM / UI. Optional open via driver `open` after write.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { containPath } = require("./safe-path");

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphsXml(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  if (!lines.length) lines.push("");
  return lines
    .map(
      (line) =>
        `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`
    )
    .join("");
}

/** Minimal store+deflate ZIP (local file headers + central directory). */
function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8");
    const compressed = zlib.deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    locals.push(local, compressed);
    centrals.push(central);
    offset += local.length + compressed.length;
  }
  const centralBlob = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBlob.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBlob, end]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c;
}

/**
 * The one directory this module may write into. Read at call time, not at
 * module load, so a test (or a settings change) can move it without having to
 * re-require the module.
 */
function sanctionedRoot() {
  return process.env.NETIE_WORD_OUT_DIR || path.join(os.homedir(), "Documents", "NetiePointer");
}

function defaultDocxPath(stem) {
  // No mkdir here — a dry run asks "where would this go", and answering that
  // question must not leave a directory behind (#14).
  const name = `${stem || "pointer"}-${Date.now()}.docx`;
  return path.join(sanctionedRoot(), name);
}

/**
 * @param {{ text: string, path?: string, dryRun?: boolean, stem?: string }} opts
 * @returns {{ ok: boolean, path: string, bytes: number, dryRun?: boolean, sha256?: string }
 *          |{ ok: false, reason: string, path: string }}
 */
function writeDocx(opts = {}) {
  const text = String(opts.text ?? "");
  const outPath = opts.path || defaultDocxPath(opts.stem);

  // Containment lives here rather than in driver.js so every path into the
  // module is covered — the driver is one caller, not the boundary (KB R-0004).
  // A model-supplied `path` is data from outside the trust boundary; without
  // this it was a write-anywhere primitive (#15).
  const contained = containPath(outPath, [sanctionedRoot()]);
  if (!contained.ok) {
    // Structured refusal, not a throw, so the driver can surface the reason to
    // the customer instead of turning it into a generic step failure.
    return { ok: false, reason: contained.reason, path: outPath, bytes: 0 };
  }
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${paragraphsXml(text)}<w:sectPr/></w:body></w:document>`;
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;
  const rels =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;
  const docRels =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  const buf = zipStore([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rels },
    { name: "word/document.xml", data: documentXml },
    { name: "word/_rels/document.xml.rels", data: docRels },
  ]);
  if (opts.dryRun) {
    return { ok: true, path: outPath, bytes: buf.length, dryRun: true };
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  return {
    ok: true,
    path: outPath,
    bytes: buf.length,
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
  };
}

/**
 * Clipboard integrity: source vs clipboard must match (normalize newlines).
 * @returns {{ ok: boolean, reason?: string, sourceLen: number, clipLen: number }}
 */
function clipboardMatchesSource(source, clip) {
  const norm = (s) => String(s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const a = norm(source);
  const b = norm(clip);
  if (!a.length) return { ok: false, reason: "empty source", sourceLen: 0, clipLen: b.length };
  if (a === b) return { ok: true, sourceLen: a.length, clipLen: b.length };
  if (b.length < Math.max(8, Math.floor(a.length * 0.9))) {
    return { ok: false, reason: "clipboard shorter than source (partial copy?)", sourceLen: a.length, clipLen: b.length };
  }
  if (!b.includes(a.slice(0, Math.min(64, a.length))) && !a.includes(b.slice(0, Math.min(64, b.length)))) {
    return { ok: false, reason: "clipboard does not match source", sourceLen: a.length, clipLen: b.length };
  }
  // Length close enough and prefix overlap — accept (apps sometimes add trailing newline)
  if (Math.abs(a.length - b.length) <= 2) return { ok: true, sourceLen: a.length, clipLen: b.length };
  return { ok: false, reason: "clipboard mismatch", sourceLen: a.length, clipLen: b.length };
}

module.exports = {
  writeDocx,
  clipboardMatchesSource,
  defaultDocxPath,
  paragraphsXml,
  sanctionedRoot,
};
