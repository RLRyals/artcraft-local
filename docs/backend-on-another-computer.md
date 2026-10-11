# Using a backend on another computer

[Back to the README](../README.md)

By default the backend (`server.mjs`) runs on the same computer as ArtCraft. You can also run it on another
computer you own, for example a desktop with a big graphics card that a laptop connects to.

**Status: partly working.** Choosing the address works. An `https://` backend on another computer should
work but hasn't been tested. A plain `http://` backend on your home network (`http://192.168.1.20:12345`) is not reachable yet:
ArtCraft only allows its interface to make plain `http://` requests to `localhost`, and widening that is
waiting on a decision. See [the open question](#open-question-plain-http-on-your-network) below.

## On the computer that runs the backend

Start the backend so other computers can reach it, giving it the address they will use:

```bash
node ~/artcraft-local/server.mjs --listen 0.0.0.0 --public-url http://192.168.1.20:12345
```

- `--listen` chooses which network addresses accept connections. `0.0.0.0` means all of them. Without
  `--listen`, the backend only accepts connections from its own computer.
- `--public-url` is the address other computers use to reach it. The backend uses it in the file links it
  gives out, so images and scenes load from the right place.
- It prints a warning: anyone on your network can then reach the backend and the files in it. Only do this
  on a network you trust, and check your computer's firewall settings.

## On the computer that runs ArtCraft

1. Keep running `node ~/artcraft-local/server.mjs` here as well (without `--listen`). This copy runs the
   [connection guard](connection-guard.md) and the Local AI settings, which always live on the computer
   where ArtCraft runs.
2. In ArtCraft, open **Settings > Connections**, type the other computer's address under **Backend**, click
   **Test**, then **Save**.
3. Quit and restart ArtCraft.

The connection guard always allows the backend you chose here, labeled **backend**.

To go back, choose **This computer** (then Save) or **Use ArtCraft's servers**, and restart ArtCraft.

## Open question: plain http on your network

ArtCraft's desktop app keeps a list of addresses its interface may contact. It allows any `https://`
address and only `http://localhost:12345` for plain `http://`. The options being considered:

1. Allow any `http://` address. The connection guard still records every connection and, with blocking on,
   refuses hosts you haven't approved.
2. Allow only home-network `http://` addresses (`192.168.*`, `10.*`, `172.16-31.*`, `*.local`).
3. Keep it as is and require `https://` for a backend on another computer.
