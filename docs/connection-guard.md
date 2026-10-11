# The connection guard

[Back to the README](../README.md)

Every connection ArtCraft makes to the outside world passes through the guard, which runs inside
`server.mjs`. Open **http://localhost:12345/local/connections** in any browser to see:

- every outside host ArtCraft has contacted since the backend started, how often, from which part of the
  app, and whether it was allowed;
- the latest individual requests;
- your list of approved hosts, with buttons to approve or remove a host;
- the switch that blocks unknown hosts.

Each host gets a label:

| Label | Meaning |
| --- | --- |
| local | Your own computer. Always allowed. |
| approved | A host you added to the approved list. Always allowed. |
| artcraft | A host owned by ArtCraft's company (`storyteller.ai`, `fakeyou.com`, `artcraft.ai`, `getartcraft.com`). Treated like unknown unless you approve it. |
| unknown | Anything else. |

**Blocking.** With **Block unknown hosts** on, only local and approved hosts can be reached; everything
else is refused and shows as blocked. It starts off, so you can watch first and approve what you need.

**How it covers the app.** ArtCraft's own code (every service and provider it talks to) is pointed at the
guard as the app starts. On Windows the interface is pointed at it too. On Mac and Linux the interface
can't be, so a monitor in the page reports what it loads and, when blocking is on, a content policy refuses
unapproved hosts; restart ArtCraft after changing the blocking switch so the page picks it up.

**The record.** Every connection is also written to `Artcraft/local-backend/connections.log` in your home
folder, one line per connection.

**Turning it off.** Set `"enabled": false` in `Artcraft/settings/connections.json` and restart both the
backend and ArtCraft.
