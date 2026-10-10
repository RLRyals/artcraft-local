// local-only.mjs: set up a personal copy of ArtCraft so nothing is sent to ArtCraft's servers.
// Run:   node ~/artcraft-local/local-only.mjs
// It finds the ArtCraft code in the current folder or in an "artcraft" folder next to artcraft-local.
// Safe to run more than once. Undo the code edits with:   git checkout -- .   (in the artcraft folder)
//
// Options:
//   --root <path>       the ArtCraft code folder, if it is somewhere else
//   --keep-discord      leave the Discord "Using ArtCraft" status on
//   --port 12345        port of your own backend (default 12345)
//   --data-dir <path>   ArtCraft data folder (default: <home>/Artcraft)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const isArtcraft = (dir) => fs.existsSync(path.join(dir, "frontend")) && fs.existsSync(path.join(dir, "crates"));
const besideScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "artcraft");
const root = opt("--root", isArtcraft(process.cwd()) ? process.cwd() : besideScript);
const port = Number(opt("--port", "12345"));
const dataDir = opt("--data-dir", path.join(os.homedir(), "Artcraft"));

if (!isArtcraft(root)) {
  console.error(`Could not find the ArtCraft code (no frontend/ and crates/ in ${root}).`);
  console.error("Run this from inside the artcraft folder, or pass --root <path to artcraft>.");
  process.exit(1);
}
console.log(`ArtCraft code: ${root}\n`);

let problems = 0;

// Edit one file. `done` tells whether the change is already there; `apply` returns the new text or null.
function edit(label, relPath, done, apply) {
  const file = path.join(root, relPath);
  if (!fs.existsSync(file)) {
    console.log(`NOT FOUND  ${label}: ${relPath} is missing`);
    problems++;
    return;
  }
  const text = fs.readFileSync(file, "utf8");
  if (done(text)) {
    console.log(`ALREADY    ${label}`);
    return;
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const next = apply(text, eol);
  if (next === null || next === text) {
    console.log(`SKIPPED    ${label}: the code has changed upstream; this step needs updating`);
    problems++;
    return;
  }
  fs.writeFileSync(file, next, "utf8");
  console.log(`DONE       ${label}`);
}

// 1. Google Analytics -> do-nothing stub (the app calls gtag() and would error without it).
//    Microsoft Clarity -> removed.
edit(
  "Turn off Google Analytics and Microsoft Clarity",
  "frontend/apps/artcraft/app/index.html",
  (t) => !t.includes("googletagmanager.com") && !t.includes("clarity.ms"),
  (t, eol) => {
    const ga = /<!-- Google tag \(gtag\.js\) -->[\s\S]*?<\/script>\s*<script>[\s\S]*?<\/script>/;
    const clarity = /\s*<!-- Microsoft Clarity -->\s*<script[^>]*>[\s\S]*?<\/script>/;
    if (!ga.test(t) && !clarity.test(t)) return null;
    return t
      .replace(ga, `<!-- Google Analytics disabled: no-op stub so the app's gtag() calls do nothing -->${eol}  <script>window.dataLayer = []; function gtag() {}</script>`)
      .replace(clarity, "");
  },
);

// 2. Discord status (optional).
if (!args.includes("--keep-discord")) {
  edit(
    "Turn off Discord status",
    "crates/desktop/artcraft/src/core/lifecycle/startup/handle_tauri_startup.rs",
    (t) => t.includes("// spawn_discord_presence_thread()?;"),
    (t) => (t.includes("  spawn_discord_presence_thread()?;")
      ? t.replace("  spawn_discord_presence_thread()?;", "  // spawn_discord_presence_thread()?;")
      : null),
  );
}

// 3. "Continue without an account" on the sign-in screen, which otherwise cannot be dismissed.
edit(
  "Add \"Continue without an account\" to the sign-in screen",
  "frontend/libs/components/login-modal/src/lib/login-modal.tsx",
  (t) => t.includes("Continue without an account"),
  (t, eol) => {
    const anchor = /(isLoading=\{isLoading\}\r?\n\s*\/>\})(\r?\n)/;
    if (!anchor.test(t)) return null;
    const pad = "                          ";
    const button = [
      `${pad}{!isChallengeActive && (`,
      `${pad}  <button`,
      `${pad}    type="button"`,
      `${pad}    onClick={handleClose}`,
      `${pad}    className="mt-6 w-full text-center font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50 transition-colors hover:text-white"`,
      `${pad}  >`,
      `${pad}    Continue without an account`,
      `${pad}  </button>`,
      `${pad})}`,
    ].join(eol);
    return t
      .replace(anchor, `$1${eol}${button}$2`)
      .replace(
        "(no dismiss control — login is required)",
        "(dismissed only via \"Continue without an account\")",
      );
  },
);

// 3b. The sign-in screen's demo video: use the copy bundled with the app instead of ArtCraft's CDN.
edit(
  "Use the bundled demo video on the sign-in screen",
  "frontend/libs/components/login-modal/src/lib/login-modal.tsx",
  (t) => !t.includes("https://frontend-cdn.fakeyou.com/videos/knight-video.mp4"),
  (t) => t.replace(
    '"https://frontend-cdn.fakeyou.com/videos/knight-video.mp4"',
    '"/resources/videos/artcraft-3d-demo.mp4"',
  ),
);

// 3c. Start on the local backend from the very first request. Without this, the app's first requests go to
//     api.storyteller.ai while it waits to hear the configured address from the desktop side.
edit(
  "Start on your own backend from the first request",
  "frontend/libs/api/src/lib/config/StorytellerApiHostStore.ts",
  (t) => t.includes("VITE_STORYTELLER_API_HOST"),
  (t, eol) => {
    const constant = 'const DEFAULT_API_HOST_PRODUCTION = "https://api.storyteller.ai";';
    const use = "new StorytellerApiHostStore(DEFAULT_API_HOST_PRODUCTION);";
    if (!t.includes(constant) || !t.includes(use)) return null;
    return t
      .replace(constant, [
        constant,
        "// Optional starting host (VITE_STORYTELLER_API_HOST in app/.env.local), so a local backend is used",
        "// from the first request instead of only after the async sync with Tauri.",
        "const CONFIGURED_API_HOST: string | undefined = (import.meta as any).env?.VITE_STORYTELLER_API_HOST;",
      ].join(eol))
      .replace(use, "new StorytellerApiHostStore(CONFIGURED_API_HOST || DEFAULT_API_HOST_PRODUCTION);");
  },
);
{
  // The setting itself lives in app/.env.local, which git ignores, so it never blocks `git pull`.
  const envFile = path.join(root, "frontend/apps/artcraft/app/.env.local");
  const line = `VITE_STORYTELLER_API_HOST=http://localhost:${port}`;
  const current = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  if (current.split(/\r?\n/).includes(line)) {
    console.log("ALREADY    Starting address setting (frontend/apps/artcraft/app/.env.local)");
  } else {
    const kept = current.split(/\r?\n/).filter((l) => l && !l.startsWith("VITE_STORYTELLER_API_HOST="));
    fs.writeFileSync(envFile, [...kept, line, ""].join("\n"), "utf8");
    console.log("DONE       Starting address setting (frontend/apps/artcraft/app/.env.local)");
  }
}

// 4. Load saved scenes from the backend's own file address, not a hard-coded ArtCraft CDN.
edit(
  "Load saved scenes from your own backend",
  "frontend/apps/artcraft/app/src/pages/PageScene/useTauriPageSceneAdapter.tsx",
  (t) => t.includes(`json["media_file"]["media_links"]?.["cdn_url"]`),
  (t, eol) => {
    const before = "  const media_url = `${GetCdnOrigin()}${bucket_path}`;";
    if (!t.includes(before)) return null;
    return t.replace(before, [
      "  const media_url =",
      "    json[\"media_file\"][\"media_links\"]?.[\"cdn_url\"] ?? `${GetCdnOrigin()}${bucket_path}`;",
    ].join(eol));
  },
);

// 5. Thumbnails and other file links: use the local backend instead of ArtCraft's CDN when the app points at one.
edit(
  "Use your own backend for file links and thumbnails",
  "frontend/apps/artcraft/app/src/api/GetCdnOrigin.ts",
  (t) => t.includes("A local backend (http://localhost:PORT) serves its own files"),
  (t, eol) => {
    const header = "// TODO(bt,2025-05-15): Remove this code";
    const body = "export function GetCdnOrigin() : string {" + eol + "  return CdnHostHelper.getInstance().getOrigin();";
    if (!t.includes(header) || !t.includes(body)) return null;
    return t
      .replace(header, [header, "", 'import { StorytellerApiHostStore } from "@storyteller/api";'].join(eol))
      .replace(body, [
        "export function GetCdnOrigin() : string {",
        "  // A local backend (http://localhost:PORT) serves its own files, so its paths never go to the public CDN.",
        "  const apiHost = StorytellerApiHostStore.getInstance().getApiSchemeAndHost();",
        "  if (apiHost.startsWith(\"http://localhost\")) {",
        "    return apiHost;",
        "  }",
        "  return CdnHostHelper.getInstance().getOrigin();",
      ].join(eol));
  },
);
edit(
  "Use your own backend for resized thumbnails",
  "frontend/apps/artcraft/app/src/api/BucketConfig.ts",
  (t) => t.includes("GetCdnOrigin() returns the local backend"),
  (t, eol) => {
    const before = "    const cndBasePath = environmentVariables.values.CDN_API;";
    if (!t.includes(before)) return null;
    return t.replace(before, [
      "    // GetCdnOrigin() returns the local backend when the app is pointed at one.",
      "    const cdnOrigin = GetCdnOrigin();",
      "    const cndBasePath = cdnOrigin.startsWith(\"http://localhost\")",
      "      ? cdnOrigin",
      "      : environmentVariables.values.CDN_API;",
    ].join(eol));
  },
);

// 6. Send every API call and upload to a backend on this computer instead of api.storyteller.ai.
//    Written without a byte-order mark: the app cannot read the file if it has one.
const settingsDir = path.join(dataDir, "settings");
const configFile = path.join(settingsDir, "env_configs.json");
const config = JSON.stringify({ version: "1", storyteller_host: "localhost", storyteller_port: port });
fs.mkdirSync(settingsDir, { recursive: true });
const before = fs.existsSync(configFile) ? fs.readFileSync(configFile, "utf8") : null;
if (before === config) {
  console.log(`ALREADY    Point the app at your own backend (localhost:${port})`);
} else {
  fs.writeFileSync(configFile, config, "utf8");
  console.log(`DONE       Point the app at your own backend (localhost:${port}): ${configFile}`);
}

console.log(problems === 0
  ? "\nAll set. Start (or restart) the app."
  : `\n${problems} step(s) did not apply. See the lines above.`);
process.exit(problems === 0 ? 0 : 1);
