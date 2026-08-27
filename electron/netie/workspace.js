"use strict";
/**
 * Pointer workspace (DR-0005).
 *
 * A durable artifact catalog for coworker deliverables. Inspired by the idea
 * of "an agent has a workspace you can open", written here. There is no FUSE
 * mount, no container, no isolate shell, no just-bash. Exec is a named
 * refusal so a Computer-shaped caller cannot smuggle a runtime through us.
 */

const { publicSessionSnapshot, freezeCoworkerLive } = require("./coworker-desks");

function nowMs(clock) {
  return typeof clock === "function" ? clock() : Date.now();
}

function createWorkspace(opts = {}) {
  const clock = opts.clock || Date.now;
  const items = [];
  const max = Number.isFinite(Number(opts.max)) ? Number(opts.max) : 40;

  function list() {
    return items.map((row) => {
      const copy = { ...row };
      delete copy.live;
      return copy;
    });
  }

  function publicList() {
    return items.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      desk: row.desk,
      t: row.t,
    }));
  }

  function get(id) {
    const key = String(id || "").trim();
    const row = items.find((item) => item.id === key);
    return row ? { ok: true, artifact: { ...row } } : { ok: false, reason: "missing artifact" };
  }

  function put(spec = {}) {
    const title = String(spec.title || spec.id || "untitled").slice(0, 120);
    const body = String(spec.body || spec.deliverable || "").slice(0, 8000);
    if (!body.trim()) return { ok: false, reason: "workspace put needs a body" };
    const row = {
      id: String(spec.id || `ws-${nowMs(clock)}-${items.length + 1}`).slice(0, 80),
      kind: String(spec.kind || "brief").slice(0, 40),
      title,
      desk: String(spec.desk || "teach").slice(0, 40),
      body,
      cue: String(spec.cue || "").slice(0, 240),
      asked: String(spec.asked || "").slice(0, 160),
      rest: String(spec.rest || "").slice(0, 160),
      heard: String(spec.heard || "").slice(0, 160),
      t: nowMs(clock),
    };
    const live = freezeCoworkerLive(spec.live);
    if (live) row.live = live;
    const existing = items.findIndex((item) => item.id === row.id);
    if (existing >= 0) items[existing] = row;
    else items.push(row);
    if (items.length > max) items.splice(0, items.length - max);
    return { ok: true, artifact: { ...row } };
  }

  function exec(spec = {}) {
    return {
      ok: false,
      exec: false,
      reason: "workspace has no runtime; Act stays on the laptop (P-06)",
      backend: spec && spec.backend ? String(spec.backend).slice(0, 40) : null,
    };
  }

  function snapshot() {
    return {
      localFirst: false,
      exec: false,
      artifacts: list(),
      reason: "live workspace on loopback; no runtime",
    };
  }

  return { list, publicList, get, put, exec, snapshot };
}

function publicWorkspaceSnapshot(desks) {
  return {
    localFirst: true,
    exec: false,
    coordinator: "http://127.0.0.1:18010",
    desks: Array.isArray(desks) ? desks.slice() : [],
    artifacts: [],
    session: publicSessionSnapshot(),
    reason: "workspace artifacts and Act stay on the laptop; this host has no runtime (P-06)",
  };
}

module.exports = { createWorkspace, publicWorkspaceSnapshot };
