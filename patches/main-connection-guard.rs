/// artcraft-local: when <home>/Artcraft/settings/connections.json enables the connection guard, send all of
/// this app's internet traffic (Rust HTTP clients and, on Windows, the WebView2 interface) through it.
/// Requests to this computer (localhost) go direct. Runs before any threads start, so setting the
/// environment here is safe.
fn route_through_connection_guard() {
  let home_var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
  let Some(home) = std::env::var_os(home_var) else { return };
  let settings_path = std::path::Path::new(&home).join("Artcraft").join("settings").join("connections.json");
  let Ok(text) = std::fs::read_to_string(&settings_path) else { return };
  let Ok(settings) = serde_json::from_str::<serde_json::Value>(&text) else { return };
  let guard = &settings["guard"];
  if guard["enabled"].as_bool() == Some(false) {
    return;
  }
  let port = guard["port"].as_u64().unwrap_or(12346);
  let proxy = format!("http://127.0.0.1:{}", port);

  for key in ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"] {
    std::env::set_var(key, &proxy);
  }
  for key in ["NO_PROXY", "no_proxy"] {
    std::env::set_var(key, "localhost,127.0.0.1,::1");
  }

  // WebView2 bypasses loopback addresses on its own, so the interface's dev server stays direct.
  #[cfg(windows)]
  {
    let existing = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
    let args = format!("{} --proxy-server={}", existing, proxy);
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", args.trim());
  }
}
