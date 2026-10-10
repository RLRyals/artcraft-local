// artcraft-local: a minimal stand-in for ArtCraft's backend that keeps everything on this computer.
//
// It answers the requests the ArtCraft desktop app makes for the 3D scene editor (session, uploads,
// the media library, file lookups) and stores files under <home>/Artcraft/local-backend/.
// Models dropped into <home>/Artcraft/local-backend/builtin/<category>/ (character, object, location,
// creature: .glb; image_plane: .png/.jpg) appear in the app's asset menu.
// It listens only on this computer (127.0.0.1 and ::1), port 12345 by default.
//
// Run:   node server.mjs            (options: --port 12345  --data-dir <path>)
//
// Requests it does not handle yet are logged as "NOT HANDLED" and answered with {"success": false},
// so the app shows its normal error instead of hanging.

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = Number(opt("--port", "12345"));
const DATA_DIR = opt("--data-dir", path.join(os.homedir(), "Artcraft", "local-backend"));
const MEDIA_DIR = path.join(DATA_DIR, "media");
const INDEX_FILE = path.join(DATA_DIR, "media.json");
// Built-in models: <DATA_DIR>/builtin/<category>/<Name>.glb shows up in the app's asset menu.
const BUILTIN_DIR = path.join(DATA_DIR, "builtin");
const BUILTIN_CATEGORIES = ["character", "object", "location", "creature", "image_plane"];
// Generation runs on this computer, so the app is told credits are effectively unlimited.
const LOCAL_CREDITS = 1_000_000;
const BASE_URL = `http://localhost:${PORT}`;

const LOCAL_USER = {
  user_token: "user_local",
  username: "local",
  display_name: "Local User",
  email_gravatar_hash: "",
};

fs.mkdirSync(MEDIA_DIR, { recursive: true });
for (const category of BUILTIN_CATEGORIES) fs.mkdirSync(path.join(BUILTIN_DIR, category), { recursive: true });
let media = loadIndex();

const servers = ["127.0.0.1", "::1"].map((host) => {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(`ERROR      ${req.method} ${req.url}: ${error.stack || error}`);
      sendJson(req, res, 500, { success: false, error_reason: String(error.message || error) });
    });
  });
  server.on("error", (error) => {
    if (host === "::1" && error.code === "EADDRNOTAVAIL") return; // no IPv6 loopback on this machine
    console.error(`Could not listen on ${host}:${PORT}: ${error.message}`);
    process.exit(1);
  });
  server.listen(PORT, host);
  return server;
});

console.log(`artcraft-local listening on ${BASE_URL} (this computer only)`);
console.log(`Files are stored in ${MEDIA_DIR}`);
console.log(`Built-in models: ${BUILTIN_DIR} (${Object.keys(scanBuiltins()).length} found)`);

// ---------------------------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------------------------

async function handle(req, res) {
  const url = new URL(req.url, BASE_URL);
  const p = url.pathname;

  if (req.method === "OPTIONS") return sendCorsPreflight(req, res);

  // Thumbnails are requested through the CDN's resize prefix (/cdn-cgi/image/width=…/<path>); serve the original.
  const resized = p.match(/^\/cdn-cgi\/image\/[^/]+(\/.*)$/);
  if (req.method === "GET" && resized) {
    const inner = resized[1];
    if (inner.startsWith("/media/")) return sendMediaFile(req, res, inner.slice("/media/".length));
    if (inner.startsWith("/builtin/")) return sendBuiltinFile(req, res, inner.slice("/builtin/".length));
  }

  if (req.method === "GET" && p.startsWith("/media/")) return sendMediaFile(req, res, p.slice("/media/".length));
  if (req.method === "GET" && p.startsWith("/builtin/")) return sendBuiltinFile(req, res, p.slice("/builtin/".length));

  // Session and account.
  if (req.method === "GET" && p === "/v1/session") {
    return sendJson(req, res, 200, { success: true, logged_in: true, user: sessionUser() });
  }
  if (req.method === "GET" && p === "/v1/billing/active_subscriptions") {
    return sendJson(req, res, 200, { success: true, active_subscriptions: [], maybe_loyalty_program: null });
  }
  if (req.method === "GET" && p === "/v1/subscriptions/namespace/artcraft") {
    return sendJson(req, res, 200, { success: true, active_subscriptions: [], maybe_loyalty_program: null });
  }
  if (req.method === "GET" && p === "/v1/credits/namespace/artcraft") {
    return sendJson(req, res, 200, {
      success: true,
      free_credits: 0,
      monthly_credits: 0,
      banked_credits: LOCAL_CREDITS,
      sum_total_credits: LOCAL_CREDITS,
    });
  }
  if (req.method === "GET" && p === "/v1/jobs/session") {
    return sendJson(req, res, 200, { success: true, jobs: [] });
  }

  // Organizing features the local backend does not keep yet: answer with empty lists.
  if (req.method === "GET" && p === "/v1/tags/list") {
    return sendJson(req, res, 200, { success: true, tags: [], maybe_cursor: null });
  }
  if (req.method === "GET" && p.startsWith("/v1/tags/media_file/list/")) {
    return sendJson(req, res, 200, { success: true, tags: [] });
  }
  if (req.method === "GET" && p === "/v1/folders/list_all") {
    return sendJson(req, res, 200, { success: true, folders: [], maybe_cursor: null });
  }
  if (req.method === "GET" && (p === "/v1/media_files/mesh/list" || p === "/v1/media_files/splat/list")) {
    return sendJson(req, res, 200, { success: true, results: [], pagination: emptyPagination() });
  }

  // Media library.
  if (req.method === "GET" && p === "/v1/media_files/list_featured") {
    return sendJson(req, res, 200, listFeatured(url.searchParams));
  }
  if (req.method === "GET" && p.startsWith("/v1/media_files/list/user/")) {
    return sendJson(req, res, 200, listUserMedia(url.searchParams));
  }
  if (req.method === "GET" && p === "/v1/media_files/batch") {
    const tokens = url.searchParams.getAll("tokens");
    const files = tokens.map(findMediaFileInfo).filter(Boolean);
    return sendJson(req, res, 200, { success: true, media_files: files });
  }
  let m;
  if (req.method === "GET" && (m = p.match(/^\/v1\/media_files\/file\/([^/]+)$/))) {
    const info = findMediaFileInfo(m[1]);
    if (!info) return sendJson(req, res, 404, { success: false, error_reason: "media file not found" });
    return sendJson(req, res, 200, { success: true, media_file: info });
  }
  if (req.method === "POST" && (m = p.match(/^\/v1\/media_files\/rename\/([^/]+)$/))) {
    const record = media[m[1]];
    const body = await readJson(req);
    if (record && typeof body.name === "string") {
      record.maybe_title = body.name;
      record.updated_at = new Date().toISOString();
      saveIndex();
    }
    return sendJson(req, res, 200, { success: Boolean(record) });
  }
  if (req.method === "POST" && (m = p.match(/^\/v1\/media_files\/cover_image\/([^/]+)$/))) {
    const record = media[m[1]];
    const body = await readJson(req);
    if (record) {
      record.cover_image_token = body.cover_image_media_file_token || null;
      saveIndex();
    }
    return sendJson(req, res, 200, { success: Boolean(record) });
  }
  if (req.method === "DELETE" && (m = p.match(/^\/v1\/media_files\/file\/([^/]+)$/))) {
    return sendJson(req, res, 200, { success: deleteMedia(m[1]) });
  }

  // Uploads.
  if (req.method === "POST" && p === "/v1/media_files/upload/image") return upload(req, res, { kind: "image" });
  if (req.method === "POST" && p === "/v1/media_files/upload/new_video") return upload(req, res, { kind: "video" });
  if (req.method === "POST" && p === "/v1/media_files/upload/new_engine_asset") return upload(req, res, { kind: "engine_asset" });
  if (req.method === "POST" && p === "/v1/media_files/upload/new_scene") return upload(req, res, { kind: "scene" });
  if (req.method === "POST" && (m = p.match(/^\/v1\/media_files\/upload\/saved_scene\/([^/]+)$/))) {
    return upload(req, res, { kind: "scene", replaceToken: m[1] });
  }

  console.log(`NOT HANDLED ${req.method} ${p}${url.search}`);
  return sendJson(req, res, 404, { success: false, error_reason: "not implemented in artcraft-local" });
}

// ---------------------------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------------------------

async function upload(req, res, { kind, replaceToken }) {
  const body = await readBody(req);
  const form = parseMultipart(req.headers["content-type"] || "", body);
  const file = form.files.file;
  if (!file) return sendJson(req, res, 400, { success: false, BadInput: "missing file" });

  const ext = detectExtension(file, kind);
  const existing = replaceToken ? media[replaceToken] : null;
  const token = existing ? existing.token : newToken();
  if (existing) fs.rmSync(path.join(MEDIA_DIR, existing.file_name), { force: true });

  const fileName = `${token}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, fileName), file.data);

  const now = new Date().toISOString();
  media[token] = {
    token,
    file_name: fileName,
    extension: ext,
    kind,
    media_class: mediaClassFor(ext, kind),
    media_type: mediaTypeFor(ext, kind),
    maybe_engine_category: form.fields.engine_category || (kind === "scene" ? "scene" : null),
    maybe_animation_type: form.fields.maybe_animation_type || null,
    maybe_duration_millis: form.fields.maybe_duration_millis ? Number(form.fields.maybe_duration_millis) : null,
    maybe_title: existing?.maybe_title || form.fields.maybe_title || file.filename || null,
    is_intermediate_system_file: form.fields.is_intermediate_system_file === "true",
    maybe_original_filename: file.filename || null,
    cover_image_token: existing?.cover_image_token || null,
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  saveIndex();

  console.log(`UPLOADED   ${kind} ${token}.${ext} (${file.data.length} bytes)`);
  return sendJson(req, res, 200, { success: true, media_file_token: token });
}

// The app often sends files without an extension, so look at the bytes first.
function detectExtension(file, kind) {
  const b = file.data;
  const startsWith = (...bytes) => bytes.every((v, i) => b[i] === v);
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "png";
  if (startsWith(0xff, 0xd8, 0xff)) return "jpg";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "gif";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (b.length > 4 && b.toString("ascii", 0, 4) === "glTF") return "glb";
  if (b.length > 12 && b.toString("ascii", 4, 8) === "ftyp") return "mp4";
  if (b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  const named = path.extname(file.filename || "").slice(1).toLowerCase();
  if (named) return named;
  if (kind === "scene") return "glb"; // the app saves scene JSON under a .glb name
  return "bin";
}

function mediaClassFor(ext, kind) {
  if (["png", "jpg", "gif", "webp"].includes(ext)) return "image";
  if (["mp4", "webm"].includes(ext)) return "video";
  if (kind === "scene") return "dimensional";
  return "dimensional";
}

function mediaTypeFor(ext, kind) {
  if (kind === "scene") return "scene_json";
  if (ext === "jpg") return "jpg";
  return ext;
}

function deleteMedia(token) {
  const record = media[token];
  if (!record) return false;
  fs.rmSync(path.join(MEDIA_DIR, record.file_name), { force: true });
  delete media[token];
  saveIndex();
  return true;
}

// ---------------------------------------------------------------------------------------------
// Responses in the shapes the app reads
// ---------------------------------------------------------------------------------------------

function sessionUser() {
  return {
    core_info: {
      user_token: LOCAL_USER.user_token,
      username: LOCAL_USER.username,
      display_name: LOCAL_USER.display_name,
      gravatar_hash: LOCAL_USER.email_gravatar_hash,
      default_avatar: { image_index: 0, color_index: 0 },
    },
    user_token: LOCAL_USER.user_token,
    username: LOCAL_USER.username,
    display_name: LOCAL_USER.display_name,
    email_gravatar_hash: LOCAL_USER.email_gravatar_hash,
    onboarding: {},
    can_access_studio: true,
    maybe_feature_flags: [],
  };
}

function findMediaFileInfo(token) {
  const record = media[token] || scanBuiltins()[token];
  return record ? mediaFileInfo(record) : null;
}

function mediaFileInfo(r) {
  const urlPath = r.url_path || `/media/${r.file_name}`;
  const cdnUrl = `${BASE_URL}${urlPath}`;
  const isImage = r.media_class === "image";
  // The app swaps {WIDTH} in thumbnail templates; with no placeholder it simply uses the full image.
  const thumbnailTemplate = isImage ? cdnUrl : null;
  const cover = r.cover_image_token ? media[r.cover_image_token] : null;
  const coverUrl = cover ? `${BASE_URL}/media/${cover.file_name}` : null;
  return {
    token: r.token,
    media_class: r.media_class,
    media_type: r.media_type,
    maybe_engine_category: r.maybe_engine_category,
    maybe_animation_type: r.maybe_animation_type,
    maybe_engine_extension: r.extension,
    maybe_batch_token: null,
    maybe_scene_source_media_file_token: null,
    public_bucket_path: urlPath,
    public_bucket_url: cdnUrl,
    media_links: {
      cdn_url: cdnUrl,
      maybe_thumbnail_template: thumbnailTemplate,
      thumbnail_template: thumbnailTemplate,
      maybe_video_previews: null,
    },
    cover_image: {
      maybe_cover_image_public_bucket_path: cover ? `/media/${cover.file_name}` : null,
      maybe_links: coverUrl ? { cdn_url: coverUrl, maybe_thumbnail_template: coverUrl } : null,
      default_cover: { image_index: 0, color_index: 0 },
    },
    maybe_model_weight_info: null,
    maybe_creator_user: {
      user_token: LOCAL_USER.user_token,
      username: LOCAL_USER.username,
      display_name: LOCAL_USER.display_name,
      gravatar_hash: LOCAL_USER.email_gravatar_hash,
      default_avatar: { image_index: 0, color_index: 0 },
    },
    creator_set_visibility: "public",
    is_user_upload: !r.is_builtin,
    is_intermediate_system_file: r.is_intermediate_system_file,
    maybe_title: r.maybe_title,
    maybe_text_transcript: null,
    maybe_original_filename: r.maybe_original_filename,
    maybe_duration_millis: r.maybe_duration_millis,
    maybe_prompt_token: null,
    origin_category: "upload",
    origin_product_category: "unknown",
    is_emulated_media_file: false,
    is_featured: Boolean(r.is_builtin),
    stats: { positive_rating_count: 0, bookmark_count: 0 },
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function listUserMedia(params) {
  const csv = (name) => (params.get(name) || "").split(",").map((s) => s.trim()).filter(Boolean);
  const classes = csv("filter_media_classes");
  const categories = csv("filter_engine_categories");
  const types = csv("filter_media_type");
  const pageSize = Math.max(1, Number(params.get("page_size") || 100));
  const pageIndex = Math.max(0, Number(params.get("page_index") || 0));

  const all = Object.values(media)
    .filter((r) => !classes.length || classes.includes(r.media_class))
    .filter((r) => !categories.length || categories.includes(r.maybe_engine_category))
    .filter((r) => !types.length || types.includes(r.media_type))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const pageCount = Math.max(1, Math.ceil(all.length / pageSize));
  const results = all.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize).map(mediaFileInfo);
  return {
    success: true,
    results,
    pagination: {
      current: pageIndex,
      total_page_count: pageCount,
      maybe_next: pageIndex + 1 < pageCount ? String(pageIndex + 1) : null,
    },
  };
}

// The asset menu's built-in lists (characters, objects, locations, creatures, image planes).
function listFeatured(params) {
  const csv = (name) => (params.get(name) || "").split(",").map((s) => s.trim()).filter(Boolean);
  const categories = csv("filter_engine_categories");
  const types = csv("filter_media_type");
  const results = Object.values(scanBuiltins())
    .filter((r) => !categories.length || categories.includes(r.maybe_engine_category))
    .filter((r) => !types.length || types.includes(r.media_type))
    .sort((a, b) => a.maybe_title.localeCompare(b.maybe_title))
    .map(mediaFileInfo);
  return { success: true, results, pagination: emptyPagination() };
}

function emptyPagination() {
  return { current: 0, total_page_count: 0, maybe_next: null };
}

// ---------------------------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------------------------

function corsHeaders(req) {
  return {
    "Access-Control-Allow-Origin": req.headers.origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] || "Content-Type, Accept, session",
    "Vary": "Origin",
  };
}

function sendCorsPreflight(req, res) {
  res.writeHead(204, corsHeaders(req));
  res.end();
}

function sendJson(req, res, status, body) {
  res.writeHead(status, { ...corsHeaders(req), "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const CONTENT_TYPES = {
  png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", webm: "video/webm", glb: "model/gltf-binary", json: "application/json",
};

function sendMediaFile(req, res, name) {
  if (!/^[A-Za-z0-9_]+\.[a-z0-9]+$/.test(name)) return sendJson(req, res, 400, { success: false });
  const file = path.join(MEDIA_DIR, name);
  if (!fs.existsSync(file)) return sendJson(req, res, 404, { success: false });
  const ext = path.extname(name).slice(1);
  res.writeHead(200, {
    ...corsHeaders(req),
    "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
    "Content-Length": fs.statSync(file).size,
  });
  fs.createReadStream(file).pipe(res);
}

function sendBuiltinFile(req, res, rest) {
  const [category, ...nameParts] = rest.split("/");
  const name = decodeURIComponent(nameParts.join("/"));
  if (!BUILTIN_CATEGORIES.includes(category) || !name || name.includes("/") || name.includes("\\") || name.startsWith(".")) {
    return sendJson(req, res, 400, { success: false });
  }
  const file = path.join(BUILTIN_DIR, category, name);
  if (!fs.existsSync(file)) return sendJson(req, res, 404, { success: false });
  const ext = path.extname(name).slice(1).toLowerCase();
  res.writeHead(200, {
    ...corsHeaders(req),
    "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
    "Content-Length": fs.statSync(file).size,
  });
  fs.createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const body = await readBody(req);
  try {
    return JSON.parse(body.toString("utf8") || "{}");
  } catch {
    return {};
  }
}

// Minimal multipart/form-data parser: text fields go to `fields`, file parts to `files`.
function parseMultipart(contentType, body) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const result = { fields: {}, files: {} };
  if (!match) return result;
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  let start = body.indexOf(boundary);
  while (start !== -1) {
    const next = body.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    let part = body.subarray(start + boundary.length, next);
    if (part[0] === 0x0d && part[1] === 0x0a) part = part.subarray(2);
    if (part.at(-2) === 0x0d && part.at(-1) === 0x0a) part = part.subarray(0, -2);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString("utf8");
      const data = part.subarray(headerEnd + 4);
      const name = headers.match(/name="([^"]*)"/i)?.[1];
      const filename = headers.match(/filename="([^"]*)"/i)?.[1];
      if (name !== undefined) {
        if (filename !== undefined) result.files[name] = { filename, data };
        else result.fields[name] = data.toString("utf8");
      }
    }
    start = next;
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------------------------

function newToken() {
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  const bytes = crypto.randomBytes(30);
  return "m_" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// Read the built-in folders fresh each time, so adding a model needs no restart.
// A file's token is derived from its category and name, so it stays the same across restarts.
function scanBuiltins() {
  const found = {};
  for (const category of BUILTIN_CATEGORIES) {
    const dir = path.join(BUILTIN_DIR, category);
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const ext = path.extname(name).slice(1).toLowerCase();
      const allowed = category === "image_plane" ? ["png", "jpg", "jpeg"] : ["glb"];
      if (!allowed.includes(ext)) continue;
      const stat = fs.statSync(path.join(dir, name));
      const hash = crypto.createHash("sha1").update(`${category}/${name}`).digest("hex").slice(0, 22);
      const token = `m_builtin${hash}`;
      found[token] = {
        token,
        is_builtin: true,
        url_path: `/builtin/${category}/${encodeURIComponent(name)}`,
        file_name: name,
        extension: ext,
        media_class: category === "image_plane" ? "image" : "dimensional",
        media_type: ext === "jpeg" ? "jpg" : ext,
        maybe_engine_category: category,
        maybe_animation_type: null,
        maybe_duration_millis: null,
        maybe_title: path.basename(name, path.extname(name)).replace(/[-_]+/g, " "),
        is_intermediate_system_file: false,
        maybe_original_filename: name,
        cover_image_token: null,
        created_at: stat.mtime.toISOString(),
        updated_at: stat.mtime.toISOString(),
      };
    }
  }
  return found;
}

function loadIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveIndex() {
  const tmp = `${INDEX_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(media, null, 2));
  fs.renameSync(tmp, INDEX_FILE);
}
