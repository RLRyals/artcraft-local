# Where your data goes

[Back to the README](../README.md)

## Where your keys, logins, prompts and images go

With this setup, the "backend" is `server.mjs` on your own computer, so nothing below reaches
ArtCraft's servers (`api.storyteller.ai`). If you point ArtCraft back at ArtCraft's servers, everything
that says "the backend" goes to them instead.

| Setting | Where the key or login goes | What else is sent, and where |
| --- | --- | --- |
| **fal API key** | Only to fal.ai. ArtCraft sends the generation request straight to fal with your key; the key is never sent to the backend. | ArtCraft also sends the backend a record of your prompt before generating, and uploads the finished images to it afterwards. With this setup both stay on your computer. |
| **Grok, Midjourney, Runway, Higgsfield logins** | Only to that service. The login is stored on your computer and sent only to its own service. | Your prompts and input images go to that service under your account. The finished images are uploaded to the backend. |
| **Local AI addresses** (ComfyUI, KoboldCpp, OpenAI-compatible) | Nowhere outside. The local backend talks to them directly. | Nothing goes to ArtCraft's servers. |
| **Backend address** | Wherever it points. | Sign-in, uploads, saved scenes, prompt records and generation results all go there. |

**fal and input images.** When a fal generation uses an input image (editing an image, or generating from a
3D capture), fal's servers need to download that image. If it is on your own computer, home network or Tailscale
tailnet, which fal can't reach, ArtCraft first uploads it to fal's own storage with your key and gives fal that copy. The
image goes only to fal, which has to receive it anyway to work on it. Files in fal's storage are reachable by
anyone who has the link. This is built but not yet tested with a real fal key.

**Checking it yourself.** Any request to ArtCraft's servers shows up in the
[connection guard](connection-guard.md) labeled **artcraft**. With **Block unknown hosts** on and no
ArtCraft host approved, ArtCraft can't reach its servers at all, whatever a setting says.

## What still talks to the internet

After the setup script, your work (images, scenes, video, uploads) goes only to the local backend. The
[connection guard](connection-guard.md) shows exactly what else is contacted on your computer; this is
what we have seen so far. None of these send your work:

| Where | Why | Sends your work? |
| --- | --- | --- |
| `config.edge.skype.com`, `edge.microsoft.com` (Windows only) | Microsoft's WebView2, which ArtCraft's window is built on, fetching its own settings. Not requested by ArtCraft. | No |
| Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) | The interface's fonts | No |
| `unpkg.com` | Graphics-card speed data, used to pick 3D quality settings | No |
| GitHub | Downloading ArtCraft, this repo and the OpenPose figure (Steps 2 and 4) | No |
| Grok, Midjourney, Sora, World Labs | Only if you connect your own account with that service | Yes, your prompts and images go to that service under your account |
| `getartcraft.com`, billing pages | Only if you click those links | No |

Some ArtCraft addresses (`cdn-2.fakeyou.com`, `cdn.storyteller.ai`) are still written into the code for
features this guide doesn't use. In testing on Windows, starting the app, uploading, and saving and loading
scenes made no requests to them.
