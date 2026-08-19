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

/**
 * Remove the characters XML 1.0 forbids outright (#14).
 *
 * Escaping `& < > "` is not enough. XML 1.0 section 2.2 permits only
 *   #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
 * and there is no escape that smuggles a forbidden one back in - `&#x1B;` is
 * exactly as illegal as a raw 0x1B - so they have to be dropped, not encoded.
 *
 * Not hypothetical: the `terminal_to_word` recipe feeds this module terminal
 * output via `word_from_clipboard`, terminal output carries ANSI escape
 * sequences, and their 0x1B introducer made Word refuse to open the document
 * while `writeDocx` still returned ok: true.
 *
 * ONLY the forbidden characters are removed. The visible remainder of an ANSI
 * sequence ("[32m") is legal text and is preserved, so the document round-trips
 * to the input rather than to something this module decided looked tidier.
 */
function stripXmlForbidden(s) {
  return String(s ?? "")
    // C0 controls except tab, LF and CR.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    // Lone surrogates - neither half can be encoded as well-formed UTF-8.
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    // Permanently unassigned noncharacters.
    .replace(/[\uFFFE\uFFFF]/g, "");
}

function xmlEscape(s) {
  return stripXmlForbidden(s)
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
 * Read a ZIP package into an ordered list of entries (#17).
 *
 * The central directory is the authority here, not the local file headers. Word
 * writes packages with general-purpose bit 3 set, which leaves zeroes in the
 * local header's CRC and size fields and moves the real values into a data
 * descriptor after the payload - a reader that trusts local headers gets
 * nothing. The central directory is also the only place that lists every entry
 * exactly once, which is what makes "preserve the parts we did not author"
 * possible at all.
 *
 * This refuses rather than guesses. An encrypted, ZIP64, or unknown-compression
 * package comes back as a structured refusal, because appending to a package
 * this reader only half-understands would produce a document that looks fine
 * and has quietly lost a part - a silent fallback is a lie (KB R-0011).
 */
function zipRead(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) {
    return { ok: false, reason: "not a .docx package (file is too short to be a zip)" };
  }
  // The end-of-central-directory record is variable length because of its
  // trailing comment, so it is found by scanning back from the end.
  let eocd = -1;
  const floor = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) {
    return { ok: false, reason: "not a .docx package (no end-of-central-directory record)" };
  }

  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    return { ok: false, reason: "ZIP64 package - refusing rather than truncating it" };
  }
  if (cdOffset + cdSize > buf.length) {
    return { ok: false, reason: "central directory runs past the end of the file" };
  }

  const entries = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      return { ok: false, reason: `central directory entry ${n + 1} is malformed` };
    }
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const rawSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    if (flags & 0x0001) {
      return { ok: false, reason: `entry "${name}" is encrypted - refusing` };
    }
    if (method !== 0 && method !== 8) {
      return { ok: false, reason: `entry "${name}" uses unsupported compression method ${method}` };
    }
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) {
      return { ok: false, reason: `entry "${name}" has a broken local header` };
    }
    // The local header carries its OWN name and extra lengths, which are not
    // required to match the central directory's. Read them from the local
    // header or the payload offset lands mid-file.
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    if (start + compSize > buf.length) {
      return { ok: false, reason: `entry "${name}" payload runs past the end of the file` };
    }

    const payload = buf.subarray(start, start + compSize);
    let data;
    try {
      data = method === 0 ? Buffer.from(payload) : zlib.inflateRawSync(payload);
    } catch (err) {
      return { ok: false, reason: `entry "${name}" could not be decompressed: ${err.message}` };
    }
    if (data.length !== rawSize) {
      return { ok: false, reason: `entry "${name}" size mismatch (${data.length} vs ${rawSize} declared)` };
    }
    // Verify the CRC the package declared. Appending to an already-corrupt
    // document would faithfully preserve the corruption and hand it back with
    // ok: true, which is the failure #14 was filed for one layer down.
    if ((crc32(data) >>> 0) !== (crc >>> 0)) {
      return { ok: false, reason: `entry "${name}" failed its CRC check - the document is already damaged` };
    }

    entries.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { ok: true, entries };
}

/**
 * Insert paragraphs at the end of the body, before the section properties.
 *
 * Word treats content after the body-level `<w:sectPr>` as malformed, so the new
 * paragraphs go before it. That sectPr is the LAST CHILD of `<w:body>` - and a
 * sectPr nested inside a paragraph's `<w:pPr>` is a different element entirely.
 * Anchoring on "the last <w:sectPr in the string" would splice paragraphs inside
 * a paragraph's properties whenever the final paragraph carried its own section
 * break, so this only matches a sectPr sitting immediately before `</w:body>`.
 */
function spliceParagraphs(xml, text) {
  const bodyEnd = xml.lastIndexOf("</w:body>");
  if (bodyEnd < 0) {
    return {
      ok: false,
      reason: "word/document.xml has no </w:body> - refusing to append to a document this module cannot read",
    };
  }
  const head = xml.slice(0, bodyEnd);
  const tail = xml.slice(bodyEnd);
  const addition = paragraphsXml(text);

  const m =
    head.match(/<w:sectPr\b[^>]*\/>\s*$/) ||
    head.match(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>\s*$/);
  if (m) {
    return { ok: true, xml: head.slice(0, m.index) + addition + head.slice(m.index) + tail };
  }
  return { ok: true, xml: head + addition + tail };
}

/**
 * Append paragraphs to an existing .docx, preserving every other part (#17).
 *
 * "Preserving" is exact at the level that matters: every part this module did
 * not author is carried through with its CONTENT byte-for-byte identical. The
 * compressed bytes are not reused - the package is rebuilt through `zipStore` -
 * so the file's size on disk may differ while every part's content does not.
 * Stated rather than implied, because "byte-for-byte" about a zip is ambiguous
 * and the honest claim is the narrower one.
 *
 * @param {{ text: string, path?: string, dryRun?: boolean, stem?: string }} opts
 */
function appendDocx(opts = {}) {
  const text = String(opts.text ?? "");
  const outPath = opts.path || defaultDocxPath(opts.stem);

  // Same boundary as writeDocx, applied before the file is even read. Append
  // must not become the write-anywhere primitive that #15 closed.
  const contained = containPath(outPath, [sanctionedRoot()]);
  if (!contained.ok) {
    return { ok: false, reason: contained.reason, path: outPath, bytes: 0 };
  }

  // Appending to something that is not there yet is a create. One code path
  // produces fresh packages, so dry-run and containment behave identically
  // whichever branch the customer lands in.
  if (!fs.existsSync(outPath)) {
    const created = writeDocx({ text, path: outPath, dryRun: opts.dryRun, stem: opts.stem });
    return created.ok ? { ...created, created: true, appended: false } : created;
  }

  let current;
  try {
    current = fs.readFileSync(outPath);
  } catch (err) {
    return { ok: false, reason: `could not read ${outPath}: ${err.message}`, path: outPath, bytes: 0 };
  }

  const pkg = zipRead(current);
  if (!pkg.ok) return { ok: false, reason: pkg.reason, path: outPath, bytes: 0 };

  const docIdx = pkg.entries.findIndex((e) => e.name === "word/document.xml");
  if (docIdx < 0) {
    return {
      ok: false,
      reason: "package has no word/document.xml - refusing to append to a document this module cannot read",
      path: outPath,
      bytes: 0,
    };
  }

  const spliced = spliceParagraphs(pkg.entries[docIdx].data.toString("utf8"), text);
  if (!spliced.ok) return { ok: false, reason: spliced.reason, path: outPath, bytes: 0 };

  const entries = pkg.entries.map((e, i) =>
    i === docIdx ? { name: e.name, data: Buffer.from(spliced.xml, "utf8") } : e
  );
  const buf = zipStore(entries);

  if (opts.dryRun) {
    return { ok: true, path: outPath, bytes: buf.length, dryRun: true, appended: true, parts: entries.length };
  }
  fs.writeFileSync(outPath, buf);
  return {
    ok: true,
    path: outPath,
    bytes: buf.length,
    appended: true,
    parts: entries.length,
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
  appendDocx,
  zipRead,
  clipboardMatchesSource,
  defaultDocxPath,
  paragraphsXml,
  sanctionedRoot,
};
