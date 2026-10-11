# Checking, undoing and updating

[Back to the README](../README.md)

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
| Windows | `C:\Users\<you>\Artcraft\settings\` | `C:\Users\<you>\Artcraft\local-backend\media` |
| macOS | `/Users/<you>/Artcraft/settings/` | `/Users/<you>/Artcraft/local-backend/media` |
| Linux | `/home/<you>/Artcraft/settings/` | `/home/<you>/Artcraft/local-backend/media` |

The settings folder holds `env_configs.json` (which backend to use) and `connections.json` (the connection
guard).

**To go back to ArtCraft's servers,** delete `env_configs.json`, `connections.json` and
`frontend/apps/artcraft/app/.env.local`, then restart the app. To also undo the code changes, run `git checkout -- .` in the `artcraft` folder.

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
