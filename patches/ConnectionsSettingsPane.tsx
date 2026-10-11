// artcraft-local: one place to check every address the app talks to and every key it holds.
// Reads the connection guard and local AI addresses from the local backend (artcraft-local's server.mjs)
// and the stored API keys and web logins from the desktop app.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StorytellerApiHostStore } from "@storyteller/api";
import { Button } from "@storyteller/ui-button";
import { Switch } from "@storyteller/ui-switch";

const REFRESH_MS = 3000;

// What each stored credential is for, in the app as it is today.
const CREDENTIALS: Record<string, { name: string; usedFor: string }> = {
  fal_api_key: { name: "fal", usedFor: "Image generation and Image to 3D Object when a fal model is chosen. Requests go to fal.ai under your key." },
  replicate_api_key: { name: "Replicate", usedFor: "Saved by the app but not used by any feature yet." },
  grok_web_login: { name: "Grok", usedFor: "Grok image and video models, under your Grok account." },
  midjourney_login: { name: "Midjourney", usedFor: "Midjourney models, under your Midjourney account." },
  runway_web_login: { name: "Runway", usedFor: "Runway models, under your Runway account." },
  higgsfield_web_login: { name: "Higgsfield", usedFor: "Higgsfield models, under your Higgsfield account." },
};

const ENDPOINT_PRESETS = [
  { kind: "comfyui", name: "ComfyUI", url: "http://127.0.0.1:8188" },
  { kind: "koboldcpp", name: "KoboldCpp", url: "http://127.0.0.1:5001" },
  { kind: "openai", name: "OpenAI-compatible server", url: "http://127.0.0.1:1234" },
];

type GuardHost = { host: string; category: string; via: string[]; count: number; blocked: number; last_seen: string };
type GuardData = {
  settings: { enabled: boolean; port: number; block_unknown_hosts: boolean; approved_hosts: { host: string; note: string }[] };
  hosts: GuardHost[];
};
type Credential = {
  provider_credential: string;
  credential_type: "api_key" | "web_login";
  has_credentials: boolean;
  maybe_details?: { maybe_key_start?: string; maybe_email_address?: string; maybe_username?: string } | null;
};
type Endpoint = { name: string; kind: string; url: string };

export const ConnectionsSettingsPane = () => {
  const backend = StorytellerApiHostStore.getInstance().getApiSchemeAndHost();
  const isLocalBackend = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(backend);

  return (
    <div className="space-y-6 pb-6 text-base-fg">
      <p className="text-sm opacity-70">
        Every address ArtCraft talks to and every key it holds, in one place. Nothing here is sent anywhere
        except your own local backend.
      </p>
      <BackendSection backend={backend} isLocalBackend={isLocalBackend} />
      {isLocalBackend && <GuardSection backend={backend} />}
      <CredentialsSection />
      {isLocalBackend && <LocalAiSection backend={backend} />}
    </div>
  );
};

// ---- Backend --------------------------------------------------------------------------------------

const BackendSection = ({ backend, isLocalBackend }: { backend: string; isLocalBackend: boolean }) => {
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${backend}/v1/session`)
      .then((r) => setReachable(r.ok))
      .catch(() => setReachable(false));
  }, [backend]);

  return (
    <Section title="Backend">
      <Row label="Address">
        <code className="text-sm">{backend}</code>{" "}
        <Badge tone={reachable === null ? "muted" : reachable ? "good" : "bad"}>
          {reachable === null ? "checking" : reachable ? "answering" : "not answering"}
        </Badge>
      </Row>
      <p className="text-xs opacity-70">
        {isLocalBackend
          ? "Your own computer: the artcraft-local backend. Uploads, scenes and sign-in stay here."
          : "This is not your computer. Uploads, scenes and sign-in go to this address."}{" "}
        Set in Artcraft/settings/env_configs.json in your home folder; changing it from here is coming next.
      </p>
    </Section>
  );
};

// ---- Connection guard -----------------------------------------------------------------------------

const GuardSection = ({ backend }: { backend: string }) => {
  const [data, setData] = useState<GuardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newHost, setNewHost] = useState("");
  const [newNote, setNewNote] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${backend}/local/connections/data`);
      setData(await response.json());
      setError(null);
    } catch {
      setError("The connection guard isn't answering. Is the artcraft-local backend running?");
    }
  }, [backend]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const save = async (change: Partial<GuardData["settings"]>) => {
    await fetch(`${backend}/local/connections/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    await refresh();
  };

  if (error) return <Section title="Connection guard"><p className="text-sm text-red-400">{error}</p></Section>;
  if (!data) return <Section title="Connection guard"><p className="text-sm opacity-70">Loading…</p></Section>;

  const approved = data.settings.approved_hosts;
  const approvedSet = new Set(approved.map((a) => a.host));

  return (
    <Section title="Connection guard">
      <Row label="Block unknown hosts">
        <Switch enabled={data.settings.block_unknown_hosts} setEnabled={(on: boolean) => save({ block_unknown_hosts: on })} />
      </Row>
      <p className="text-xs opacity-70">
        {data.settings.block_unknown_hosts
          ? "On: only your computer and the approved hosts below can be reached."
          : "Off: everything is allowed and recorded."}{" "}
        Every outside connection ArtCraft makes passes through the guard. Full log: {backend}/local/connections
      </p>

      <h4 className="pt-2 text-sm font-semibold">Approved hosts</h4>
      {approved.length === 0 && <p className="text-xs opacity-70">None yet.</p>}
      {approved.map((a, i) => (
        <Row key={a.host} label={a.host} hint={a.note}>
          <Button variant="secondary" className="h-7" onClick={() => save({ approved_hosts: approved.filter((_, j) => j !== i) })}>
            Remove
          </Button>
        </Row>
      ))}
      <div className="flex flex-wrap gap-2">
        <TextInput value={newHost} onChange={setNewHost} placeholder="host, e.g. fonts.googleapis.com or *.example.com" />
        <TextInput value={newNote} onChange={setNewNote} placeholder="what it's for (optional)" />
        <Button
          variant="primary"
          className="h-8"
          disabled={!newHost.trim()}
          onClick={() => {
            save({ approved_hosts: [...approved, { host: newHost.trim(), note: newNote.trim() }] });
            setNewHost("");
            setNewNote("");
          }}
        >
          Approve
        </Button>
      </div>

      <h4 className="pt-2 text-sm font-semibold">Hosts contacted since the backend started</h4>
      {data.hosts.length === 0 && <p className="text-xs opacity-70">None yet.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <tbody>
            {data.hosts.map((h) => (
              <tr key={h.host} className="border-b border-white/10">
                <td className="py-1.5 pr-2 font-medium">{h.host}</td>
                <td className="pr-2"><Badge tone={categoryTone(h.category)}>{h.category}</Badge></td>
                <td className="pr-2 opacity-70">{h.via.join(", ")}</td>
                <td className="pr-2 opacity-70">{h.count} request{h.count === 1 ? "" : "s"}</td>
                <td className={`pr-2 ${h.blocked ? "text-red-400" : "opacity-70"}`}>{h.blocked} blocked</td>
                <td className="text-right">
                  {!approvedSet.has(h.host) && h.category !== "local" && (
                    <Button variant="secondary" className="h-6 px-2 text-xs" onClick={() => save({ approved_hosts: [...approved, { host: h.host, note: "" }] })}>
                      Approve
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
};

// ---- API keys and web logins ----------------------------------------------------------------------

const CredentialsSection = () => {
  const [credentials, setCredentials] = useState<Credential[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = (await invoke("provider_list_command")) as { payload?: { providers: Credential[] } };
      setCredentials(result.payload?.providers ?? []);
    } catch (e) {
      setError("Could not read the app's stored keys.");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setKey = async (key: string) => {
    const value = (drafts[key] || "").trim();
    if (!value) return;
    await invoke("provider_set_api_key_command", { request: { provider_credential: key, api_key: value } });
    setDrafts((d) => ({ ...d, [key]: "" }));
    await refresh();
  };

  const clear = async (key: string) => {
    await invoke("provider_clear_command", { request: { provider_credential: key } });
    await refresh();
  };

  if (error) return <Section title="API keys"><p className="text-sm text-red-400">{error}</p></Section>;
  if (!credentials) return <Section title="API keys"><p className="text-sm opacity-70">Loading…</p></Section>;

  const apiKeys = credentials.filter((c) => c.credential_type === "api_key");
  const logins = credentials.filter((c) => c.credential_type === "web_login");

  return (
    <>
      <Section title="API keys">
        <p className="text-xs opacity-70">
          Stored on this computer in Artcraft/credentials in your home folder. Only the first few characters are shown.
        </p>
        {apiKeys.map((c) => {
          const info = CREDENTIALS[c.provider_credential] ?? { name: c.provider_credential, usedFor: "" };
          return (
            <div key={c.provider_credential} className="space-y-1.5 border-b border-white/10 pb-3">
              <Row label={info.name} hint={info.usedFor}>
                {c.has_credentials ? (
                  <>
                    <code className="text-xs">{c.maybe_details?.maybe_key_start ?? "set"}</code>
                    <Button variant="secondary" className="h-7" onClick={() => clear(c.provider_credential)}>Remove</Button>
                  </>
                ) : (
                  <Badge tone="muted">not set</Badge>
                )}
              </Row>
              <div className="flex gap-2">
                <TextInput
                  value={drafts[c.provider_credential] || ""}
                  onChange={(v) => setDrafts((d) => ({ ...d, [c.provider_credential]: v }))}
                  placeholder={c.has_credentials ? "Paste a new key to replace it" : "Paste your key"}
                  secret
                />
                <Button variant="primary" className="h-8" disabled={!(drafts[c.provider_credential] || "").trim()} onClick={() => setKey(c.provider_credential)}>
                  Save
                </Button>
              </div>
            </div>
          );
        })}
      </Section>

      <Section title="Signed-in services">
        <p className="text-xs opacity-70">
          Your own accounts with these services. When one is connected, ArtCraft sends prompts and images to that
          service under your account. Connect or disconnect them in Accounts.
        </p>
        {logins.map((c) => {
          const info = CREDENTIALS[c.provider_credential] ?? { name: c.provider_credential, usedFor: "" };
          const who = c.maybe_details?.maybe_email_address || c.maybe_details?.maybe_username;
          return (
            <Row key={c.provider_credential} label={info.name} hint={info.usedFor}>
              <Badge tone={c.has_credentials ? "warn" : "muted"}>{c.has_credentials ? `connected${who ? ` as ${who}` : ""}` : "not connected"}</Badge>
            </Row>
          );
        })}
      </Section>
    </>
  );
};

// ---- Local AI -------------------------------------------------------------------------------------

const LocalAiSection = ({ backend }: { backend: string }) => {
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null);
  const [results, setResults] = useState<Record<number, { success: boolean; detail: string } | "testing">>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`${backend}/local/endpoints`)
      .then((r) => r.json())
      .then((j) => setEndpoints(j.endpoints ?? []))
      .catch(() => setEndpoints([]));
  }, [backend]);

  const update = (next: Endpoint[]) => {
    setEndpoints(next);
    setDirty(true);
    setResults({});
  };

  const save = async () => {
    const response = await fetch(`${backend}/local/endpoints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoints }),
    });
    setEndpoints((await response.json()).endpoints ?? []);
    setDirty(false);
  };

  const test = async (i: number, endpoint: Endpoint) => {
    setResults((r) => ({ ...r, [i]: "testing" }));
    const response = await fetch(`${backend}/local/endpoints/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(endpoint),
    });
    const result = await response.json();
    setResults((r) => ({ ...r, [i]: result }));
  };

  if (!endpoints) return <Section title="Local AI"><p className="text-sm opacity-70">Loading…</p></Section>;

  return (
    <Section title="Local AI">
      <p className="text-xs opacity-70">
        AI programs running on your own computer or network. Saved in Artcraft/settings/connections.json. Generating
        with them from ArtCraft is the next step; for now you can save and test the addresses.
      </p>
      {endpoints.map((e, i) => {
        const result = results[i];
        return (
          <div key={i} className="space-y-1.5 border-b border-white/10 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <TextInput value={e.name} onChange={(v) => update(endpoints.map((x, j) => (j === i ? { ...x, name: v } : x)))} placeholder="Name" />
              <select
                className="h-8 rounded border border-white/15 bg-black/30 px-2 text-sm"
                value={e.kind}
                onChange={(ev) => update(endpoints.map((x, j) => (j === i ? { ...x, kind: ev.target.value } : x)))}
              >
                <option value="comfyui">ComfyUI</option>
                <option value="koboldcpp">KoboldCpp</option>
                <option value="openai">OpenAI-compatible</option>
                <option value="other">Other</option>
              </select>
              <TextInput value={e.url} onChange={(v) => update(endpoints.map((x, j) => (j === i ? { ...x, url: v } : x)))} placeholder="http://127.0.0.1:8188" />
              <Button variant="secondary" className="h-8" onClick={() => test(i, e)}>Test</Button>
              <Button variant="secondary" className="h-8" onClick={() => update(endpoints.filter((_, j) => j !== i))}>Remove</Button>
            </div>
            {result && (
              <p className={`text-xs ${result === "testing" ? "opacity-70" : result.success ? "text-green-400" : "text-red-400"}`}>
                {result === "testing" ? "Testing…" : result.detail}
              </p>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        {ENDPOINT_PRESETS.map((p) => (
          <Button key={p.kind} variant="secondary" className="h-8" onClick={() => update([...endpoints, { name: p.name, kind: p.kind, url: p.url }])}>
            Add {p.name}
          </Button>
        ))}
        <Button variant="primary" className="h-8" disabled={!dirty} onClick={save}>Save</Button>
      </div>
    </Section>
  );
};

// ---- Small building blocks ------------------------------------------------------------------------

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-2.5">
    <h3 className="border-b border-white/10 pb-1.5 text-base font-semibold">{title}</h3>
    {children}
  </section>
);

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <div className="text-sm font-medium">{label}</div>
      {hint && <div className="text-xs opacity-70">{hint}</div>}
    </div>
    <div className="flex shrink-0 items-center gap-2">{children}</div>
  </div>
);

const TONES = {
  good: "bg-green-500/20 text-green-300",
  bad: "bg-red-500/20 text-red-300",
  warn: "bg-amber-500/20 text-amber-300",
  info: "bg-sky-500/20 text-sky-300",
  muted: "bg-white/10 text-white/60",
};

const Badge = ({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) => (
  <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>{children}</span>
);

const categoryTone = (category: string): keyof typeof TONES =>
  category === "local" ? "good" : category === "approved" ? "info" : category === "artcraft" ? "warn" : "bad";

const TextInput = ({ value, onChange, placeholder, secret }: { value: string; onChange: (v: string) => void; placeholder?: string; secret?: boolean }) => (
  <input
    type={secret ? "password" : "text"}
    value={value}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
    autoComplete="off"
    spellCheck={false}
    className="h-8 min-w-[220px] flex-1 rounded border border-white/15 bg-black/30 px-2 text-sm outline-none focus:border-white/40"
  />
);
