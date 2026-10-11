//! artcraft-local: let Settings > Connections choose the backend address.
//! The address is saved to <data root>/settings/env_configs.json and takes effect when the app restarts.

use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::state::app_env_configs::app_env_configs::{parse_backend_url, AppEnvConfigs};
use crate::core::state::app_env_configs::app_env_configs_serializeable::AppEnvConfigsSerializable;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use log::{error, info};
use serde_derive::{Deserialize, Serialize};
use tauri::State;

#[derive(Deserialize)]
pub struct SetBackendAddressRequest {
  /// The new address, or `None` to go back to ArtCraft's servers.
  pub maybe_url: Option<String>,
}

#[derive(Serialize)]
pub struct SetBackendAddressResponse {
  /// The address the app will use after it restarts.
  pub saved_address: String,
  /// The address the app is using right now.
  pub current_address: String,
}

impl SerializeMarker for SetBackendAddressResponse {}

#[tauri::command]
pub async fn set_backend_address_command(
  request: SetBackendAddressRequest,
  app_data_root: State<'_, AppDataRoot>,
  app_env_configs: State<'_, AppEnvConfigs>,
) -> ResponseOrErrorMessage<SetBackendAddressResponse> {
  let maybe_host = match request.maybe_url.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
    None => None,
    Some(url) => Some(parse_backend_url(url).ok_or("Enter an address like http://192.168.1.20:12345 (http or https, no path)")?),
  };
  let maybe_url = maybe_host.as_ref().map(|host| host.to_api_hostname_and_scheme());
  info!("set_backend_address_command: saving backend address {:?}", maybe_url);

  AppEnvConfigsSerializable::save_backend_url(&app_data_root, maybe_url.clone())
    .map_err(|err| {
      error!("Failed to save backend address: {:?}", err);
      "Failed to save the backend address"
    })?;

  Ok(SetBackendAddressResponse {
    saved_address: maybe_url.unwrap_or_else(|| "https://api.storyteller.ai".to_string()),
    current_address: app_env_configs.storyteller_host.to_api_hostname_and_scheme(),
  }.into())
}
