# artcraft-local

Run the [ArtCraft](https://github.com/storytold/artcraft) desktop app with everything kept on your own
computer: no account, no uploads to ArtCraft's servers, and no analytics.

This repo has two files:

| File | What it does |
| --- | --- |
| `local-only.mjs` | Changes your own copy of the ArtCraft code: turns off Google Analytics, Microsoft Clarity and the Discord status, adds a **Continue without an account** button, points the app at a backend on your own computer from its very first request, and makes scene loading, thumbnails and the sign-in screen's video use local files instead of ArtCraft's CDN. |
| `server.mjs` | A small stand-in for ArtCraft's backend. It answers the app's requests for sign-in, uploads, the media library, saved scenes and built-in models, and keeps every file in `Artcraft/local-backend` in your home folder. It only accepts connections from your own computer. |

Both need only [Node.js](https://nodejs.org) 20 or newer. Neither installs any packages.

This is an unofficial companion project. It is not made by or affiliated with the ArtCraft team.

## Quick start

Put this folder next to your ArtCraft code (for example `~/artcraft` and `~/artcraft-local`), then:

```bash
node ~/artcraft-local/local-only.mjs   # once, and again after updating ArtCraft
node ~/artcraft-local/server.mjs       # leave running while you use ArtCraft
```

Then start ArtCraft as usual and click **Continue without an account** on the sign-in screen. If ArtCraft
was already running when you ran `local-only.mjs`, stop it completely (including its dev server) and start
it again.

The full step-by-step guide for Windows, macOS and Linux, including building ArtCraft, is shared separately.

## Built-in models

Put `.glb` files in `Artcraft/local-backend/builtin/` under `character`, `object`, `location` or
`creature` (or `.png`/`.jpg` under `image_plane`). They appear in ArtCraft's asset menu without a
restart, and the file name becomes the title. Characters can only be posed if they use a Mixamo
skeleton (bones named `mixamorig:...`).

A posable OpenPose figure is available from ArtCraft's public backend repository:

```bash
mkdir -p ~/Artcraft/local-backend/builtin/character
curl -L -o ~/Artcraft/local-backend/builtin/character/OpenPose-Figure.glb \
  https://raw.githubusercontent.com/storytold/artcraft-services/main/old_assets/resources/models/pose/pose_new.glb
```

That file belongs to ArtCraft's backend repository and is covered by its license, which allows private
personal use. Download your own copy rather than redistributing it.

## What works

Tested on Windows 11. Mac and Linux are expected to work but are not tested yet.

- Getting past the sign-in screen as a local user
- Uploading images and browsing them in the media library
- Saving scenes and loading them again
- Built-in models from the folder above (being tested)

With both files in place, the app's startup requests all go to `localhost`; nothing goes to
`api.storyteller.ai`.

Not yet: generating images or video (a ComfyUI bridge is planned), tags, folders, and using a backend on
another machine. Requests the backend does not handle are printed as `NOT HANDLED` in its window.

## Undo

- Delete `Artcraft/settings/env_configs.json` in your home folder to point ArtCraft back at its own servers.
- Run `git checkout -- .` in the ArtCraft folder to undo the code changes.

## License

MIT. See [LICENSE](LICENSE).
