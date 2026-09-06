"use strict";
/**
 * Safe-first slides coworker - write a real .pptx without stealing focus.
 *
 * Same shape as word-coworker.js and for the same reasons: pure OOXML zip, no
 * PowerPoint COM, no UI automation, no clicking. A deck built this way cannot
 * type into whatever the customer had focused, cannot be derailed by a dialog,
 * and produces the identical file whether or not Office is installed.
 *
 * The zip writer is word-coworker's `zipStore`, imported rather than copied. A
 * second implementation of the same container format is how two files drift
 * until one of them writes archives Office refuses to open (R-0004).
 *
 * What PowerPoint demands that Word does not: a .docx opens with a document
 * part and little else, but a .pptx is refused unless the presentation, its
 * slide master, a layout and a theme are all present and correctly related.
 * That is why this file is mostly parts and relationships rather than content -
 * the minimum that actually opens is larger here.
 */
const fs = require("fs");
const path = require("path");
const {
  zipStore,
  stripXmlForbidden,
  xmlEscape,
  sanctionedRoot,
  isTestProcess,
} = require("./word-coworker");

/** EMU per inch. OOXML measures layout in English Metric Units. */
const EMU_IN = 914400;
/** 13.333 x 7.5 inches - 16:9, the default a modern deck is expected in. */
const SLIDE_W = Math.round(13.333 * EMU_IN);
const SLIDE_H = 7.5 * EMU_IN;

/** Bullets past this are dropped from the slide rather than overflowing it. */
const MAX_BULLETS = 12;

/**
 * A deck the customer would recognise as empty.
 *
 * Mirrors word-coworker's emptiness check, and exists for the same reason: a
 * file that opens to nothing is worse than a refusal, because the refusal can
 * be read and acted on while the empty deck looks like success.
 */
function visibleDeckText(deck) {
  if (!Array.isArray(deck)) return "";
  return deck
    .map((s) => `${(s && s.title) || ""} ${((s && s.bullets) || []).join(" ")}`)
    .join(" ")
    .replace(/\s+/g, "");
}

/**
 * Normalise whatever the caller passed into slides this module can render.
 *
 * Returns problems rather than throwing: a deck assembled from files will have
 * ragged entries, and the useful answer names which slide was wrong instead of
 * failing the whole run on the first one.
 */
function reviewDeck(deck) {
  const problems = [];
  if (!Array.isArray(deck) || deck.length === 0) {
    return { ok: false, problems: ["a deck must be a non-empty array of slides"], slides: [] };
  }
  const slides = deck.map((raw, i) => {
    const where = `slide ${i + 1}`;
    const slide = raw && typeof raw === "object" ? raw : {};
    const title = typeof slide.title === "string" ? slide.title.trim() : "";
    if (!title) problems.push(`${where}: no title`);
    let bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
    bullets = bullets.filter((b) => typeof b === "string" && b.trim()).map((b) => b.trim());
    if (bullets.length > MAX_BULLETS) {
      // Say it rather than silently truncating: a slide quietly missing its
      // last four points is the kind of thing nobody notices until the meeting.
      problems.push(`${where}: ${bullets.length} bullets, keeping the first ${MAX_BULLETS}`);
      bullets = bullets.slice(0, MAX_BULLETS);
    }
    return { title, bullets, notes: typeof slide.notes === "string" ? slide.notes : "" };
  });
  const fatal = problems.filter((p) => /no title/.test(p));
  return { ok: fatal.length === 0, problems, slides };
}

/** A text run, with the characters XML 1.0 forbids removed before escaping. */
function run(text, sizeHundredths, bold) {
  const clean = xmlEscape(stripXmlForbidden(String(text == null ? "" : text)));
  return (
    `<a:r><a:rPr lang="en-US" sz="${sizeHundredths}"${bold ? ' b="1"' : ""} dirty="0"/>` +
    `<a:t>${clean}</a:t></a:r>`
  );
}

function shape(id, name, x, y, cx, cy, paragraphsXml) {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/>` +
    `</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphsXml}</p:txBody></p:sp>`
  );
}

function slideXml(slide) {
  const margin = Math.round(0.7 * EMU_IN);
  const titleH = Math.round(1.2 * EMU_IN);
  const title =
    `<a:p><a:pPr algn="l"/>${run(slide.title, 3600, true)}</a:p>`;
  const body = slide.bullets.length
    ? slide.bullets
        .map((b) => `<a:p><a:pPr lvl="0"><a:buChar char="&#8226;"/></a:pPr>${run(b, 2000, false)}</a:p>`)
        .join("")
    : `<a:p><a:endParaRPr lang="en-US"/></a:p>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>` +
    `<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    shape(2, "Title", margin, margin, SLIDE_W - 2 * margin, titleH, title) +
    shape(3, "Content", margin, margin + titleH, SLIDE_W - 2 * margin, SLIDE_H - 2 * margin - titleH, body) +
    `</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" ` +
    `accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" ` +
    `accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`
  );
}

/** The colour/font scheme every slide inherits. Minimal, but must be present. */
function themeXml() {
  const dk = (n, v) => `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Pointer">` +
    `<a:themeElements><a:clrScheme name="Pointer">` +
    `<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>` +
    `<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>` +
    dk("dk2", "1F3864") + dk("lt2", "EEF2F8") +
    dk("accent1", "2E6F5E") + dk("accent2", "3D8F78") + dk("accent3", "5B87D8") +
    dk("accent4", "B45309") + dk("accent5", "6D3F6A") + dk("accent6", "0B7354") +
    dk("hlink", "0563C1") + dk("folHlink", "954F72") +
    `</a:clrScheme>` +
    `<a:fontScheme name="Pointer"><a:majorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/>` +
    `<a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/>` +
    `<a:cs typeface=""/></a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="Pointer">` +
    `<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
    `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
    `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>` +
    `<a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>` +
    `<a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>` +
    `<a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>` +
    `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle>` +
    `<a:effectStyle><a:effectLst/></a:effectStyle>` +
    `<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
    `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
    `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
    `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>` +
    `</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
  );
}

function emptyTree(tag, extra = "") {
  return (
    `<p:cSld${extra}><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>` +
    `<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `</p:spTree></p:cSld>`
  );
}

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

/**
 * Every part of the package, with its relationships.
 *
 * Kept as one function so the parts and the .rels that point at them are
 * written in the same place. Splitting them is how a package ends up with a
 * relationship to a part that is not in the archive, which PowerPoint reports
 * only as "needs repair".
 */
function pptxParts(slides) {
  const files = [];
  const n = slides.length;

  files.push({
    name: "[Content_Types].xml",
    data:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
      `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
      `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
      `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
      slides
        .map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
        .join("") +
      `</Types>`,
  });

  files.push({
    name: "_rels/.rels",
    data:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>` +
      `</Relationships>`,
  });

  // Slide ids must start at 256: PowerPoint rejects the file outright below it.
  files.push({
    name: "ppt/presentation.xml",
    data:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<p:presentation ${NS} saveSubsetFonts="1">` +
      `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
      `<p:sldIdLst>` +
      slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("") +
      `</p:sldIdLst>` +
      `<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="${SLIDE_H}" cy="${SLIDE_W}"/>` +
      `</p:presentation>`,
  });

  files.push({
    name: "ppt/_rels/presentation.xml.rels",
    data:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
      slides
        .map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`)
        .join("") +
      `<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>` +
      `</Relationships>`,
  });

  files.push({
    name: "ppt/slideMasters/slideMaster1.xml",
    data:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<p:sldMaster ${NS}>` +
      emptyTree() +
      `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" ` +
      `accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
      `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
      `</p:sldMaster>`,
  });

  files.push({
    name: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    data:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>` +
      `</Relationships>`,
  });

  files.push({
    name: "ppt/slideLayouts/slideLayout1.xml",
    data:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<p:sldLayout ${NS} type="blank" preserve="1">` +
      emptyTree() +
      `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>` +
      `</p:sldLayout>`,
  });

  files.push({
    name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    data:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
      `</Relationships>`,
  });

  files.push({ name: "ppt/theme/theme1.xml", data: themeXml() });

  slides.forEach((slide, i) => {
    files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: slideXml(slide) });
    files.push({
      name: `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
        `</Relationships>`,
    });
  });

  return files;
}

/** Build a .pptx in memory. Never writes disk, never Acts. */
function buildPptx(deck) {
  const review = reviewDeck(deck);
  if (!review.ok) return { ok: false, reason: review.problems.join("; "), problems: review.problems };
  const buffer = zipStore(pptxParts(review.slides));
  return {
    ok: true,
    buffer,
    bytes: buffer.length,
    slides: review.slides.length,
    problems: review.problems,
  };
}

function defaultPptxPath(stem, stamp) {
  // No mkdir: a dry run asks "where would this go", and answering must not
  // leave a directory behind. Same rule as word-coworker's defaultDocxPath.
  return path.join(sanctionedRoot(), `${stem || "pointer"}-${stamp}.pptx`);
}

/**
 * Write a deck to a contained path.
 *
 * Containment is not optional here for the same reason it is not in
 * word-coworker: a test that writes into the customer's real documents folder
 * has already done the damage by the time anyone reads the assertion.
 */
function writePptx(opts = {}) {
  const built = buildPptx(opts.deck);
  if (!built.ok) return { ok: false, reason: built.reason, bytes: 0, problems: built.problems };

  const stamp = typeof opts.stamp === "string" ? opts.stamp : String(opts.stamp || "deck");
  const outPath = opts.path || defaultPptxPath(opts.stem, stamp);

  if (!process.env.NETIE_WORD_OUT_DIR && isTestProcess() && !opts.path) {
    return {
      ok: false,
      reason:
        "test write refused: NETIE_WORD_OUT_DIR unset - will not write fixtures into the customer documents folder",
      path: outPath,
      bytes: 0,
    };
  }

  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, built.buffer);
  } catch (err) {
    return { ok: false, reason: String((err && err.message) || err), path: outPath, bytes: 0 };
  }
  return {
    ok: true,
    path: outPath,
    bytes: built.bytes,
    slides: built.slides,
    problems: built.problems,
  };
}

module.exports = {
  buildPptx,
  writePptx,
  reviewDeck,
  pptxParts,
  slideXml,
  visibleDeckText,
  defaultPptxPath,
  SLIDE_W,
  SLIDE_H,
  MAX_BULLETS,
};
