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

// Like edit(), for changes made of line-for-line replacements. Each replacement lists the text it may start
// from (the original code first, then what older versions of this script wrote) and the text to end with.
function swap(label, relPath, done, replacements) {
  edit(label, relPath, done, (text, eol) => {
    for (const { from, to } of replacements) {
      const found = from.map((lines) => lines.join(eol)).find((candidate) => text.includes(candidate));
      if (found === undefined) return null;
      text = text.replace(found, to.join(eol));
    }
    return text;
  });
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

// 3c. Start on the configured backend from the very first request. The desktop app tells the page its backend
//     address before any page code runs (window.__ARTCRAFT_API_HOST__); app/.env.local is the fallback.
//     Without this, the app's first requests go to api.storyteller.ai before it switches over.
swap(
  "Start on your own backend from the first request",
  "frontend/libs/api/src/lib/config/StorytellerApiHostStore.ts",
  (t) => t.includes("__ARTCRAFT_API_HOST__"),
  [
    {
      from: [
        [
          'const DEFAULT_API_HOST_PRODUCTION = "https://api.storyteller.ai";',
          "// Optional starting host (VITE_STORYTELLER_API_HOST in app/.env.local), so a local backend is used",
          "// from the first request instead of only after the async sync with Tauri.",
          "const CONFIGURED_API_HOST: string | undefined = (import.meta as any).env?.VITE_STORYTELLER_API_HOST;",
        ],
        ['const DEFAULT_API_HOST_PRODUCTION = "https://api.storyteller.ai";'],
      ],
      to: [
        'const DEFAULT_API_HOST_PRODUCTION = "https://api.storyteller.ai";',
        "// Optional starting host (VITE_STORYTELLER_API_HOST in app/.env.local), so a local backend is used",
        "// from the first request instead of only after the async sync with Tauri.",
        "const CONFIGURED_API_HOST: string | undefined = (import.meta as any).env?.VITE_STORYTELLER_API_HOST;",
      ],
    },
    {
      from: [
        ["    const instance = new StorytellerApiHostStore(CONFIGURED_API_HOST || DEFAULT_API_HOST_PRODUCTION);"],
        ["    const instance = new StorytellerApiHostStore(DEFAULT_API_HOST_PRODUCTION);"],
      ],
      to: [
        "    // artcraft-local: the desktop app sets window.__ARTCRAFT_API_HOST__ before the page loads.",
        "    const desktopApiHost: string | undefined = (window as any).__ARTCRAFT_API_HOST__;",
        "    const instance = new StorytellerApiHostStore(desktopApiHost || CONFIGURED_API_HOST || DEFAULT_API_HOST_PRODUCTION);",
      ],
    },
  ],
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

// 5. Thumbnails and other file links: use the app's own backend instead of ArtCraft's CDN whenever the backend
//    isn't ArtCraft's servers.
swap(
  "Use your own backend for file links and thumbnails",
  "frontend/apps/artcraft/app/src/api/GetCdnOrigin.ts",
  (t) => t.includes("A backend other than ArtCraft's (e.g. the artcraft-local backend) serves its own files"),
  [
    {
      from: [
        ["// TODO(bt,2025-05-15): Remove this code", "", 'import { StorytellerApiHostStore } from "@storyteller/api";'],
        ["// TODO(bt,2025-05-15): Remove this code"],
      ],
      to: ["// TODO(bt,2025-05-15): Remove this code", "", 'import { StorytellerApiHostStore } from "@storyteller/api";'],
    },
    {
      from: [
        [
          "export function GetCdnOrigin() : string {",
          "  // A local backend (http://localhost:PORT) serves its own files, so its paths never go to the public CDN.",
          "  const apiHost = StorytellerApiHostStore.getInstance().getApiSchemeAndHost();",
          '  if (apiHost.startsWith("http://localhost")) {',
          "    return apiHost;",
          "  }",
          "  return CdnHostHelper.getInstance().getOrigin();",
        ],
        ["export function GetCdnOrigin() : string {", "  return CdnHostHelper.getInstance().getOrigin();"],
      ],
      to: [
        "export function GetCdnOrigin() : string {",
        "  // A backend other than ArtCraft's (e.g. the artcraft-local backend) serves its own files, so its paths",
        "  // never go to the public CDN.",
        "  const apiHost = StorytellerApiHostStore.getInstance().getApiSchemeAndHost();",
        '  if (apiHost !== "https://api.storyteller.ai") {',
        "    return apiHost;",
        "  }",
        "  return CdnHostHelper.getInstance().getOrigin();",
      ],
    },
  ],
);
swap(
  "Use your own backend for resized thumbnails",
  "frontend/apps/artcraft/app/src/api/BucketConfig.ts",
  (t) => t.includes("GetCdnOrigin() returns the app's own backend when it isn't ArtCraft's servers."),
  [
    {
      from: [
        [
          "    // GetCdnOrigin() returns the local backend when the app is pointed at one.",
          "    const cdnOrigin = GetCdnOrigin();",
          '    const cndBasePath = cdnOrigin.startsWith("http://localhost")',
          "      ? cdnOrigin",
          "      : environmentVariables.values.CDN_API;",
        ],
        ["    const cndBasePath = environmentVariables.values.CDN_API;"],
      ],
      to: [
        "    // GetCdnOrigin() returns the app's own backend when it isn't ArtCraft's servers.",
        "    const cdnOrigin = GetCdnOrigin();",
        '    const cndBasePath = cdnOrigin !== "https://cdn-2.fakeyou.com"',
        "      ? cdnOrigin",
        "      : environmentVariables.values.CDN_API;",
      ],
    },
  ],
);

// 5b. The connection guard: route all of the app's internet traffic through the guard in server.mjs.
const patchesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "patches");
const readPatch = (name, eol) => fs.readFileSync(path.join(patchesDir, name), "utf8").replace(/\r?\n/g, eol);
// Copy a whole new file from patches/ into the ArtCraft code (and update it if an older copy is there).
function copyPatch(label, patchName, relPath) {
  const target = path.join(root, relPath);
  const wanted = fs.readFileSync(path.join(patchesDir, patchName), "utf8");
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") : null;
  if (current === wanted) {
    console.log(`ALREADY    ${label}`);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, wanted, "utf8");
  console.log(`DONE       ${label}${current === null ? "" : " (updated)"}`);
}
edit(
  "Send the app's internet traffic through the connection guard",
  "crates/desktop/artcraft/src/main.rs",
  (t) => t.includes("fn route_through_connection_guard()"),
  (t, eol) => {
    const before = ["fn main() {", "  artcraft_app_lib::run();", "}"].join(eol);
    if (!t.includes(before)) return null;
    const after = ["fn main() {", "  route_through_connection_guard();", "  artcraft_app_lib::run();", "}"].join(eol);
    return t.replace(before, after).replace(/\s*$/, "") + eol + eol + readPatch("main-connection-guard.rs", eol).replace(/\s*$/, "") + eol;
  },
);
edit(
  "Report the interface's own outside loads to the connection guard",
  "frontend/apps/artcraft/app/index.html",
  (t) => t.includes("artcraft-local page monitor"),
  (t, eol) => {
    const anchor = '<meta name="viewport" content="width=device-width, initial-scale=1" />';
    if (!t.includes(anchor)) return null;
    const monitor = readPatch("index-page-monitor.html", eol).replace(/\s*$/, "").replace("http://localhost:12345", `http://localhost:${port}`);
    return t.replace(anchor, anchor + eol + eol + monitor);
  },
);
// 5c. The Connections pane in Settings: backend, connection guard, API keys, signed-in services, local AI.
{
  const label = "Add the Connections pane to Settings";
  const target = path.join(root, "frontend/libs/components/settings-modal/src/lib/panes/ConnectionsSettingsPane.tsx");
  const wanted = fs.readFileSync(path.join(patchesDir, "ConnectionsSettingsPane.tsx"), "utf8");
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") : null;
  if (current === wanted) {
    console.log(`ALREADY    ${label} (pane file)`);
  } else {
    fs.writeFileSync(target, wanted, "utf8");
    console.log(`DONE       ${label} (pane file${current === null ? "" : ", updated"})`);
  }
}
edit(
  "Add the Connections pane to Settings (menu entry)",
  "frontend/libs/components/settings-modal/src/lib/settings-modal.tsx",
  (t) => t.includes("ConnectionsSettingsPane"),
  (t, eol) => {
    const steps = [
      [
        'import { CreditCardIcon, DownloadIcon, FlaskConicalIcon, InfoIcon, KeyboardIcon, PaletteIcon, SettingsIcon, UserIcon, Volume2Icon } from "lucide-react";',
        'import { CreditCardIcon, DownloadIcon, FlaskConicalIcon, InfoIcon, KeyboardIcon, PaletteIcon, SettingsIcon, ShieldCheckIcon, UserIcon, Volume2Icon } from "lucide-react";',
      ],
      [
        'import { AppearanceSettingsPane } from "./panes/AppearanceSettingsPane";',
        'import { AppearanceSettingsPane } from "./panes/AppearanceSettingsPane";' + eol + 'import { ConnectionsSettingsPane } from "./panes/ConnectionsSettingsPane";',
      ],
      ['  | "accounts"', '  | "accounts"' + eol + '  | "connections"'],
      [
        '    { id: "accounts" as const, label: "Accounts", icon: UserIcon },',
        '    { id: "accounts" as const, label: "Accounts", icon: UserIcon },' + eol + '    { id: "connections" as const, label: "Connections", icon: ShieldCheckIcon },',
      ],
      ['      case "about":', '      case "connections":' + eol + "        return <ConnectionsSettingsPane />;" + eol + '      case "about":'],
    ];
    if (!steps.every(([before]) => t.includes(before))) return null;
    return steps.reduce((text, [before, after]) => text.replace(before, after), t);
  },
);

{
  // Default guard settings: on and logging, not blocking. Never overwrites settings you already have.
  const settingsFile = path.join(dataDir, "settings", "connections.json");
  if (fs.existsSync(settingsFile)) {
    console.log("ALREADY    Connection guard settings (Artcraft/settings/connections.json)");
  } else {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    const defaults = { version: 1, guard: { enabled: true, port: 12346, block_unknown_hosts: false, approved_hosts: [] } };
    fs.writeFileSync(settingsFile, JSON.stringify(defaults, null, 2) + "\n", "utf8");
    console.log("DONE       Connection guard settings (Artcraft/settings/connections.json)");
  }
}

// 5d. fal: upload input images fal can't reach (this computer, the local network) to fal's storage first.
copyPatch("fal: upload input images it can't reach (new file)", "fal_upload.rs",
  "crates/desktop/artcraft/src/core/commands/generate/generate_image/providers/artcraft_router/utils/fal_upload.rs");
swap(
  "fal: upload input images it can't reach (module)",
  "crates/desktop/artcraft/src/core/commands/generate/generate_image/providers/artcraft_router/utils/mod.rs",
  (t) => t.includes("pub mod fal_upload;"),
  [{ from: [["pub mod convert_enums_to_router;"]], to: ["pub mod convert_enums_to_router;", "pub mod fal_upload;"] }],
);
swap(
  "fal: upload input images it can't reach (use it)",
  "crates/desktop/artcraft/src/core/commands/generate/generate_image/providers/artcraft_router/handle_api_providers.rs",
  (t) => t.includes("upload_unreachable_images_to_fal"),
  [
    {
      from: [["use crate::core::commands::generate::generate_image::providers::artcraft_router::utils::map_media_files_to_urls::map_media_file_tokens_to_cdn_urls;"]],
      to: [
        "use crate::core::commands::generate::generate_image::providers::artcraft_router::utils::fal_upload::upload_unreachable_images_to_fal;",
        "use crate::core::commands::generate::generate_image::providers::artcraft_router::utils::map_media_files_to_urls::map_media_file_tokens_to_cdn_urls;",
      ],
    },
    {
      from: [["  let image_inputs = resolve_image_inputs(request, api_host).await?;"]],
      to: [
        "  let image_inputs = resolve_image_inputs(request, api_host).await?;",
        "  // artcraft-local: fal can't download images from this computer or the local network; upload those first.",
        "  let image_inputs = match image_inputs {",
        "    Some(ImageListRef::Urls(urls)) => Some(ImageListRef::Urls(upload_unreachable_images_to_fal(urls, api_key).await?)),",
        "    other => other,",
        "  };",
      ],
    },
  ],
);

// 5e. Any backend address: a "custom" backend type, the env_configs.json field, the Settings command, and
//     telling the page the address before it loads.
swap(
  "Any backend address (address type)",
  "crates/api_clients/artcraft/artcraft_client/src/utils/api_host.rs",
  (t) => t.includes("Custom { scheme_and_host: String }"),
  [
    {
      from: [["  Localhost { port: u32 },", "}"]],
      to: ["  Localhost { port: u32 },", '  /// artcraft-local: any backend address, e.g. "http://192.168.1.20:12345" (scheme and host, no path).', "  Custom { scheme_and_host: String },", "}"],
    },
    {
      from: [['      ApiHost::Localhost { port } => format!("localhost:{}", port),']],
      to: [
        '      ApiHost::Localhost { port } => format!("localhost:{}", port),',
        '      ApiHost::Custom { scheme_and_host } => scheme_and_host.split("://").nth(1).unwrap_or(scheme_and_host).to_string(),',
      ],
    },
    {
      from: [['      ApiHost::Localhost { port } => format!("http://localhost:{}", port),']],
      to: ['      ApiHost::Localhost { port } => format!("http://localhost:{}", port),', "      ApiHost::Custom { scheme_and_host } => scheme_and_host.clone(),"],
    },
    {
      from: [["      ApiHost::Localhost { .. } => ARTCRAFT_DESKTOP_DEVELOPMENT_ORIGIN,"]],
      to: ["      ApiHost::Localhost { .. } => ARTCRAFT_DESKTOP_DEVELOPMENT_ORIGIN,", "      ApiHost::Custom { .. } => ARTCRAFT_DESKTOP_DEVELOPMENT_ORIGIN,"],
    },
    {
      from: [["      ApiHost::Localhost { .. } => HTTP_SCHEME,"]],
      to: [
        "      ApiHost::Localhost { .. } => HTTP_SCHEME,",
        '      ApiHost::Custom { scheme_and_host } => if scheme_and_host.starts_with("https://") { HTTPS_SCHEME } else { HTTP_SCHEME },',
      ],
    },
  ],
);
swap(
  "Any backend address (login client)",
  "crates/api_clients/artcraft/artcraft_client/src/utils/login_challenge_client.rs",
  (t) => t.includes("ApiHost::Custom { .. } => false,"),
  [{ from: [["      ApiHost::FakeYou => false,"]], to: ["      ApiHost::FakeYou => false,", "      ApiHost::Custom { .. } => false,"] }],
);
swap(
  "Any backend address (settings file field)",
  "crates/desktop/artcraft/src/core/state/app_env_configs/app_env_configs_serializeable.rs",
  (t) => t.includes("pub storyteller_url: Option<String>,"),
  [
    {
      from: [["  pub storyteller_host: Option<StorytellerApiHost>,", "}"]],
      to: [
        "  pub storyteller_host: Option<StorytellerApiHost>,",
        '  /// artcraft-local: any backend address ("http://192.168.1.20:12345"). Takes priority over the two above.',
        '  #[serde(default, skip_serializing_if = "Option::is_none")]',
        "  pub storyteller_url: Option<String>,",
        "}",
      ],
    },
    {
      from: [["    let data: Self = serde_json::from_str(&contents)?;", "    Ok(Some(data))", "  }"]],
      to: [
        "    let data: Self = serde_json::from_str(&contents)?;",
        "    Ok(Some(data))",
        "  }",
        "",
        "  /// artcraft-local: save a backend address chosen in Settings. `None` goes back to ArtCraft's servers.",
        "  pub fn save_backend_url(app_data_root: &AppDataRoot, maybe_url: Option<String>) -> AnyhowResult<()> {",
        "    let data = Self {",
        "      version: Some(CURRENT_VERSION.to_string()),",
        "      storyteller_port: None,",
        "      storyteller_host: Some(if maybe_url.is_some() { StorytellerApiHost::Localhost } else { StorytellerApiHost::Production }),",
        "      storyteller_url: maybe_url,",
        "    };",
        "    let filename = app_data_root.settings_dir().get_app_env_configs_path();",
        "    std::fs::write(filename, serde_json::to_string_pretty(&data)?)?;",
        "    Ok(())",
        "  }",
      ],
    },
  ],
);
edit(
  "Any backend address (reading it)",
  "crates/desktop/artcraft/src/core/state/app_env_configs/app_env_configs.rs",
  (t) => t.includes("pub fn parse_backend_url("),
  (t, eol) => {
    const match = ["    let storyteller_api = match storyteller {"].join(eol);
    const fallback = ["      _ => ApiHost::Storyteller,", "    };"].join(eol);
    if (!t.includes(match) || !t.includes(fallback)) return null;
    return t
      .replace(match, [
        "    // artcraft-local: an explicit backend address wins over the older host/port fields.",
        "    let maybe_custom = input.as_ref()",
        "        .and_then(|i| i.storyteller_url.as_deref())",
        "        .and_then(|url| {",
        "          let parsed = parse_backend_url(url);",
        "          if parsed.is_none() {",
        '            println!("Ignoring invalid storyteller_url in env_configs.json: {:?}", url);',
        "          }",
        "          parsed",
        "        });",
        "",
        "    let storyteller_api = match storyteller {",
      ].join(eol))
      .replace(fallback, [fallback, "    let storyteller_api = maybe_custom.unwrap_or(storyteller_api);"].join(eol))
      .replace(/\s*$/, "") + eol + eol + readPatch("app_env_configs_parse_backend_url.rs", eol).replace(/\s*$/, "") + eol;
  },
);
copyPatch("Any backend address (Settings command, new file)", "backend_address_command.rs",
  "crates/desktop/artcraft/src/core/commands/backend_address_command.rs");
swap(
  "Any backend address (Settings command, module)",
  "crates/desktop/artcraft/src/core/commands/mod.rs",
  (t) => t.includes("pub mod backend_address_command;"),
  [{ from: [["pub mod app_state;"]], to: ["pub mod app_state;", "pub mod backend_address_command;"] }],
);
swap(
  "Any backend address (Settings command, registration)",
  "crates/desktop/artcraft/src/lib.rs",
  (t) => t.includes("set_backend_address_command"),
  [
    {
      from: [["use crate::core::commands::providers::provider_set_api_key_command::provider_set_api_key_command;"]],
      to: [
        "use crate::core::commands::providers::provider_set_api_key_command::provider_set_api_key_command;",
        "use crate::core::commands::backend_address_command::set_backend_address_command;",
      ],
    },
    { from: [["    provider_set_api_key_command,"]], to: ["    provider_set_api_key_command,", "    set_backend_address_command,"] },
  ],
);
swap(
  "Any backend address (tell the page before it loads)",
  "crates/desktop/artcraft/src/core/lifecycle/startup/setup_main_window.rs",
  (t) => t.includes("__ARTCRAFT_API_HOST__"),
  [
    {
      from: [["use crate::core::windows::main_window::constants::MAIN_WINDOW_NAME;"]],
      to: ["use crate::core::state::app_env_configs::app_env_configs::AppEnvConfigs;", "use crate::core::windows::main_window::constants::MAIN_WINDOW_NAME;"],
    },
    {
      from: [["use tauri::{AppHandle, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};"]],
      to: ["use tauri::{AppHandle, Manager, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};"],
    },
    {
      from: [["          .inner_size(2400.0, 1300.0);"]],
      to: [
        "          .inner_size(2400.0, 1300.0);",
        "",
        "  // artcraft-local: tell the interface its backend address before any of its code runs, so its first",
        "  // requests already go to the configured backend rather than the built-in default.",
        "  let api_host = app.state::<AppEnvConfigs>().storyteller_host.to_api_hostname_and_scheme();",
        "  let win_builder = win_builder.initialization_script(&format!(",
        '    "window.__ARTCRAFT_API_HOST__ = {};",',
        "    serde_json::to_string(&api_host)?",
        "  ));",
      ],
    },
  ],
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
