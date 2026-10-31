use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri_plugin_store::StoreExt;

// License validation response from Supabase
#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseValidation {
    pub valid: bool,
    pub plan_tier: Option<String>,
    pub error: Option<String>,
}

// Stored license info
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StoredLicense {
    pub code: String,
    pub plan_tier: String,
    pub activated_at: String,
    pub machine_id: String,
}

// Get unique machine identifier
#[tauri::command]
fn get_machine_id() -> String {
    // Create a simple machine fingerprint based on hostname and username
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    let username = whoami::username();

    // Create a hash of the machine info
    let machine_info = format!("{}:{}", hostname, username);
    let hash = simple_hash(&machine_info);

    format!("DSK-{}", hash)
}

// Simple hash function for machine ID
fn simple_hash(input: &str) -> String {
    let mut hash: u64 = 0;
    for (i, c) in input.chars().enumerate() {
        hash = hash.wrapping_add((c as u64).wrapping_mul((i + 1) as u64));
        hash = hash.wrapping_mul(31);
    }
    format!("{:016X}", hash)
}

// Get stored license from local storage
#[tauri::command]
async fn get_stored_license(app: tauri::AppHandle) -> Result<Option<StoredLicense>, String> {
    let store = app.store("license.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;

    match store.get("license") {
        Some(value) => {
            let license: StoredLicense = serde_json::from_value(value.clone())
                .map_err(|e: serde_json::Error| e.to_string())?;

            // Verify machine ID matches
            let current_machine_id = get_machine_id();
            if license.machine_id != current_machine_id {
                return Ok(None); // License was activated on different machine
            }

            Ok(Some(license))
        }
        None => Ok(None),
    }
}

// Validate license code against Supabase
#[tauri::command]
async fn validate_license(
    app: tauri::AppHandle,
    license_code: String,
    supabase_url: String,
) -> Result<LicenseValidation, String> {
    let machine_id = get_machine_id();

    // Call Supabase edge function to validate license
    let client = reqwest::Client::new();
    let url = format!("{}/functions/v1/validate-desktop-license", supabase_url);

    let mut body = HashMap::new();
    body.insert("licenseCode", license_code.clone());
    body.insert("machineId", machine_id.clone());

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e: reqwest::Error| format!("Network error: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Ok(LicenseValidation {
            valid: false,
            plan_tier: None,
            error: Some(format!("Validation failed: {}", error_text)),
        });
    }

    let validation: LicenseValidation = response
        .json()
        .await
        .map_err(|e: reqwest::Error| format!("Parse error: {}", e))?;

    // If valid, store the license locally
    if validation.valid {
        if let Some(ref plan_tier) = validation.plan_tier {
            let stored_license = StoredLicense {
                code: license_code,
                plan_tier: plan_tier.clone(),
                activated_at: chrono::Utc::now().to_rfc3339(),
                machine_id,
            };

            let store = app.store("license.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;

            store.set(
                "license",
                serde_json::to_value(&stored_license).map_err(|e: serde_json::Error| e.to_string())?,
            );
            let _ = store.save();
        }
    }

    Ok(validation)
}

// Clear stored license (for logout/deactivation)
#[tauri::command]
async fn clear_license(app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store("license.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;

    let _ = store.delete("license");
    let _ = store.save();

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_machine_id,
            get_stored_license,
            validate_license,
            clear_license
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
