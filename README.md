# artcraft-local

Run the [ArtCraft](https://github.com/storytold/artcraft) desktop app with everything kept on your own
computer: no account, no uploads to ArtCraft's servers (`api.storyteller.ai`), and no analytics.

This repo has two files. Both need only [Node.js](https://nodejs.org) 20 or newer and install no packages.

| File | What it does |
| --- | --- |
| `local-only.mjs` | Changes your own copy of the ArtCraft code: turns off Google Analytics, Microsoft Clarity and the Discord status, adds a **Continue without an account** button, points the app at a backend on your own computer from its very first request, and makes scene loading, thumbnails and the sign-in screen's video use local files instead of ArtCraft's CDN. |
| `server.mjs` | A small stand-in for ArtCraft's backend. It answers the app's requests for sign-in, uploads, the media library, saved scenes and built-in models, and keeps every file in `Artcraft/local-backend` in your home folder. It only accepts connections from your own computer. |

This is an unofficial companion project. It is not made by or affiliated with the ArtCraft team.

## What you need to download

| Repository | Needed? | Why |
| --- | --- | --- |
| [storytold/artcraft](https://github.com/storytold/artcraft) | **Yes, clone it** | The ArtCraft desktop app. You build and run it from your own copy, because the setup script changes its code. Every tool on ArtCraft's Home screen (Create Image, Video, Audio, Image to 3D, Angles, Moodboard, 3D Stage, the editors) lives in this one repository. |
| [RLRyals/artcraft-local](https://github.com/RLRyals/artcraft-local) | **Yes, clone it** | This repo: the setup script and the local backend. |
| [storytold/artcraft-services](https://github.com/storytold/artcraft-services) | No | ArtCraft's own backend. You don't run it; `server.mjs` replaces it. The one file used from it (the OpenPose figure) is a single download in Step 4. |
| ArtCraft's other apps (PhotoCraft, FilmCraft, SoundCraft and the rest) | No | Separate programs. ArtCraft doesn't use them. |

The installed ArtCraft app from getartcraft.com will not work with this setup, because the changes are made to the code before it is built.

## Contents

- [Status](#status)
- [Step 1: Install the build tools](#step-1-install-the-build-tools)
- [Step 2: Get the code and build it](#step-2-get-the-code-and-build-it)
- [Step 3: Run the setup script](#step-3-run-the-setup-script)
- [Step 4: Run the local backend](#step-4-run-the-local-backend)
- [Step 5: Start the app](#step-5-start-the-app)
- [Checking, undoing and updating](#checking-undoing-and-updating)
- [What still talks to the internet](#what-still-talks-to-the-internet)
- [Licensing](#licensing)

## Status

You can build the app, turn off its tracking, keep everything on your own computer, stage 3D scenes with
your own images and a posable OpenPose figure, and save and reopen scenes. Generating images with your own
local models is still being built.

| Part | Status | Notes |
| --- | --- | --- |
| Build the desktop app yourself | Works | Tested on Windows 11. The Mac and Linux steps follow ArtCraft's own Mac/Linux launcher and build setup but are not tested yet. |
| Turn off Google Analytics, Microsoft Clarity, PostHog | Works | PostHog is already off when you run from the dev server, which this guide does. |
| Turn off Discord status | Works | Optional. Only talks to the Discord app on your own computer. |
| Keep all uploads and API calls on your computer | Works | Checked on Windows: from startup on, every request went to `localhost:12345` and none to `api.storyteller.ai`. |
| Get past sign-in, upload images, media library | Works | Click **Continue without an account** and the app treats you as "Local User". |
| Save and reopen scenes | Works | File > Save scene, then File > Load my scene. |
| Place your images, shapes and skyboxes in a 3D scene | Being tested | Drag an uploaded image from the gallery onto the scene. |
| Posable figure | Works | The OpenPose figure from Step 4. Click it in the 3D view, press K (or Enter Pose Mode), drag the joints, then click Done. ArtCraft's own characters live on their servers and are not available. |
| Generate images with your own models (ComfyUI) | Not yet | Next on the list. |
| Use a backend on another machine on your network | Not yet | Needs a small code change to the app. |

## Step 1: Install the build tools

Follow the part for your computer. This takes 20 to 40 minutes, mostly downloading. Installers may ask for
your password or permission; that is expected.

ArtCraft's own setup guide lists only Rust, Node and Tauri. The build also needs CMake and a few other
tools, so they are included here.

### Windows

Open **PowerShell** and paste each block.

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install --id Rustlang.Rustup -e
foreach ($id in "Kitware.CMake","NASM.NASM","LLVM.LLVM","StrawberryPerl.StrawberryPerl","bloodrock.pkg-config-lite") { winget install --id $id -e --accept-source-agreements --accept-package-agreements }
```

LLVM's installer does not tell other programs where it is, so do it yourself:

```powershell
$llvm = "C:\Program Files\LLVM\bin"
$u = [Environment]::GetEnvironmentVariable("Path","User")
if ($u -notlike "*$llvm*") { [Environment]::SetEnvironmentVariable("Path", "$u;$llvm", "User") }
[Environment]::SetEnvironmentVariable("LIBCLANG_PATH", $llvm, "User")
```

### macOS

Open **Terminal**. First Apple's developer tools, then [Homebrew](https://brew.sh) if you don't have it:

```bash
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then the rest:

```bash
brew install git node cmake
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```

### Linux (Ubuntu, Debian, Mint, Pop!_OS)

Open a terminal:

```bash
sudo apt update
sudo apt install -y build-essential curl wget file git cmake clang libclang-dev pkg-config perl libssl-dev libxdo-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Close the terminal, open a new one, then install Node (the version your system ships is often too old):

```bash
nvm install 24
```

On Fedora, Arch or others, install the packages from
[Tauri's Linux prerequisites](https://v2.tauri.app/start/prerequisites/) plus `cmake` and `clang`, then
run the Rust and nvm lines above.

### Everyone: the Tauri tool

**Close your terminal and open a new one** so it finds the new tools. Then (about 5 minutes):

```bash
cargo install tauri-cli --version "^2.10.0" --locked
```

Check that it all worked. Each should print a version number, not an error:

```bash
cargo --version
node --version
cmake --version
cargo tauri --version
```

## Step 2: Get the code and build it

This puts two folders in your home folder: `artcraft` (ArtCraft itself) and `artcraft-local` (this repo).
The first build takes 15 to 40 minutes; later builds are much faster. These commands work the same on all
three systems unless marked.

**1. Download the code:**

```bash
cd ~
git clone https://github.com/storytold/artcraft.git
git clone https://github.com/RLRyals/artcraft-local.git
```

**2. Install the interface's packages** (about 2 minutes; yellow warnings are normal):

```bash
cd ~/artcraft/frontend
npm install
```

**3. Build the app.** Windows (PowerShell):

```powershell
cd ~/artcraft
$env:SQLX_OFFLINE = "true"
cargo build -p artcraft
```

Mac and Linux:

```bash
cd ~/artcraft
SQLX_OFFLINE=true cargo build -p artcraft
```

It is done when the last line says `Finished`. Yellow `warning` lines are normal; a red `error` is not.

**If the build fails** with `is cmake not installed?` or `Unable to find libclang`, your terminal has not
picked up the Step 1 tools. Close it, open a new one, and run step 3 again.

## Step 3: Run the setup script

One script changes your copy of ArtCraft so it keeps everything on your computer. It works the same on
Windows, Mac and Linux:

```bash
node ~/artcraft-local/local-only.mjs
```

You should see `DONE` lines and `All set.` Running it again prints `ALREADY` instead, which is fine. A
`SKIPPED` line means ArtCraft changed that part of its code since the script was written; the other changes
still apply.

What it changes:

1. Turns off Google Analytics and Microsoft Clarity. Google Analytics is replaced by a do-nothing stand-in,
   because the app calls it in several places and would show errors without it.
2. Turns off the "Using ArtCraft" status on your Discord profile (keep it with `--keep-discord`).
3. Adds a **Continue without an account** button to the sign-in screen, which otherwise cannot be closed.
4. Points the app at the local backend on your computer (`localhost:12345`) from its very first request.
   Without this, the app contacts `api.storyteller.ai` at startup before it switches over.
5. Makes saved scenes, thumbnails and the sign-in screen's video load from your computer instead of
   ArtCraft's CDN.

The settings go in two files that git ignores: `Artcraft/settings/env_configs.json` in your home folder and
`frontend/apps/artcraft/app/.env.local` in the ArtCraft code. PostHog, a third tracker, is already off when
you start the app the way Step 5 does.

Options: `--keep-discord`, `--port <number>` (default 12345), `--root <path to artcraft>` if your ArtCraft
folder is somewhere else.

## Step 4: Run the local backend

The local backend is `server.mjs` in this repo. It stands in for ArtCraft's servers on your own computer,
accepts connections from your computer only, and keeps your files in the `Artcraft/local-backend` folder in
your home folder.

**1. Add the posable figure.** This is a one-time 0.8 MB download from ArtCraft's public backend repository.

Mac and Linux:

```bash
mkdir -p ~/Artcraft/local-backend/builtin/character
curl -L -o ~/Artcraft/local-backend/builtin/character/OpenPose-Figure.glb https://raw.githubusercontent.com/storytold/artcraft-services/main/old_assets/resources/models/pose/pose_new.glb
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$HOME/Artcraft/local-backend/builtin/character" | Out-Null
curl.exe -L -o "$HOME/Artcraft/local-backend/builtin/character/OpenPose-Figure.glb" https://raw.githubusercontent.com/storytold/artcraft-services/main/old_assets/resources/models/pose/pose_new.glb
```

The figure is an OpenPose skeleton, with the body, hands and face points in the standard OpenPose colors.
It poses like ArtCraft's other characters, and a capture of it doubles as an OpenPose control image for
ComfyUI.

**2. Start the backend** and leave this window open while you use ArtCraft:

```bash
node ~/artcraft-local/server.mjs
```

It should print `listening on http://localhost:12345 (this computer only)` and
`Built-in models: ... (1 found)`. Lines starting `NOT HANDLED` are requests the backend doesn't support yet.
They are harmless; please report them as an issue on this repo.

**Adding your own models.** Put any `.glb` file into `Artcraft/local-backend/builtin/` under `character`,
`object`, `location` or `creature` (or a `.png`/`.jpg` under `image_plane`). It appears in the app's asset
menu without a restart, and the file name becomes its title. Characters can only be posed if they use a
Mixamo skeleton (bones named `mixamorig:...`).

Options: `--port <number>` (default 12345), `--data-dir <path>`.

## Step 5: Start the app

Start the backend from Step 4 first.

### Mac and Linux

One command starts everything. The ArtCraft window opens after a minute or two:

```bash
cd ~/artcraft
./script/artcraft/unix_dev.sh
```

To quit, press Ctrl+C in the terminal.

### Windows

Windows needs two PowerShell windows, which stay open while you use the app.

**Window 1, the interface.** Wait until it prints `Local: http://localhost:5173/`:

```powershell
cd ~/artcraft/frontend
$env:VITE_ENVIRONMENT_TYPE = "production"
npx nx dev artcraft
```

**Window 2, the app:**

```powershell
cd ~/artcraft
$env:SQLX_OFFLINE = "true"
$env:TAURI_FRONTEND_PATH = ".\frontend"
$env:TAURI_APP_PATH = ".\crates\desktop\artcraft"
cargo tauri dev --config ".\crates\desktop\artcraft\tauri-dev-hot-reload.conf.json"
```

To quit, close the ArtCraft window, then press Ctrl+C in both PowerShell windows.

### Once it opens

- On the sign-in screen, click **Continue without an account** at the bottom. The screen appears every
  time the app starts.
- To use an image in a scene, upload it, open the gallery, and drag it onto the scene. Use PNG or JPG; WebP
  images will not load as scene images.
- If you ran `local-only.mjs` while ArtCraft was running, stop everything (both windows on Windows) and
  start it again so it picks up the new settings.

## Checking, undoing and updating

**Check that nothing goes to ArtCraft's servers.** Near the top of the app's terminal output, look for:

```text
Using storyteller API host: Localhost { port: 12345 }
```

If it says `Storyteller` instead, the settings file was not read. Run `node ~/artcraft-local/local-only.mjs`
again and restart the app. Lines like `error sending request for url (http://localhost:12345/...)` mean the
local backend from Step 4 is not running: start it, then reload the ArtCraft window.

**Where your files are:**

| System | Settings file | Your uploads and scenes |
| --- | --- | --- |
| Windows | `C:\Users\<you>\Artcraft\settings\env_configs.json` | `C:\Users\<you>\Artcraft\local-backend\media` |
| macOS | `/Users/<you>/Artcraft/settings/env_configs.json` | `/Users/<you>/Artcraft/local-backend/media` |
| Linux | `/home/<you>/Artcraft/settings/env_configs.json` | `/home/<you>/Artcraft/local-backend/media` |

**To go back to ArtCraft's servers,** delete `env_configs.json` and `frontend/apps/artcraft/app/.env.local`,
then restart the app. To also undo the code changes, run `git checkout -- .` in the `artcraft` folder.

**To update to a newer ArtCraft,** undo the code changes (the build also changes a few files on its own),
update both folders, and run the script again:

```bash
cd ~/artcraft
git checkout -- .
git pull
cd ~/artcraft-local
git pull
node ~/artcraft-local/local-only.mjs
```

## What still talks to the internet

After the setup script, your work (images, scenes, video, uploads) goes only to the local backend. The app
still makes some connections that download things but send none of your work:

| Where | Why | Sends your work? |
| --- | --- | --- |
| Google Fonts (`fonts.googleapis.com`) | The interface's fonts | No |
| `unpkg.com` | Graphics-card speed data, used to pick 3D quality settings | No |
| GitHub | Downloading ArtCraft, this repo and the OpenPose figure (Steps 2 and 4) | No |
| Grok, Midjourney, Sora, World Labs | Only if you connect your own account with that service | Yes, your prompts and images go to that service under your account |
| `getartcraft.com`, billing pages | Only if you click those links | No |

Some ArtCraft addresses (`cdn-2.fakeyou.com`, `cdn.storyteller.ai`) are still written into the code for
features this guide doesn't use. In testing on Windows, starting the app, uploading, and saving and loading
scenes made no requests to them.

## Licensing

Everything here changes only your own copy of the desktop app, which its license allows. ArtCraft's two
parts are licensed differently:

| Part | License | What that means for you |
| --- | --- | --- |
| Desktop app ([storytold/artcraft](https://github.com/storytold/artcraft)), which `local-only.mjs` changes | MIT or Apache-2.0 | You may change your copy freely and share it, as long as you keep the license notices. |
| Backend ([storytold/artcraft-services](https://github.com/storytold/artcraft-services)) | ArtCraft "fair source" license | Free for private personal use, including changes. You may not sell it, build a competing business with it, or share a fork that removes ArtCraft's community links, donation links or paid model services. |
| OpenPose figure (`pose_new.glb`, from the backend repository's `old_assets` folder) | Same as the backend | Fine for private personal use. Download your own copy as Step 4 shows rather than passing the file around. It appears to be built on a free community OpenPose rig whose original license has not been checked. |

`server.mjs` is new code written for this purpose, not a modified copy of ArtCraft's backend. This repo is
MIT licensed; see [LICENSE](LICENSE). Images and videos you make are yours under all of these licenses.

If you like ArtCraft, consider supporting the team through their paid models or their
[Discord](https://discord.gg/artcraft). This project is for using your own hardware, not for getting around
paying them.
