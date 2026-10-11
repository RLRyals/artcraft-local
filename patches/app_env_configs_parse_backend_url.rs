/// artcraft-local: turn a backend address typed by the user into an `ApiHost`.
/// Accepts http(s) URLs with no path; `http://localhost:PORT` maps to `ApiHost::Localhost`.
pub fn parse_backend_url(value: &str) -> Option<ApiHost> {
  let url = url::Url::parse(value.trim()).ok()?;
  if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
    return None;
  }
  if url.path() != "/" || url.query().is_some() || url.fragment().is_some() || !url.username().is_empty() {
    return None;
  }
  let host = url.host_str()?;
  if url.scheme() == "http" && host == "localhost" {
    return Some(ApiHost::Localhost { port: url.port_or_known_default()? as u32 });
  }
  let scheme_and_host = url.origin().ascii_serialization();
  if scheme_and_host == "https://api.storyteller.ai" {
    return Some(ApiHost::Storyteller);
  }
  Some(ApiHost::Custom { scheme_and_host })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn localhost_maps_to_the_local_option() {
    assert!(matches!(parse_backend_url("http://localhost:12345"), Some(ApiHost::Localhost { port: 12345 })));
    assert!(matches!(parse_backend_url("http://localhost:12345/"), Some(ApiHost::Localhost { port: 12345 })));
  }

  #[test]
  fn other_addresses_become_custom() {
    match parse_backend_url("http://192.168.1.20:12345") {
      Some(ApiHost::Custom { scheme_and_host }) => assert_eq!(scheme_and_host, "http://192.168.1.20:12345"),
      other => panic!("unexpected: {:?}", other),
    }
    match parse_backend_url("https://studio.example.com") {
      Some(ApiHost::Custom { scheme_and_host }) => assert_eq!(scheme_and_host, "https://studio.example.com"),
      other => panic!("unexpected: {:?}", other),
    }
  }

  #[test]
  fn artcraft_production_maps_to_storyteller() {
    assert!(matches!(parse_backend_url("https://api.storyteller.ai"), Some(ApiHost::Storyteller)));
  }

  #[test]
  fn invalid_addresses_are_rejected() {
    assert!(parse_backend_url("").is_none());
    assert!(parse_backend_url("192.168.1.20:12345").is_none());
    assert!(parse_backend_url("ftp://example.com").is_none());
    assert!(parse_backend_url("http://example.com/api").is_none());
    assert!(parse_backend_url("http://user:pw@example.com").is_none());
  }
}
