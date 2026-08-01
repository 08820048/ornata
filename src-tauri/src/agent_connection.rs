use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::config;
use crate::error::{AppError, AppResult};

const KEYCHAIN_SERVICE: &str = "app.ornata.agent";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionConfig {
    pub slug: String,
    pub name: String,
    pub provider: String,
    pub model: String,
    #[serde(default)]
    pub auth_type: AgentAuthType,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub endpoint_api: Option<EndpointApi>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentAuthType {
    ApiKey,
    #[serde(rename = "oauth")]
    OAuth,
    Iam,
    ServiceAccount,
    Environment,
    None,
}

impl Default for AgentAuthType {
    fn default() -> Self {
        Self::ApiKey
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum EndpointApi {
    OpenaiCompletions,
    AnthropicMessages,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnection {
    #[serde(flatten)]
    pub config: AgentConnectionConfig,
    pub credential_configured: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnections {
    pub connections: Vec<AgentConnection>,
    pub active_slug: Option<String>,
}

impl AgentConnectionConfig {
    pub fn validate(&self) -> AppResult<()> {
        for (label, value) in [
            ("connection name", self.name.as_str()),
            ("provider", self.provider.as_str()),
            ("model", self.model.as_str()),
        ] {
            if value.trim().is_empty() {
                return Err(AppError::InvalidInput(format!("{label} cannot be empty")));
            }
        }
        if self.slug.trim().is_empty()
            || !self
                .slug
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "-_".contains(character))
        {
            return Err(AppError::InvalidInput("invalid connection slug".into()));
        }
        if let Some(base_url) = self.base_url.as_deref() {
            if !(base_url.starts_with("http://") || base_url.starts_with("https://")) {
                return Err(AppError::InvalidInput(
                    "base URL must start with http:// or https://".into(),
                ));
            }
        }
        Ok(())
    }

    pub fn needs_stored_credential(&self) -> bool {
        matches!(self.auth_type, AgentAuthType::ApiKey | AgentAuthType::OAuth)
    }
}

fn entry(slug: &str) -> AppResult<Entry> {
    Entry::new(KEYCHAIN_SERVICE, slug)
        .map_err(|error| AppError::Other(format!("could not access Keychain: {error}")))
}

pub fn credential(config: &AgentConnectionConfig) -> AppResult<Option<Value>> {
    let secret = match entry(&config.slug)?.get_password() {
        Ok(secret) => secret,
        Err(KeyringError::NoEntry) => return Ok(None),
        Err(error) => {
            return Err(AppError::Other(format!(
                "could not read model credential from Keychain: {error}"
            )))
        }
    };
    Ok(Some(serde_json::from_str(&secret).unwrap_or_else(
        |_| json!({ "type": "api_key", "key": secret }),
    )))
}

pub fn store_credential(slug: &str, credential: &Value) -> AppResult<()> {
    entry(slug)?
        .set_password(&serde_json::to_string(credential)?)
        .map_err(|error| AppError::Other(format!("could not save model credential: {error}")))
}

fn remove_credential(slug: &str) -> AppResult<()> {
    match entry(slug)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(AppError::Other(format!(
            "could not remove model credential: {error}"
        ))),
    }
}

fn status(config: AgentConnectionConfig) -> AppResult<AgentConnection> {
    let credential_configured = !config.needs_stored_credential() || credential(&config)?.is_some();
    Ok(AgentConnection {
        config,
        credential_configured,
    })
}

pub fn active(app: &AppHandle) -> AppResult<Option<AgentConnectionConfig>> {
    let app_config = config::load(app);
    Ok(app_config
        .active_agent_connection
        .as_ref()
        .and_then(|slug| {
            app_config
                .agent_connections
                .iter()
                .find(|connection| &connection.slug == slug)
                .cloned()
        }))
}

#[tauri::command]
pub fn agent_connections_list(app: AppHandle) -> AppResult<AgentConnections> {
    let app_config = config::load(&app);
    let connections = app_config
        .agent_connections
        .into_iter()
        .map(status)
        .collect::<AppResult<Vec<_>>>()?;
    Ok(AgentConnections {
        connections,
        active_slug: app_config.active_agent_connection,
    })
}

#[tauri::command]
pub fn agent_connection_get(app: AppHandle) -> AppResult<Option<AgentConnection>> {
    active(&app)?.map(status).transpose()
}

#[tauri::command]
pub fn agent_connection_save(
    app: AppHandle,
    connection: AgentConnectionConfig,
    api_key: Option<String>,
    activate: Option<bool>,
) -> AppResult<AgentConnections> {
    connection.validate()?;
    if let Some(api_key) = api_key {
        let api_key = api_key.trim();
        if api_key.is_empty() {
            remove_credential(&connection.slug)?;
        } else {
            store_credential(
                &connection.slug,
                &json!({ "type": "api_key", "key": api_key }),
            )?;
        }
    }
    let mut app_config = config::load(&app);
    match app_config
        .agent_connections
        .iter()
        .position(|item| item.slug == connection.slug)
    {
        Some(index) => app_config.agent_connections[index] = connection.clone(),
        None => app_config.agent_connections.push(connection.clone()),
    }
    if activate.unwrap_or(true) || app_config.active_agent_connection.is_none() {
        app_config.active_agent_connection = Some(connection.slug);
    }
    config::save(&app, &app_config)?;
    agent_connections_list(app)
}

#[tauri::command]
pub fn agent_connection_activate(app: AppHandle, slug: String) -> AppResult<AgentConnections> {
    let mut app_config = config::load(&app);
    if !app_config
        .agent_connections
        .iter()
        .any(|connection| connection.slug == slug)
    {
        return Err(AppError::NotFound("Model connection not found".into()));
    }
    app_config.active_agent_connection = Some(slug);
    config::save(&app, &app_config)?;
    agent_connections_list(app)
}

#[tauri::command]
pub fn agent_connection_delete(app: AppHandle, slug: String) -> AppResult<AgentConnections> {
    let mut app_config = config::load(&app);
    let original_len = app_config.agent_connections.len();
    app_config
        .agent_connections
        .retain(|connection| connection.slug != slug);
    if app_config.agent_connections.len() == original_len {
        return Err(AppError::NotFound("Model connection not found".into()));
    }
    remove_credential(&slug)?;
    if app_config.active_agent_connection.as_deref() == Some(&slug) {
        app_config.active_agent_connection = app_config
            .agent_connections
            .first()
            .map(|connection| connection.slug.clone());
    }
    config::save(&app, &app_config)?;
    agent_connections_list(app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_connection_values() {
        let connection = AgentConnectionConfig {
            slug: "../bad".into(),
            name: "Local".into(),
            provider: "ollama".into(),
            model: "qwen".into(),
            auth_type: AgentAuthType::None,
            base_url: Some("file:///tmp/model".into()),
            endpoint_api: Some(EndpointApi::OpenaiCompletions),
        };
        assert!(connection.validate().is_err());
    }

    #[test]
    fn auth_types_match_frontend_protocol() {
        assert_eq!(
            serde_json::to_string(&AgentAuthType::ApiKey).unwrap(),
            "\"apiKey\""
        );
        assert_eq!(
            serde_json::to_string(&AgentAuthType::OAuth).unwrap(),
            "\"oauth\""
        );
        assert_eq!(
            serde_json::to_string(&AgentAuthType::ServiceAccount).unwrap(),
            "\"serviceAccount\""
        );
    }
}
