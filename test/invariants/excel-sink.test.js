"use strict";
/**
 * Tests must not write Excel fixtures into the customer sink (R-0001 / R-0002).
 * Mirrors test/invariants/word-sink.test.js for POINTER-EXCEL-SAFE.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const {
  writeXlsxChart,
  customerExcelRoot,
  isTestProcess,
} = require("../../electron/netie/excel-coworker");
const { zipRead } = require("../../electron/netie/word-coworker");

function chartNames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => n.startsWith("pointer-chart-") && n.endsWith(".xlsx")).sort();
}

function chartValues(file) {
  const pkg = zipRead(fs.readFileSync(file));
  assert.strictEqual(pkg.ok, true, pkg.reason);
  const chart = pkg.entries.find((e) => e.name === "xl/charts/chart1.xml");
  assert.ok(chart, "customer artifact missing xl/charts/chart1.xml");
  const block = chart.data.toString("utf8").match(/<c:val>[\s\S]*?<\/c:val>/);
  assert.ok(block, "chart1.xml has no value cache");
  return [...block[0].matchAll(/<c:v>([\s\S]*?)<\/c:v>/g)].map((m) => Number(m[1]));
}

function walkJs(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkJs(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

assert.strictEqual(isTestProcess(), true, "this file must count as a test process");

{
  const customer = customerExcelRoot();
  const before = chartNames(customer);
  const prev = process.env.NETIE_EXCEL_OUT_DIR;
  delete process.env.NETIE_EXCEL_OUT_DIR;
  const r = writeXlsxChart({ value: "Q1 10, Q2 20", stem: "pointer-chart" });
  if (prev === undefined) delete process.env.NETIE_EXCEL_OUT_DIR;
  else process.env.NETIE_EXCEL_OUT_DIR = prev;
  assert.strictEqual(r.ok, false, "uncontained test write was accepted");
  assert.ok(/NETIE_EXCEL_OUT_DIR/.test(r.reason), `unhelpful reason: ${r.reason}`);
  assert.deepStrictEqual(
    chartNames(customer),
    before,
    "an uncontained test write created a pointer-chart-*.xlsx in the customer folder"
  );
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pointer-excel-sink-"));
  process.env.NETIE_EXCEL_OUT_DIR = dir;
  const r = writeXlsxChart({ value: "Q1 10, Q2 20", stem: "pointer-chart" });
  assert.strictEqual(r.ok, true, `contained write refused: ${r.reason}`);
  assert.ok(r.path.startsWith(dir), `wrote outside the test sink: ${r.path}`);
  assert.ok(!r.path.startsWith(customerExcelRoot()), `wrote into the customer sink: ${r.path}`);
  assert.deepStrictEqual(chartValues(r.path), [10, 20]);
}

{
  const files = walkJs(path.join(ROOT, "test"));
  const offenders = [];
  for (const file of files) {
    if (path.basename(file) === "excel-sink.test.js") continue;
    const src = fs.readFileSync(file, "utf8");
    if (!/writeXlsxChart\s*\(/.test(src)) continue;
    if (!/NETIE_EXCEL_OUT_DIR/.test(src)) {
      offenders.push(path.relative(ROOT, file).replace(/\\/g, "/"));
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    "these suites write a .xlsx without naming NETIE_EXCEL_OUT_DIR, so they can hit the customer sink: " +
      offenders.join(", ")
  );
}

console.log("PASS excel-sink: uncontained test writes refuse; fixture stays out of Documents/NetiePointer");
