//! artcraft-local: give fal input images it can actually download.
//!
//! fal's servers fetch input images by URL. When the backend runs on this computer or on the local network,
//! those URLs point somewhere fal can't reach, so each such image is uploaded to fal's own storage with the
//! user's key first and the fal-hosted URL is used instead. URLs fal can already reach are left alone.
//!
//! Upload protocol (from fal's official JavaScript client, fal-ai/fal-js libs/client/src/storage.ts):
//!   1. POST https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3
//!      Authorization: Key <key>, JSON body { content_type, file_name } -> { upload_url, file_url }
//!   2. PUT the bytes to upload_url with the same Content-Type.
//!   3. Use file_url as the model input.

use std::net::IpAddr;

use errors::anyhow;
use log::info;
use serde_derive::{Deserialize, Serialize};
use url::{Host, Url};

use crate::core::commands::enqueue::generate_error::GenerateError;

const FAL_UPLOAD_INITIATE_URL: &str = "https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3";

/// Replace every URL that fal can't download with a fal-hosted copy of the same file.
pub async fn upload_unreachable_images_to_fal(urls: Vec<String>, fal_api_key: &str) -> Result<Vec<String>, GenerateError> {
  let client = reqwest::Client::new();
  let mut resolved = Vec::with_capacity(urls.len());
  for url in urls {
    if fal_can_reach(&url) {
      resolved.push(url);
      continue;
    }
    info!("Input image {} is not reachable by fal; uploading it to fal storage", url);
    let fal_url = upload_to_fal_storage(&client, &url, fal_api_key).await?;
    info!("Uploaded {} -> {}", url, fal_url);
    resolved.push(fal_url);
  }
  Ok(resolved)
}

/// True unless the URL points at this computer or a private network address.
pub fn fal_can_reach(url: &str) -> bool {
  let Ok(parsed) = Url::parse(url) else { return false };
  match parsed.host() {
    Some(Host::Domain(domain)) => {
      let domain = domain.to_ascii_lowercase();
      !(domain == "localhost" || domain.ends_with(".localhost") || domain.ends_with(".local") || !domain.contains('.'))
    }
    Some(Host::Ipv4(ip)) => is_public_ip(IpAddr::V4(ip)),
    Some(Host::Ipv6(ip)) => is_public_ip(IpAddr::V6(ip)),
    None => false,
  }
}

async fn upload_to_fal_storage(client: &reqwest::Client, source_url: &str, fal_api_key: &str) -> Result<String, GenerateError> {
  let download = client.get(source_url).send().await
    .and_then(|r| r.error_for_status())
    .map_err(|err| upload_error(format!("could not read input image {}: {}", source_url, err)))?;
  let content_type = download.headers().get(reqwest::header::CONTENT_TYPE)
    .and_then(|v| v.to_str().ok())
    .map(|v| v.to_string())
    .unwrap_or_else(|| "application/octet-stream".to_string());
  let bytes = download.bytes().await
    .map_err(|err| upload_error(format!("could not read input image {}: {}", source_url, err)))?;

  let initiate: InitiateUploadResponse = client.post(FAL_UPLOAD_INITIATE_URL)
    .header(reqwest::header::AUTHORIZATION, format!("Key {}", fal_api_key))
    .header(reqwest::header::ACCEPT, "application/json")
    .json(&InitiateUploadRequest { content_type: content_type.clone(), file_name: file_name_from_url(source_url) })
    .send().await
    .and_then(|r| r.error_for_status())
    .map_err(|err| upload_error(format!("fal storage refused the upload: {}", err)))?
    .json().await
    .map_err(|err| upload_error(format!("unexpected reply from fal storage: {}", err)))?;

  client.put(&initiate.upload_url)
    .header(reqwest::header::CONTENT_TYPE, content_type)
    .body(bytes)
    .send().await
    .and_then(|r| r.error_for_status())
    .map_err(|err| upload_error(format!("uploading to fal storage failed: {}", err)))?;

  Ok(initiate.file_url)
}

fn is_public_ip(ip: IpAddr) -> bool {
  match ip {
    IpAddr::V4(v4) => !(v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified()),
    IpAddr::V6(v6) => {
      let unique_local = (v6.segments()[0] & 0xfe00) == 0xfc00;
      let link_local = (v6.segments()[0] & 0xffc0) == 0xfe80;
      !(v6.is_loopback() || v6.is_unspecified() || unique_local || link_local)
    }
  }
}

fn file_name_from_url(url: &str) -> String {
  Url::parse(url).ok()
    .and_then(|u| u.path_segments().and_then(|s| s.last().map(|s| s.to_string())))
    .filter(|name| !name.is_empty())
    .unwrap_or_else(|| "input-image".to_string())
}

fn upload_error(message: String) -> GenerateError {
  GenerateError::AnyhowError(anyhow!("fal input image upload: {}", message))
}

#[derive(Serialize)]
struct InitiateUploadRequest {
  content_type: String,
  file_name: String,
}

#[derive(Deserialize)]
struct InitiateUploadResponse {
  upload_url: String,
  file_url: String,
}

#[cfg(test)]
mod tests {
  use super::*;

  mod reachability_tests {
    use super::*;

    #[test]
    fn this_computer_is_not_reachable() {
      assert!(!fal_can_reach("http://localhost:12345/media/m_abc.png"));
      assert!(!fal_can_reach("http://127.0.0.1:12345/media/m_abc.png"));
      assert!(!fal_can_reach("http://[::1]:12345/media/m_abc.png"));
    }

    #[test]
    fn local_network_is_not_reachable() {
      assert!(!fal_can_reach("http://192.168.1.20:12345/media/a.png"));
      assert!(!fal_can_reach("http://10.0.0.5/media/a.png"));
      assert!(!fal_can_reach("http://172.20.0.5/media/a.png"));
      assert!(!fal_can_reach("http://studio.local:12345/media/a.png"));
      assert!(!fal_can_reach("http://nas/media/a.png"));
    }

    #[test]
    fn public_addresses_are_reachable() {
      assert!(fal_can_reach("https://cdn-2.fakeyou.com/media/a.png"));
      assert!(fal_can_reach("https://v3b.fal.media/files/b/x/a.png"));
      assert!(fal_can_reach("http://8.8.8.8/a.png"));
    }

    #[test]
    fn unparseable_urls_are_not_reachable() {
      assert!(!fal_can_reach("not a url"));
    }
  }

  #[test]
  fn file_name_comes_from_the_url_path() {
    assert_eq!(file_name_from_url("http://localhost:12345/media/m_abc.png"), "m_abc.png");
    assert_eq!(file_name_from_url("http://localhost:12345/"), "input-image");
  }
}
