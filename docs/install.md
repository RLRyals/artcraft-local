# Installing and running

[Back to the README](../README.md)

The full setup for Windows, macOS and Linux, in five steps.

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
6. Sends all of the app's internet traffic through the [connection guard](connection-guard.md), and adds
   a small monitor to the interface that reports what it loads.
7. Adds a **Connections** page to ArtCraft's Settings (see [Settings > Connections](settings-connections.md)).

The settings go in files that git ignores: `Artcraft/settings/env_configs.json` and
`Artcraft/settings/connections.json` in your home folder, and `frontend/apps/artcraft/app/.env.local` in
the ArtCraft code. PostHog, a third tracker, is already off when you start the app the way Step 5 does.

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

It should print `listening on http://localhost:12345 (this computer only)`, `Built-in models: ... (1 found)`
and `Connection guard on http://127.0.0.1:12346`. Lines starting `CONNECTION` or `BLOCKED` are the guard
reporting a new outside host (see [The connection guard](connection-guard.md)). Lines starting
`NOT HANDLED` are requests the backend doesn't support yet. They are harmless; please report them as an
issue on this repo.

**Start the backend before ArtCraft, every time.** With the guard on, ArtCraft sends all of its internet
traffic through it, so if the backend isn't running, ArtCraft can't reach anything outside your computer.

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
