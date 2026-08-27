"use strict";
/**
 * Public host.netie.ai pages (DR-0004).
 *
 * Same paths as the loopback coordinator. Live lanes and MCP stay on
 * 127.0.0.1:18010 - this surface never proxies them.
 */

const { catalog, publicTodaySnapshot, publicMeetingSnapshot, publicTeachSnapshot, publicSecuritySnapshot, publicDocumentSnapshot, publicInboxSnapshot, publicHomeSnapshot } = require("./coworker-desks");
const { publicWorkspaceSnapshot } = require("./workspace");

const PAGES = Object.freeze({
  "/": "home",
  "/today": "today",
  "/meeting": "meeting",
  "/teach": "teach",
  "/security": "security",
  "/document": "document",
  "/inbox": "inbox",
  "/lanes": "lanes",
  "/skills": "skills",
  "/workspace": "workspace",
});

const PAGE_FILES = Object.freeze({
  "/": "index.html",
  "/today": "today.html",
  "/meeting": "meeting.html",
  "/teach": "teach.html",
  "/security": "security.html",
  "/document": "document.html",
  "/inbox": "inbox.html",
  "/lanes": "lanes.html",
  "/skills": "skills.html",
  "/workspace": "workspace.html",
});

const PUBLIC_FILES = Object.freeze([
  "index.html",
  "today.html",
  "meeting.html",
  "teach.html",
  "security.html",
  "document.html",
  "inbox.html",
  "lanes.html",
  "skills.html",
  "workspace.html",
  "style.css",
  "app.js",
]);
const PUBLIC_FILE_SET = new Set(PUBLIC_FILES);

function normalizePath(pathname) {
  const raw = String(pathname || "/").split("?")[0];
  const clean = raw.replace(/\/+$/, "") || "/";
  return clean;
}

function pageFor(pathname) {
  return PAGES[normalizePath(pathname)] || null;
}

function fileFor(pathname) {
  const clean = normalizePath(pathname);
  if (PAGE_FILES[clean]) return PAGE_FILES[clean];
  const base = clean.replace(/^\//, "");
  if (PUBLIC_FILE_SET.has(base)) return base;
  return null;
}

function publicSnapshot() {
  return {
    localFirst: true,
    coordinator: "http://127.0.0.1:18010",
    pages: { ...PAGES },
    lanes: {
      "pointer-act": null,
      "cursor-cloud": null,
      "cortex": null,
      "craft": null,
    },
    drafts: [],
    lastSearch: [],
    today: [],
    exec: false,
    reason: "live lanes and MCP stay on the laptop",
  };
}

function jsonHeaders() {
  return { "content-type": "application/json; charset=utf-8" };
}

function textHeaders() {
  return { "content-type": "text/plain; charset=utf-8" };
}

function typeFor(file) {
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "text/html; charset=utf-8";
}

/**
 * Route a public host request. Never takes live coordinator state.
 * @returns {{ status: number, headers?: object, body?: string, file?: string }}
 */
function handlePublicRequest({ method, pathname, search } = {}) {
  const verb = String(method || "GET").toUpperCase();
  const clean = normalizePath(pathname);
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  if (clean === "/mcp" || clean.startsWith("/mcp/")) {
    return { status: 404, headers: textHeaders(), body: "mcp stays on 127.0.0.1" };
  }
  if (clean === "/api/workspace/exec" || clean === "/exec") {
    return {
      status: 404,
      headers: textHeaders(),
      body: "workspace has no runtime; Act stays on the laptop",
    };
  }
  if (verb === "GET" && clean === "/api/state") {
    return {
      status: 200,
      headers: jsonHeaders(),
      body: JSON.stringify(publicSnapshot()),
    };
  }
  if (verb === "GET" && clean === "/api/today") {
    return {
      status: 200,
      headers: jsonHeaders(),
      body: JSON.stringify(publicTodaySnapshot()),
    };
  }
  if (verb === "GET" && clean === "/api/meeting") {
    return {
      status: 200,
      headers: jsonHeaders(),
      body: JSON.stringify(publicMeetingSnapshot()),
    };
  }
  if (verb === "GET" && clean === "/api/teach") {
    return {
      status: 200,
      headers: jsonHeaders(),
      body: JSON.stringify(publicTeachSnapshot()),
    };
  }
  if (verb === "GET" && clean === "/api/security") {
    return {
      status: 200,
      headers: jsonHeaders(),
      body: JSON.stringify(publicSecuritySnapshot()),
    };
  }
  if (verb === "GET" && clean === "/api/document") {
    return {
      status: 200,
      headers: jsonHeaders(),
      body: JSON.stringify(publicDocumentSnapshot()),
    };
  }
  if (verb === "GET" && clean === "/api/inbox") {
    return {
      status: 200,
      headers: jsonHeaders(),
      body: JSON.stringify(publicInboxSnapshot()),
    };
  }
  if (verb === "GET" && clean === "/api/home") {
    return {
      status: 200,
      headers: jsonHeaders(),
      body: JSON.stringify(publicHomeSnapshot()),
    };
  }
  if (verb === "GET" && clean === "/api/workspace") {
    if (params.get("id")) {
      return {
        status: 404,
        headers: jsonHeaders(),
        body: JSON.stringify({
          ok: false,
          localFirst: true,
          exec: false,
          act: false,
          reason: "live artifacts stay on the laptop",
        }),
      };
    }
    return {
      status: 200,
      headers: jsonHeaders(),
      body: JSON.stringify(publicWorkspaceSnapshot(catalog())),
    };
  }
  if (verb === "POST" && clean === "/api/teach") {
    return {
      status: 404,
      headers: textHeaders(),
      body: "teach advance stays on 127.0.0.1",
    };
  }
  if (verb === "POST" && (clean === "/api/workspace" || clean === "/api/workspace/put")) {
    return {
      status: 404,
      headers: textHeaders(),
      body: "workspace writes stay on 127.0.0.1",
    };
  }
  if (verb === "GET") {
    const file = fileFor(clean);
    if (file && PUBLIC_FILE_SET.has(file)) {
      return { status: 200, file, headers: { "content-type": typeFor(file) } };
    }
  }
  return { status: 404, headers: textHeaders(), body: "not a coordinator page" };
}

function createPublicFetch(readAsset) {
  return async function fetch(request) {
    const url = new URL(request.url);
    const routed = handlePublicRequest({
      method: request.method,
      pathname: url.pathname,
      search: url.search,
    });
    if (routed.file) {
      if (!PUBLIC_FILE_SET.has(routed.file)) {
        return new Response("not a coordinator page", { status: 404, headers: textHeaders() });
      }
      const asset = readAsset ? await readAsset(routed.file) : null;
      if (asset == null) return new Response("missing page", { status: 404, headers: textHeaders() });
      return new Response(asset, { status: 200, headers: { "content-type": typeFor(routed.file) } });
    }
    return new Response(routed.body || "", {
      status: routed.status,
      headers: routed.headers || textHeaders(),
    });
  };
}

module.exports = {
  PAGES,
  PAGE_FILES,
  PUBLIC_FILES,
  pageFor,
  fileFor,
  publicSnapshot,
  handlePublicRequest,
  createPublicFetch,
};
