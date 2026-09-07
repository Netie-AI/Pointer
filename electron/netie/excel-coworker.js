"use strict";
/**
 * Safe-first Excel coworker - write a chart-bearing .xlsx without stealing
 * focus (POINTER-EXCEL-SAFE / #64). Pure OOXML zip; no Excel COM, no
 * Windows-MCP, no ribbon hotkeys. Optional open via driver `open` after write.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { containPath } = require("./safe-path");
const { zipStore, zipRead, customerWordRoot, isTestProcess } = require("./word-coworker");

const MAX_POINTS = 32;
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_OD_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function stripXmlForbidden(s) {
  return String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/[\uFFFE\uFFFF]/g, "");
}

function xmlEscape(s) {
  return stripXmlForbidden(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function visibleLabel(s) {
  return stripXmlForbidden(String(s ?? "")).replace(/\s+/g, " ").trim();
}

function emptyChartReason() {
  return "refusing to write an empty Excel chart - no numeric series";
}

/** Default customer folder. Same sink as Word. Tests must never write here. */
function customerExcelRoot() {
  return customerWordRoot();
}

function sanctionedRoot() {
  return process.env.NETIE_EXCEL_OUT_DIR || customerExcelRoot();
}

function refuseUncontainedTest(outPath) {
  if (process.env.NETIE_EXCEL_OUT_DIR || !isTestProcess()) return null;
  return {
    ok: false,
    reason:
      "test write refused: NETIE_EXCEL_OUT_DIR unset - will not write fixtures into the customer Excel folder",
    path: outPath,
    bytes: 0,
  };
}

function defaultXlsxPath(stem) {
  const name = `${stem || "pointer-chart"}-${Date.now()}.xlsx`;
  return path.join(sanctionedRoot(), name);
}

/**
 * Parse "Q1 10, Q2 20" / "apples: 3, oranges: 5" / "10, 20, 30" into series.
 * No invented sample data - missing numbers are a refusal (KB R-0011).
 */
function parseChartSeries(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, reason: emptyChartReason() };

  const labeled = [];
  const labeledRe =
    /([^,;]+?)\s*[=:]\s*(-?\d+(?:\.\d+)?)|(\b[A-Za-z][\w.%/-]{0,40})\s+(-?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = labeledRe.exec(text))) {
    const cat = visibleLabel(m[1] || m[3] || "");
    const val = Number(m[2] || m[4]);
    if (cat && Number.isFinite(val)) labeled.push({ cat, val });
    if (labeled.length >= MAX_POINTS) break;
  }
  if (labeled.length >= 1) {
    return {
      ok: true,
      categories: labeled.map((p) => p.cat),
      values: labeled.map((p) => p.val),
    };
  }

  const nums = [];
  for (const tok of text.split(/[,;\s]+/)) {
    if (!tok) continue;
    const val = Number(tok);
    if (!Number.isFinite(val)) {
      return { ok: false, reason: emptyChartReason() };
    }
    nums.push(val);
    if (nums.length >= MAX_POINTS) break;
  }
  if (!nums.length) return { ok: false, reason: emptyChartReason() };
  return {
    ok: true,
    categories: nums.map((_, i) => String(i + 1)),
    values: nums,
  };
}

function normalizePairs(categories, values) {
  const cats = Array.isArray(categories) ? categories : [];
  const vals = Array.isArray(values) ? values : [];
  if (cats.length !== vals.length) {
    return { ok: false, reason: "chart categories and values must be the same length" };
  }
  const outCats = [];
  const outVals = [];
  for (let i = 0; i < cats.length && outCats.length < MAX_POINTS; i += 1) {
    const val = Number(vals[i]);
    if (!Number.isFinite(val)) {
      return { ok: false, reason: emptyChartReason() };
    }
    const cat = visibleLabel(cats[i]) || `Item ${i + 1}`;
    outCats.push(cat);
    outVals.push(val);
  }
  if (!outCats.length) return { ok: false, reason: emptyChartReason() };
  return { ok: true, categories: outCats, values: outVals };
}

function resolveSeries(opts = {}) {
  const cats = Array.isArray(opts.categories) ? opts.categories : null;
  const vals = Array.isArray(opts.values) ? opts.values : null;
  if (cats && vals) return normalizePairs(cats, vals);
  return parseChartSeries(opts.value ?? opts.text ?? "");
}

function resolveChartType(raw) {
  const s = String(raw || "").toLowerCase();
  if (/\bpie\b/.test(s)) {
    return { ok: false, reason: "pie charts are not supported - use a column or line chart" };
  }
  if (s === "line" || /\bline\b/.test(s)) return { ok: true, chartType: "line" };
  return { ok: true, chartType: "col" };
}

function writtenEvidence(title, seriesName, categories, values) {
  const preview = categories
    .map((c, i) => `${c}=${values[i]}`)
    .join(", ")
    .slice(0, 80);
  return {
    title,
    seriesName,
    categories,
    values,
    points: categories.length,
    preview,
  };
}

function strCache(categories) {
  const pts = categories
    .map((c, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(c)}</c:v></c:pt>`)
    .join("");
  return `<c:ptCount val="${categories.length}"/>${pts}`;
}

function numCache(values) {
  const pts = values
    .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
    .join("");
  return `<c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${pts}`;
}

function plotXml(chartType, title, seriesName, categories, values) {
  const last = categories.length + 1;
  const ser =
    `<c:ser>` +
    `<c:idx val="0"/><c:order val="0"/>` +
    `<c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/>` +
    `<c:pt idx="0"><c:v>${xmlEscape(seriesName)}</c:v></c:pt></c:strCache></c:strRef></c:tx>` +
    `<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$${last}</c:f><c:strCache>${strCache(categories)}</c:strCache></c:strRef></c:cat>` +
    `<c:val><c:numRef><c:f>Sheet1!$B$2:$B$${last}</c:f><c:numCache>${numCache(values)}</c:numCache></c:numRef></c:val>` +
    `</c:ser>`;
  const plot =
    chartType === "line"
      ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}` +
        `<c:axId val="1"/><c:axId val="2"/></c:lineChart>`
      : `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}` +
        `<c:axId val="1"/><c:axId val="2"/></c:barChart>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="${NS_OD_REL}">` +
    `<c:chart>` +
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xmlEscape(title)}</a:t></a:r></a:p></c:rich></c:tx>` +
    `<c:overlay val="0"/></c:title>` +
    `<c:plotArea><c:layout/>${plot}` +
    `<c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="b"/><c:tickLblPos val="nextTo"/>` +
    `<c:crossAx val="2"/><c:crosses val="autoZero"/></c:catAx>` +
    `<c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:tickLblPos val="nextTo"/>` +
    `<c:crossAx val="1"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>` +
    `</c:plotArea>` +
    `<c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend>` +
    `<c:plotVisOnly val="1"/>` +
    `</c:chart></c:chartSpace>`
  );
}

function sheetXml(seriesName, categories, values) {
  const last = categories.length + 1;
  const header =
    `<row r="1">` +
    `<c r="A1" t="inlineStr"><is><t>Category</t></is></c>` +
    `<c r="B1" t="inlineStr"><is><t>${xmlEscape(seriesName)}</t></is></c>` +
    `</row>`;
  const rows = categories
    .map((c, i) => {
      const r = i + 2;
      return (
        `<row r="${r}">` +
        `<c r="A${r}" t="inlineStr"><is><t>${xmlEscape(c)}</t></is></c>` +
        `<c r="B${r}"><v>${values[i]}</v></c>` +
        `</row>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="${NS_OD_REL}">` +
    `<dimension ref="A1:B${last}"/>` +
    `<sheetData>${header}${rows}</sheetData>` +
    `<drawing r:id="rId1"/>` +
    `</worksheet>`
  );
}

function drawingXml() {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<xdr:twoCellAnchor>` +
    `<xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>10</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>16</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:graphicFrame>` +
    `<xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr>` +
    `<a:graphicFrameLocks noGrp="1"/></xdr:cNvGraphicFramePr></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
    `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${NS_OD_REL}" r:id="rId1"/>` +
    `</a:graphicData></a:graphic>` +
    `</xdr:graphicFrame><xdr:clientData/>` +
    `</xdr:twoCellAnchor></xdr:wsDr>`
  );
}

function relsXml(entries) {
  const inner = entries
    .map(
      (e, i) =>
        `<Relationship Id="rId${i + 1}" Type="${e.type}" Target="${e.target}"/>`
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${NS_PKG_REL}">${inner}</Relationships>`
  );
}

function excelPackageParts({ title, seriesName, categories, values, chartType }) {
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` +
    `<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`;
  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
    `<borders count="1"><border/></borders>` +
    `<cellStyleXfs count="1"><xf/></cellStyleXfs>` +
    `<cellXfs count="1"><xf/></cellXfs>` +
    `</styleSheet>`;
  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_OD_REL}">` +
    `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;
  const core =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<dc:title>${xmlEscape(title)}</dc:title><dc:creator>Pointer</dc:creator>` +
    `</cp:coreProperties>`;
  const app =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
    `<Application>Pointer</Application></Properties>`;
  return [
    { name: "[Content_Types].xml", data: contentTypes },
    {
      name: "_rels/.rels",
      data: relsXml([
        { type: `${NS_OD_REL}/officeDocument`, target: "xl/workbook.xml" },
        {
          type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
          target: "docProps/core.xml",
        },
        { type: `${NS_OD_REL}/extended-properties`, target: "docProps/app.xml" },
      ]),
    },
    { name: "docProps/core.xml", data: core },
    { name: "docProps/app.xml", data: app },
    { name: "xl/workbook.xml", data: workbook },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: relsXml([
        { type: `${NS_OD_REL}/worksheet`, target: "worksheets/sheet1.xml" },
        { type: `${NS_OD_REL}/styles`, target: "styles.xml" },
      ]),
    },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml(seriesName, categories, values) },
    {
      name: "xl/worksheets/_rels/sheet1.xml.rels",
      data: relsXml([{ type: `${NS_OD_REL}/drawing`, target: "../drawings/drawing1.xml" }]),
    },
    { name: "xl/drawings/drawing1.xml", data: drawingXml() },
    {
      name: "xl/drawings/_rels/drawing1.xml.rels",
      data: relsXml([{ type: `${NS_OD_REL}/chart`, target: "../charts/chart1.xml" }]),
    },
    { name: "xl/charts/chart1.xml", data: plotXml(chartType, title, seriesName, categories, values) },
    { name: "xl/styles.xml", data: styles },
  ];
}

const EXCEL_CHART_PARTS = Object.freeze([
  "[Content_Types].xml",
  "_rels/.rels",
  "docProps/core.xml",
  "docProps/app.xml",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
  "xl/worksheets/sheet1.xml",
  "xl/worksheets/_rels/sheet1.xml.rels",
  "xl/drawings/drawing1.xml",
  "xl/drawings/_rels/drawing1.xml.rels",
  "xl/charts/chart1.xml",
  "xl/styles.xml",
]);

/**
 * Build a chart-bearing .xlsx in memory. Never writes disk. Never Acts.
 */
function buildXlsxChart(opts = {}) {
  const series = resolveSeries(opts);
  if (!series.ok) return { ok: false, reason: series.reason };
  const kind = resolveChartType(opts.chartType || opts.kind || "");
  if (!kind.ok) return { ok: false, reason: kind.reason };
  const title = visibleLabel(opts.title) || "Chart";
  const seriesName = visibleLabel(opts.seriesName) || "Value";
  const parts = excelPackageParts({
    title,
    seriesName,
    categories: series.categories,
    values: series.values,
    chartType: kind.chartType,
  });
  const buffer = zipStore(parts);
  return {
    ok: true,
    buffer,
    bytes: buffer.length,
    chartType: kind.chartType,
    ...writtenEvidence(title, seriesName, series.categories, series.values),
  };
}

/**
 * @param {{ value?: string, text?: string, categories?: string[], values?: number[],
 *           title?: string, seriesName?: string, chartType?: string,
 *           path?: string, dryRun?: boolean, stem?: string }} opts
 */
function writeXlsxChart(opts = {}) {
  const outPath = opts.path || defaultXlsxPath(opts.stem);
  const contained = containPath(outPath, [sanctionedRoot()]);
  if (!contained.ok) {
    return { ok: false, reason: contained.reason, path: outPath, bytes: 0 };
  }
  const uncontained = refuseUncontainedTest(outPath);
  if (uncontained) return uncontained;
  const built = buildXlsxChart(opts);
  if (!built.ok) {
    return { ok: false, reason: built.reason, path: outPath, bytes: 0 };
  }
  if (opts.dryRun) {
    return {
      ok: true,
      path: outPath,
      bytes: built.bytes,
      dryRun: true,
      chartType: built.chartType,
      ...writtenEvidence(built.title, built.seriesName, built.categories, built.values),
    };
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, built.buffer);
  return {
    ok: true,
    path: outPath,
    bytes: built.bytes,
    chartType: built.chartType,
    sha256: crypto.createHash("sha256").update(built.buffer).digest("hex"),
    ...writtenEvidence(built.title, built.seriesName, built.categories, built.values),
  };
}

module.exports = {
  writeXlsxChart,
  buildXlsxChart,
  parseChartSeries,
  resolveSeries,
  resolveChartType,
  excelPackageParts,
  EXCEL_CHART_PARTS,
  defaultXlsxPath,
  sanctionedRoot,
  customerExcelRoot,
  isTestProcess,
  MAX_POINTS,
};
