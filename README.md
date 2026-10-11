# artcraft-local

Run the [ArtCraft](https://github.com/storytold/artcraft) desktop app with everything kept on your own
computer: no account, no uploads to ArtCraft's servers (`api.storyteller.ai`), and no analytics.

Everything here needs only [Node.js](https://nodejs.org) 20 or newer and installs no packages.

| File | What it does |
| --- | --- |
| `local-only.mjs` | Changes your own copy of the ArtCraft code: turns off Google Analytics, Microsoft Clarity and the Discord status, adds a **Continue without an account** button, points the app at a backend on your own computer from its very first request, makes scene loading, thumbnails and the sign-in screen's video use local files instead of ArtCraft's CDN, and sends all of the app's internet traffic through the connection guard. Uses the files in `patches/`. |
| `server.mjs` | A small stand-in for ArtCraft's backend. It answers the app's requests for sign-in, uploads, the media library, saved scenes and built-in models, and keeps every file in `Artcraft/local-backend` in your home folder. It only accepts connections from your own computer. It also starts the connection guard. |
| `guard.mjs` | The connection guard: a proxy on your computer that every outside connection from ArtCraft passes through. It records each host, labels it (local, approved by you, ArtCraft, or unknown) and can block anything you haven't approved. See [The connection guard](docs/connection-guard.md). |

This is an unofficial companion project. It is not made by or affiliated with the ArtCraft team.

## What you need to download

| Repository | Needed? | Why |
| --- | --- | --- |
| [storytold/artcraft](https://github.com/storytold/artcraft) | **Yes, clone it** | The ArtCraft desktop app. You build and run it from your own copy, because the setup script changes its code. Every tool on ArtCraft's Home screen (Create Image, Video, Audio, Image to 3D, Angles, Moodboard, 3D Stage, the editors) lives in this one repository. |
| [RLRyals/artcraft-local](https://github.com/RLRyals/artcraft-local) | **Yes, clone it** | This repo: the setup script and the local backend. |
| [storytold/artcraft-services](https://github.com/storytold/artcraft-services) | No | ArtCraft's own backend. You don't run it; `server.mjs` replaces it. The one file used from it (the OpenPose figure) is a single download in Step 4. |
| ArtCraft's other apps (PhotoCraft, FilmCraft, SoundCraft and the rest) | No | Separate programs. ArtCraft doesn't use them. |

The installed ArtCraft app from getartcraft.com will not work with this setup, because the changes are made to the code before it is built.

## Quick start

If you already have the build tools and ArtCraft builds on your computer:

```bash
node ~/artcraft-local/local-only.mjs   # once, and again after updating ArtCraft
node ~/artcraft-local/server.mjs       # leave running while you use ArtCraft
```

Then start ArtCraft and click **Continue without an account** on the sign-in screen. Starting from
scratch? Follow [Installing and running](docs/install.md).

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
| Connection guard: log and block every outside connection | Works on Windows | Covers the app's own code and its web view. On Mac and Linux the web view is covered by an in-page monitor instead; not tested there yet. |
| Settings > Connections: check every address and key in one place | Works | Backend address and status, the connection guard (blocking, approved hosts, hosts contacted), API keys (fal, Replicate), signed-in services, and local AI addresses with a Test button. |
| Change the backend address from Settings | Not yet | Shown there; for now it is set in `Artcraft/settings/env_configs.json`. |
| Get past sign-in, upload images, media library | Works | Click **Continue without an account** and the app treats you as "Local User". |
| Save and reopen scenes | Works | File > Save scene, then File > Load my scene. |
| Place your images, shapes and skyboxes in a 3D scene | Being tested | Drag an uploaded image from the gallery onto the scene. |
| Posable figure | Works | The OpenPose figure from Step 4. Click it in the 3D view, press K (or Enter Pose Mode), drag the joints, then click Done. ArtCraft's own characters live on their servers and are not available. |
| Generate images with your own models (ComfyUI) | Not yet | Next on the list. |
| fal generations that use an input image | Not yet | Text-only fal generations work; with an input image, fal can't reach the image on your computer. See [Where your data goes](docs/privacy.md). |
| Use a backend on another machine on your network | Not yet | Needs a small code change to the app. |

## Documentation

| Guide | What's in it |
| --- | --- |
| [Installing and running](docs/install.md) | Build tools for Windows, macOS and Linux, building ArtCraft, the setup script, the local backend and the posable figure, starting the app |
| [The connection guard](docs/connection-guard.md) | How every outside connection is logged, labeled and optionally blocked |
| [Settings > Connections](docs/settings-connections.md) | The page in ArtCraft's Settings for checking addresses, keys and local AI |
| [Where your data goes](docs/privacy.md) | Where each key, login, prompt and image is sent, and what still talks to the internet |
| [Checking, undoing and updating](docs/checking-and-updating.md) | Confirming nothing reaches ArtCraft's servers, where your files are, going back, updating |
| [Licensing](docs/licensing.md) | What ArtCraft's licenses allow, and this repo's license |
