"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pointer-xlsx-"));
process.env.NETIE_EXCEL_OUT_DIR = tmp;

const {
  writeXlsxChart,
  buildXlsxChart,
  parseChartSeries,
  EXCEL_CHART_PARTS,
} = require("../electron/netie/excel-coworker");
const { zipRead } = require("../electron/netie/word-coworker");
const { InputDriver } = require("../electron/netie/driver");

const XML_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

function unzipEntry(buf, wanted) {
  const pkg = zipRead(buf);
  assert.strictEqual(pkg.ok, true, `zipRead refused: ${pkg.reason}`);
  const hit = pkg.entries.find((e) => e.name === wanted);
  assert.ok(hit, `${wanted} not found in the package`);
  return hit.data;
}

function assertExcelChartShell(buf, label) {
  const pkg = zipRead(buf);
  assert.strictEqual(pkg.ok, true, `${label}: zipRead refused - ${pkg.reason}`);
  const names = pkg.entries.map((e) => e.name);
  for (const need of EXCEL_CHART_PARTS) {
    assert.ok(names.includes(need), `${label}: missing ${need} - Excel will not show the chart`);
  }
  const types = unzipEntry(buf, "[Content_Types].xml").toString("utf8");
  assert.ok(
    /drawingml\.chart\+xml/.test(types),
    `${label}: [Content_Types].xml has no chart content type`
  );
  const sheetRels = unzipEntry(buf, "xl/worksheets/_rels/sheet1.xml.rels").toString("utf8");
  assert.ok(/drawing1\.xml/.test(sheetRels), `${label}: sheet does not point at the drawing`);
  const drawingRels = unzipEntry(buf, "xl/drawings/_rels/drawing1.xml.rels").toString("utf8");
  assert.ok(/chart1\.xml/.test(drawingRels), `${label}: drawing does not point at the chart`);
}

function sheetPairs(buf) {
  const xml = unzipEntry(buf, "xl/worksheets/sheet1.xml").toString("utf8");
  const cats = [...xml.matchAll(/<c r="A\d+" t="inlineStr"><is><t>([\s\S]*?)<\/t>/g)].map((m) =>
    m[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
  );
  const vals = [...xml.matchAll(/<c r="B\d+"><v>([\s\S]*?)<\/v>/g)].map((m) => Number(m[1]));
  return { xml, categories: cats.slice(1), values: vals };
}

function chartPairs(buf) {
  const xml = unzipEntry(buf, "xl/charts/chart1.xml").toString("utf8");
  const decode = (s) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
  const catBlock = xml.match(/<c:cat>[\s\S]*?<\/c:cat>/);
  const cats = catBlock
    ? [...catBlock[0].matchAll(/<c:v>([\s\S]*?)<\/c:v>/g)].map((m) => decode(m[1]))
    : [];
  const valBlock = xml.match(/<c:val>[\s\S]*?<\/c:val>/);
  const vals = valBlock
    ? [...valBlock[0].matchAll(/<c:v>([\s\S]*?)<\/c:v>/g)].map((m) => Number(m[1]))
    : [];
  return { xml, categories: cats, values: vals };
}

{
  const labeled = parseChartSeries("Q1 10, Q2 20, Q3 15");
  assert.strictEqual(labeled.ok, true, labeled.reason);
  assert.deepStrictEqual(labeled.categories, ["Q1", "Q2", "Q3"]);
  assert.deepStrictEqual(labeled.values, [10, 20, 15]);
  const colon = parseChartSeries("apples: 3, oranges: 5");
  assert.deepStrictEqual(colon.categories, ["apples", "oranges"]);
  assert.deepStrictEqual(colon.values, [3, 5]);
  const eq = parseChartSeries("North=12 South=8");
  assert.deepStrictEqual(eq.categories, ["North", "South"]);
  assert.deepStrictEqual(eq.values, [12, 8]);
  const bare = parseChartSeries("10, 20, 30");
  assert.deepStrictEqual(bare.categories, ["1", "2", "3"]);
  assert.deepStrictEqual(bare.values, [10, 20, 30]);
  assert.strictEqual(parseChartSeries("").ok, false);
  assert.strictEqual(parseChartSeries("hello").ok, false);
}

const out = path.join(tmp, "sample.xlsx");
const dry = writeXlsxChart({ value: "Q1 10, Q2 20", path: out, dryRun: true });
assert.strictEqual(dry.dryRun, true);
assert.ok(dry.bytes > 100);
assert.ok(!fs.existsSync(out), "dry-run must not write");

const written = writeXlsxChart({ value: "Q1 10, Q2 20", path: out, title: "Sales" });
assert.ok(fs.existsSync(out), "chart workbook was not written");
assert.strictEqual(written.bytes, fs.statSync(out).size);
assert.ok(written.sha256);
assert.strictEqual(written.preview, "Q1=10, Q2=20");
assert.strictEqual(written.points, 2);
assert.strictEqual(fs.readFileSync(out).subarray(0, 2).toString("binary"), "PK");

const onDisk = fs.readFileSync(out);
assertExcelChartShell(onDisk, "writeXlsxChart");
const sheet = sheetPairs(onDisk);
assert.deepStrictEqual(sheet.categories, ["Q1", "Q2"]);
assert.deepStrictEqual(sheet.values, [10, 20]);
const chart = chartPairs(onDisk);
assert.deepStrictEqual(chart.categories, ["Q1", "Q2"]);
assert.deepStrictEqual(chart.values, [10, 20]);
assert.ok(/<c:barChart>/.test(chart.xml), "default chart is not a column chart");
assert.ok(/<c:title>[\s\S]*Sales/.test(chart.xml), "chart title missing from chart1.xml");
assert.ok(!XML_FORBIDDEN.test(chart.xml), "XML-forbidden character reached chart1.xml");
assert.ok(!XML_FORBIDDEN.test(sheet.xml), "XML-forbidden character reached sheet1.xml");

const mem = buildXlsxChart({ categories: ["A", "B"], values: [1, 2], title: "Mem" });
assert.ok(mem.ok);
assert.strictEqual(mem.buffer.subarray(0, 2).toString("binary"), "PK");
assertExcelChartShell(mem.buffer, "buildXlsxChart");
assert.deepStrictEqual(chartPairs(mem.buffer).values, [1, 2]);

const line = buildXlsxChart({ value: "Jan 4, Feb 8", chartType: "line" });
assert.ok(line.ok, line.reason);
assert.ok(/<c:lineChart>/.test(chartPairs(line.buffer).xml), "line chartType did not emit lineChart");

assert.strictEqual(buildXlsxChart({ value: "" }).ok, false);
assert.strictEqual(buildXlsxChart({ value: "no numbers here" }).ok, false);
assert.strictEqual(buildXlsxChart({ chartType: "pie", value: "A 1, B 2" }).ok, false);

{
  const p = path.join(tmp, "amp.xlsx");
  const r = writeXlsxChart({ categories: ['A & B <C>'], values: [3], path: p, title: 'A & B' });
  assert.strictEqual(r.ok, true, r.reason);
  const xml = unzipEntry(fs.readFileSync(p), "xl/charts/chart1.xml").toString("utf8");
  assert.ok(xml.includes("A &amp; B"), "ampersand was not escaped in the chart");
  assert.ok(!XML_FORBIDDEN.test(xml));
}

{
  const p = path.join(tmp, "ctrl.xlsx");
  const r = writeXlsxChart({
    categories: ["ok\u0000x"],
    values: [9],
    path: p,
  });
  assert.strictEqual(r.ok, true, r.reason);
  const xml = unzipEntry(fs.readFileSync(p), "xl/worksheets/sheet1.xml").toString("utf8");
  assert.ok(!XML_FORBIDDEN.test(xml), "control character survived in the sheet");
  assert.ok(sheetPairs(fs.readFileSync(p)).categories.includes("okx"));
}

{
  const probe = path.join(tmp, "dry-run-probe");
  process.env.NETIE_EXCEL_OUT_DIR = probe;
  assert.ok(!fs.existsSync(probe), "probe dir should not exist yet");
  const before = fs.readdirSync(tmp).sort();
  const r = writeXlsxChart({ value: "Q1 1, Q2 2", dryRun: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.dryRun, true);
  assert.ok(r.path.startsWith(probe), "dry run must still report where it would land");
  assert.ok(!fs.existsSync(probe), "dry-run created the output directory");
  assert.ok(!fs.existsSync(r.path), "dry-run wrote the file");
  assert.deepStrictEqual(fs.readdirSync(tmp).sort(), before, "dry-run modified the filesystem");
  process.env.NETIE_EXCEL_OUT_DIR = tmp;
}

{
  const outside = path.join(os.tmpdir(), "pointer-excel-escape.xlsx");
  const r = writeXlsxChart({ value: "Q1 1, Q2 2", path: outside });
  assert.strictEqual(r.ok, false, "write escaped the sanctioned root");
  assert.ok(r.reason, "the refusal must carry a reason");
  assert.ok(!fs.existsSync(outside), "a refused write still created the file");
}

{
  const { isSupported } = require("../electron/netie/plan-guard");
  assert.strictEqual(
    isSupported("excel_xlsx_chart"),
    true,
    "plan-guard must support the verb - an unsupported verb is refused, so this is the fail-closed direction"
  );
  const { describeAction } = require("../electron/netie/plan-describe");
  const d = describeAction({ type: "excel_xlsx_chart", path: path.join(tmp, "report.xlsx") });
  assert.strictEqual(d.verb, "Chart", "approval must name Chart, not Write");
  assert.ok(d.text.includes("report.xlsx"), `approval must name the destination - got: ${d.text}`);
  const none = describeAction({ type: "excel_xlsx_chart", value: "Q1 1, Q2 2" });
  assert.strictEqual(none.destination, "");
  assert.ok(!none.text.includes(tmp), "must not invent a path");
}

console.log("PASS excel-coworker: chart1.xml and sheet1.xml round-trip the series");

const driver = new InputDriver({ dryRun: true });
(async () => {
  const r = await driver.perform({
    type: "excel_xlsx_chart",
    value: "Q1 10, Q2 20",
    path: path.join(tmp, "drv.xlsx"),
  });
  assert.strictEqual(r.ok, true, r.error || r.reason);
  assert.strictEqual(r.dryRun, true);
  assert.ok(!fs.existsSync(path.join(tmp, "drv.xlsx")), "driver dry-run wrote a file");

  const refused = await driver.perform({
    type: "excel_xlsx_chart",
    value: "Q1 10, Q2 20",
    path: path.join(os.tmpdir(), "pointer-excel-outside.xlsx"),
  });
  assert.strictEqual(refused.ok, false, "driver must surface the refusal");
  assert.ok(refused.reason, "refusal must reach the driver result");
  assert.ok(refused.error, "executeApproved reads error, not reason");

  const empty = await driver.perform({
    type: "excel_xlsx_chart",
    value: "no numbers",
    path: path.join(tmp, "empty-chart.xlsx"),
  });
  assert.strictEqual(empty.ok, false, "empty series must refuse");
  assert.ok(/empty Excel chart|numeric series/i.test(empty.error), `unhelpful reason: ${empty.error}`);
  assert.ok(!fs.existsSync(path.join(tmp, "empty-chart.xlsx")));

  const live = new InputDriver({ dryRun: false });
  const landed = await live.perform({
    type: "excel_xlsx_chart",
    value: "East 4, West 7",
    title: "Regions",
    path: path.join(tmp, "live-chart.xlsx"),
  });
  assert.strictEqual(landed.ok, true, landed.error || landed.reason);
  const received = fs.readFileSync(landed.path);
  assertExcelChartShell(received, "driver live excel_xlsx_chart");
  assert.deepStrictEqual(sheetPairs(received).categories, ["East", "West"]);
  assert.deepStrictEqual(chartPairs(received).values, [4, 7]);
  assert.strictEqual(landed.preview, "East=4, West=7");
  const src = fs.readFileSync(require.resolve("../electron/netie/excel-coworker"), "utf8");
  assert.ok(/Pure OOXML zip/.test(src), "excel-coworker must stay OOXML");
  assert.ok(!/win32ole|Excel\.Application|ActiveXObject/i.test(src), "excel-coworker must not call Excel COM");

  console.log("PASS excel-coworker writeXlsxChart + dry-run driver");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
