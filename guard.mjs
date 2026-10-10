// guard.mjs: the connection guard.
//
// A small proxy on this computer that the ArtCraft desktop app sends all of its internet traffic through
// (local-only.mjs sets that up). It records every outside host the app contacts, labels it, and, when
// blocking is on, refuses any host that is not local or approved by you.
//
// Settings live in <home>/Artcraft/settings/connections.json (shared with the app):
//   { "version": 1,
//     "guard": { "enabled": true, "port": 12346, "block_unknown_hosts": false,
//                "approved_hosts": [ { "host": "fonts.googleapis.com", "note": "Interface fonts" } ] } }
// Every connection is appended to <home>/Artcraft/local-backend/connections.log (one JSON object per line).

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";

// Hosts that belong to ArtCraft's company. They are never approved automatically.
const ARTCRAFT_DOMAINS = ["storyteller.ai", "fakeyou.com", "artcraft.ai", "getartcraft.com"];
const DEFAULT_GUARD_PORT = 12346;
const RECENT_LIMIT = 500;

export class ConnectionGuard {
  constructor({ settingsFile, logFile }) {
    this.settingsFile = settingsFile;
    this.logFile = logFile;
    this.recent = [];
    this.hosts = new Map();
    this.cachedSettings = null;
    this.cachedMtime = 0;
    ensureSettingsFile(settingsFile);
  }

  start() {
    const port = this.settings().port;
    const server = http.createServer((req, res) => this.forwardPlainHttp(req, res));
    server.on("connect", (req, socket, head) => this.tunnel(req, socket, head));
    server.on("clientError", (error, socket) => socket.destroy());
    server.on("error", (error) => {
      console.error(`Connection guard could not listen on 127.0.0.1:${port}: ${error.message}`);
      process.exit(1);
    });
    server.listen(port, "127.0.0.1");
    const s = this.settings();
    console.log(`Connection guard on http://127.0.0.1:${port} (blocking unknown hosts: ${s.block_unknown_hosts ? "ON" : "off"}, ${s.approved_hosts.length} approved)`);
  }

  // ---- What the app and the settings screen call ----------------------------------------------

  settings() {
    try {
      const mtime = fs.statSync(this.settingsFile).mtimeMs;
      if (!this.cachedSettings || mtime !== this.cachedMtime) {
        this.cachedSettings = normalizeSettings(JSON.parse(fs.readFileSync(this.settingsFile, "utf8")));
        this.cachedMtime = mtime;
      }
    } catch (error) {
      if (!this.cachedSettings) this.cachedSettings = normalizeSettings({});
    }
    return this.cachedSettings.guard;
  }

  saveSettings(guardSettings) {
    const current = readJson(this.settingsFile) || {};
    const merged = normalizeSettings({ ...current, guard: { ...this.settings(), ...guardSettings } });
    writeJson(this.settingsFile, merged);
    this.cachedSettings = null;
    return this.settings();
  }

  summary() {
    const hosts = [...this.hosts.values()].sort((a, b) => b.last_seen.localeCompare(a.last_seen));
    return { settings: this.settings(), hosts, recent: this.recent.slice(-200).reverse() };
  }

  // The page monitor in the interface reports what the web view loaded.
  report(entries) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      let url;
      try {
        url = new URL(entry.url);
      } catch {
        continue;
      }
      if (!url.hostname || isLocal(url.hostname)) continue;
      const blockedByPolicy = entry.kind === "blocked by policy";
      this.record({
        via: "interface (page monitor)",
        method: entry.kind || "load",
        host: url.hostname,
        port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
        allowed: !blockedByPolicy,
        note: blockedByPolicy ? "blocked by the page's content policy" : undefined,
      });
    }
  }

  // What the page monitor needs at startup to block hosts inside the web view (Mac and Linux).
  pagePolicy() {
    const s = this.settings();
    const approved = s.approved_hosts.map((a) => a.host);
    const sources = [
      "'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", "blob:", "data:",
      "http://localhost:*", "ws://localhost:*", "http://127.0.0.1:*", "ws://127.0.0.1:*",
      "ipc:", "http://ipc.localhost", "asset:", "https://asset.localhost", "tauri:",
      ...approved.flatMap((h) => [`https://${h}`, `http://${h}`, `wss://${h}`]),
    ].join(" ");
    return { block: s.block_unknown_hosts, csp: `default-src ${sources}` };
  }

  // ---- The proxy ------------------------------------------------------------------------------

  tunnel(req, clientSocket, head) {
    // The app may hang up at any moment (especially after a refusal); that must never crash the backend.
    clientSocket.on("error", () => clientSocket.destroy());
    const { host, port } = splitHostPort(req.url, 443);
    const decision = this.decide(host);
    this.record({ via: viaOf(req), method: "CONNECT", host, port, allowed: decision.allowed });
    if (!decision.allowed) {
      clientSocket.end("HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nBlocked by artcraft-local connection guard\r\n");
      return;
    }
    const upstream = net.connect(port, host, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head && head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    const close = () => {
      upstream.destroy();
      clientSocket.destroy();
    };
    upstream.on("error", close);
    clientSocket.on("error", close);
  }

  forwardPlainHttp(req, res) {
    let target;
    try {
      target = new URL(req.url);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      return res.end("artcraft-local connection guard: expected a proxy request\n");
    }
    const host = target.hostname;
    const port = Number(target.port) || 80;
    const decision = this.decide(host);
    this.record({ via: viaOf(req), method: req.method, host, port, allowed: decision.allowed });
    if (!decision.allowed) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end("Blocked by artcraft-local connection guard\n");
    }
    const upstream = http.request(
      { host, port, method: req.method, path: target.pathname + target.search, headers: req.headers },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  }

  // ---- Decisions and records ------------------------------------------------------------------

  decide(host) {
    const category = this.categorize(host);
    const s = this.settings();
    const allowed = category === "local" || category === "approved" || !s.block_unknown_hosts;
    return { category, allowed };
  }

  categorize(host) {
    if (isLocal(host)) return "local";
    const s = this.settings();
    if (s.approved_hosts.some((a) => hostMatches(host, a.host))) return "approved";
    if (ARTCRAFT_DOMAINS.some((d) => hostMatches(host, `*.${d}`) || host === d)) return "artcraft";
    return "unknown";
  }

  record({ via, method, host, port, allowed, note }) {
    const category = this.categorize(host);
    const time = new Date().toISOString();
    const entry = { time, via, method, host, port, category, allowed, ...(note ? { note } : {}) };

    this.recent.push(entry);
    if (this.recent.length > RECENT_LIMIT) this.recent.splice(0, this.recent.length - RECENT_LIMIT);
    try {
      fs.appendFileSync(this.logFile, JSON.stringify(entry) + "\n");
    } catch {
      // The log file is a convenience; the in-memory record still works.
    }

    let summary = this.hosts.get(host);
    const isNew = !summary;
    if (!summary) {
      summary = { host, category, via: [], count: 0, blocked: 0, first_seen: time, last_seen: time };
      this.hosts.set(host, summary);
    }
    summary.category = category;
    summary.count += 1;
    if (!allowed) summary.blocked += 1;
    summary.last_seen = time;
    if (!summary.via.includes(via)) summary.via.push(via);

    if (isNew || (!allowed && summary.blocked === 1)) {
      const label = allowed ? "CONNECTION" : "BLOCKED   ";
      console.log(`${label} ${host}  (${category}, from ${via})`);
    }
  }
}

// ---- Helpers ------------------------------------------------------------------------------------

function normalizeSettings(raw) {
  const guard = raw?.guard || {};
  const approved = Array.isArray(guard.approved_hosts) ? guard.approved_hosts : [];
  return {
    ...raw,
    version: 1,
    guard: {
      enabled: guard.enabled !== false,
      port: Number(guard.port) || DEFAULT_GUARD_PORT,
      block_unknown_hosts: guard.block_unknown_hosts === true,
      approved_hosts: approved
        .map((a) => (typeof a === "string" ? { host: a, note: "" } : { host: String(a.host || ""), note: String(a.note || "") }))
        .map((a) => ({ ...a, host: a.host.trim().toLowerCase() }))
        .filter((a) => a.host),
    },
  };
}

function ensureSettingsFile(file) {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJson(file, normalizeSettings({}));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

function isLocal(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127\./.test(h);
}

// "example.com" matches exactly; "*.example.com" matches the domain and every subdomain.
function hostMatches(host, pattern) {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  if (p.startsWith("*.")) return h === p.slice(2) || h.endsWith(p.slice(1));
  return h === p;
}

function splitHostPort(value, defaultPort) {
  const m = String(value).match(/^\[?([^\]]+?)\]?(?::(\d+))?$/);
  return { host: m ? m[1] : String(value), port: m && m[2] ? Number(m[2]) : defaultPort };
}

// Chromium (the Windows web view) sends a browser User-Agent with its proxy requests; the app's
// own Rust code does not.
function viaOf(req) {
  const ua = String(req.headers["user-agent"] || "");
  return /Mozilla|WebView|Edg\//.test(ua) ? "interface (web view)" : "desktop app";
}
