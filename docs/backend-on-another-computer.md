# Using a backend on another computer

[Back to the README](../README.md)

By default the backend (`server.mjs`) runs on the same computer as ArtCraft. You can also run it on another
computer you own, for example a desktop with a big graphics card that a laptop connects to.

**Status:** choosing the address in Settings works. The Tailscale route below should work without any
other changes but hasn't been tested end to end yet. A plain `http://` backend on your home network doesn't
work yet (see [Without Tailscale](#without-tailscale)).

## Recommended: Tailscale

[Tailscale](https://tailscale.com) gives each of your computers a private `https://` address on your own
network (your *tailnet*), like `https://studio.tail1234.ts.net`. ArtCraft already accepts any `https://`
address, and only devices signed in to your tailnet can reach it.

Tailnet devices also have numeric addresses between `100.64.0.0` and `100.127.255.255`. That's normal for
Tailscale; use the `https://….ts.net` name instead of the number.

### Once: turn on HTTPS for your tailnet

In the Tailscale admin console, under **DNS**, make sure **MagicDNS** and **HTTPS Certificates** are on.

### On the computer that runs the backend

1. Start the backend as usual. It keeps listening only on its own computer; Tailscale passes requests to it.
   Give it its tailnet address so the file links it hands out work from other computers:

   ```bash
   node ~/artcraft-local/server.mjs --public-url https://studio.tail1234.ts.net:8443
   ```

2. In another terminal, have Tailscale serve it over HTTPS to your tailnet only:

   ```bash
   tailscale serve --bg --https=8443 http://127.0.0.1:12345
   ```

   Port `8443` keeps it separate from anything else you already serve with Tailscale (`tailscale serve
   status` shows what's in use). Use `tailscale serve`, not `tailscale funnel`: Funnel would put the backend
   on the public internet.

3. Replace `studio.tail1234.ts.net` with that computer's name, shown by `tailscale status` or in the
   Tailscale app.

### On the computer that runs ArtCraft

1. Keep running `node ~/artcraft-local/server.mjs` here as well. This copy runs the
   [connection guard](connection-guard.md) and the Local AI settings, which always live on the computer
   where ArtCraft runs.
2. In ArtCraft, open **Settings > Connections**, type the address (for example
   `https://studio.tail1234.ts.net:8443`) under **Backend**, click **Test**, then **Save**.
3. Quit and restart ArtCraft.

The connection guard always allows the backend you chose, labeled **backend**. If you use fal with input
images, ArtCraft uploads those images to fal's own storage first, because fal can't reach your tailnet.

To go back, choose **This computer** (then Save) or **Use ArtCraft's servers**, and restart ArtCraft.
To stop serving: `tailscale serve --https=8443 off` on the backend computer.

## Without Tailscale

You can make the backend reachable on your home network directly:

```bash
node ~/artcraft-local/server.mjs --listen 0.0.0.0 --public-url http://192.168.1.20:12345
```

- `--listen` chooses which network addresses accept connections; `0.0.0.0` means all of them. Without it,
  the backend only accepts connections from its own computer.
- `--public-url` is the address other computers use; the backend uses it in the file links it gives out.
- It prints a warning: anyone on your network can then reach the backend and the files in it.

**This doesn't work from ArtCraft yet.** ArtCraft's desktop app only lets its interface make plain `http://`
requests to `localhost`, and widening that is still an open question. Use Tailscale (or another way to give
the backend an `https://` address) instead.
