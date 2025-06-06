use anyhow::Result;
use colored::*;
use indicatif::{ProgressBar, ProgressStyle};
use inquire::{validator::Validation, Confirm, Password, Select, Text};
use query_engine::credentials::{
    BigqueryCredentials, Credential, PostgresCredentials, RedshiftCredentials, SnowflakeCredentials,
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_yaml;
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::utils::exclusion::BusterConfig;
use crate::utils::{
    buster::{BusterClient, PostDataSourcesRequest},
    file::buster_credentials::get_and_validate_buster_credentials,
};

#[derive(Debug, Clone)]
enum DatabaseType {
    Redshift,
    Postgres,
    BigQuery,
    Snowflake,
}

impl std::fmt::Display for DatabaseType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DatabaseType::Redshift => write!(f, "Redshift"),
            DatabaseType::Postgres => write!(f, "Postgres"),
            DatabaseType::BigQuery => write!(f, "BigQuery"),
            DatabaseType::Snowflake => write!(f, "Snowflake"),
        }
    }
}

// Using shared RedshiftCredentials from query_engine now, no need for local definition

pub async fn init(destination_path: Option<&str>) -> Result<()> {
    println!("{}", "Initializing Buster...".bold().green());

    // Determine the destination path for buster.yml
    let dest_path = match destination_path {
        Some(path) => PathBuf::from(path),
        None => std::env::current_dir()?,
    };

    // Ensure destination directory exists
    if !dest_path.exists() {
        fs::create_dir_all(&dest_path)?;
    }

    let config_path = dest_path.join("buster.yml");

    if config_path.exists() {
        let overwrite = Confirm::new(&format!(
            "A buster.yml file already exists at {}. Do you want to overwrite it?",
            config_path.display().to_string().cyan()
        ))
        .with_default(false)
        .prompt()?;

        if !overwrite {
            println!(
                "{}",
                "Keeping existing buster.yml file. Configuration will be skipped.".yellow()
            );
            return Ok(());
        }
    }

    // Check for Buster credentials with progress indicator
    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::default_spinner()
            .tick_chars("⠁⠂⠄⡀⢀⠠⠐⠈ ")
            .template("{spinner:.green} {msg}")
            .unwrap(),
    );
    spinner.set_message("Checking for Buster credentials...");
    spinner.enable_steady_tick(Duration::from_millis(100));

    let buster_creds = match get_and_validate_buster_credentials().await {
        Ok(creds) => {
            spinner.finish_with_message("✓ Buster credentials found".green().to_string());
            creds
        }
        Err(_) => {
            spinner.finish_with_message("✗ No valid Buster credentials found".red().to_string());
            println!("Please run {} first.", "buster auth".cyan());
            return Err(anyhow::anyhow!("No valid Buster credentials found"));
        }
    };

    // Select database type
    let db_types = vec![
        DatabaseType::Redshift,
        DatabaseType::Postgres,
        DatabaseType::BigQuery,
        DatabaseType::Snowflake,
    ];

    let db_type = Select::new("Select your database type:", db_types).prompt()?;

    println!("You selected: {}", db_type.to_string().cyan());

    match db_type {
        DatabaseType::Redshift => {
            setup_redshift(buster_creds.url, buster_creds.api_key, &config_path).await
        }
        DatabaseType::Postgres => {
            setup_postgres(buster_creds.url, buster_creds.api_key, &config_path).await
        }
        DatabaseType::BigQuery => {
            setup_bigquery(buster_creds.url, buster_creds.api_key, &config_path).await
        }
        _ => {
            println!(
                "{}",
                format!("{} support is coming soon!", db_type).yellow()
            );
            println!("Currently, only Redshift, Postgres, and BigQuery are supported.");
            Err(anyhow::anyhow!("Database type not yet implemented"))
        }
    }
}

async fn setup_redshift(
    buster_url: String,
    buster_api_key: String,
    config_path: &Path,
) -> Result<()> {
    println!("{}", "Setting up Redshift connection...".bold().green());

    // Collect name (with validation)
    let name_regex = Regex::new(r"^[a-zA-Z0-9_-]+$")?;
    let name = Text::new("Enter a unique name for this data source:")
        .with_help_message("Only alphanumeric characters, dash (-) and underscore (_) allowed")
        .with_validator(move |input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Name cannot be empty".into()));
            }
            if name_regex.is_match(input) {
                Ok(Validation::Valid)
            } else {
                Ok(Validation::Invalid(
                    "Name must contain only alphanumeric characters, dash (-) or underscore (_)"
                        .into(),
                ))
            }
        })
        .prompt()?;

    // Collect host
    let host = Text::new("Enter the Redshift host:")
        .with_help_message("Example: my-cluster.abc123xyz789.us-west-2.redshift.amazonaws.com")
        .with_validator(|input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Host cannot be empty".into()));
            }
            Ok(Validation::Valid)
        })
        .prompt()?;

    // Collect port (with validation)
    let port_str = Text::new("Enter the Redshift port:")
        .with_default("5439")
        .with_help_message("Default Redshift port is 5439")
        .with_validator(|input: &str| match input.parse::<u16>() {
            Ok(_) => Ok(Validation::Valid),
            Err(_) => Ok(Validation::Invalid(
                "Port must be a valid number between 1 and 65535".into(),
            )),
        })
        .prompt()?;
    let port = port_str.parse::<u16>()?;

    // Collect username
    let username = Text::new("Enter the Redshift username:")
        .with_validator(|input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Username cannot be empty".into()));
            }
            Ok(Validation::Valid)
        })
        .prompt()?;

    // Collect password (masked)
    let password = Password::new("Enter the Redshift password:")
        .with_validator(|input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Password cannot be empty".into()));
            }
            Ok(Validation::Valid)
        })
        .without_confirmation()
        .prompt()?;

    // Collect database (required)
    let database = Text::new("Enter the Redshift database:")
        .with_validator(|input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Database cannot be empty".into()));
            }
            Ok(Validation::Valid)
        })
        .prompt()?;

    // Collect schema (required)
    let schema = Text::new("Enter the Redshift schema:")
        .with_validator(|input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Schema cannot be empty".into()));
            }
            Ok(Validation::Valid)
        })
        .prompt()?;

    // Show summary and confirm
    println!("\n{}", "Connection Summary:".bold());
    println!("Name: {}", name.cyan());
    println!("Host: {}", host.cyan());
    println!("Port: {}", port.to_string().cyan());
    println!("Username: {}", username.cyan());
    println!("Password: {}", "********".cyan());
    println!("Database: {}", database.cyan()); // Now required
    println!("Schema: {}", schema.cyan()); // Now required

    let confirm = Confirm::new("Do you want to create this data source?")
        .with_default(true)
        .prompt()?;

    if !confirm {
        println!("{}", "Data source creation cancelled.".yellow());
        return Ok(());
    }

    // Create API request
    // Note: Linter previously indicated these expect Option<String> despite being required now.
    let redshift_creds = RedshiftCredentials {
        host,
        port,
        username,
        password,
        default_database: database.clone(), // Pass as Option<String>
        default_schema: Some(schema.clone()), // Pass as Option<String>
    };
    let credential = Credential::Redshift(redshift_creds);
    let request = PostDataSourcesRequest {
        name: name.clone(),
        credential,
    };

    // Send to API with progress indicator
    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::default_spinner()
            .tick_chars("⠁⠂⠄⡀⢀⠠⠐⠈ ")
            .template("{spinner:.green} {msg}")
            .unwrap(),
    );
    spinner.set_message("Sending credentials to Buster API...");
    spinner.enable_steady_tick(Duration::from_millis(100));

    let client = BusterClient::new(buster_url, buster_api_key)?;

    match client.post_data_sources(request).await {
        Ok(_) => {
            spinner.finish_with_message(
                "✓ Data source created successfully!"
                    .green()
                    .bold()
                    .to_string(),
            );
            println!(
                "\nData source '{}' is now available for use with Buster.",
                name.cyan()
            );

            // Create buster.yml file
            create_buster_config_file(
                config_path,
                &name,
                &database, // Pass required string ref
                &schema,   // Pass required string ref
            )?;

            println!("You can now use this data source with other Buster commands.");
            Ok(())
        }
        Err(e) => {
            spinner.finish_with_message("✗ Failed to create data source".red().bold().to_string());
            println!("\nError: {}", e);
            println!("Please check your credentials and try again.");
            Err(anyhow::anyhow!("Failed to create data source: {}", e))
        }
    }
}

async fn setup_postgres(
    buster_url: String,
    buster_api_key: String,
    config_path: &Path,
) -> Result<()> {
    println!("{}", "Setting up PostgreSQL connection...".bold().green());

    // Collect name (with validation)
    let name_regex = Regex::new(r"^[a-zA-Z0-9_-]+$")?;
    let name = Text::new("Enter a unique name for this data source:")
        .with_help_message("Only alphanumeric characters, dash (-) and underscore (_) allowed")
        .with_validator(move |input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Name cannot be empty".into()));
            }
            if name_regex.is_match(input) {
                Ok(Validation::Valid)
            } else {
                Ok(Validation::Invalid(
                    "Name must contain only alphanumeric characters, dash (-) or underscore (_)"
                        .into(),
                ))
            }
        })
        .prompt()?;

    // Collect host
    let host = Text::new("Enter the PostgreSQL host:")
        .with_help_message("Example: localhost or db.example.com")
        .with_validator(|input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Host cannot be empty".into()));
            }
            Ok(Validation::Valid)
        })
        .prompt()?;

    // Collect port (with validation)
    let port_str = Text::new("Enter the PostgreSQL port:")
        .with_default("5432") // Default Postgres port is 5432
        .with_help_message("Default PostgreSQL port is 5432")
        .with_validator(|input: &str| match input.parse::<u16>() {
            Ok(_) => Ok(Validation::Valid),
            Err(_) => Ok(Validation::Invalid(
                "Port must be a valid number between 1 and 65535".into(),
            )),
        })
        .prompt()?;
    let port = port_str.parse::<u16>()?;

    // Collect username
    let username = Text::new("Enter the PostgreSQL username:")
        .with_validator(|input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Username cannot be empty".into()));
            }
            Ok(Validation::Valid)
        })
        .prompt()?;

    // Collect password (masked)
    let password = Password::new("Enter the PostgreSQL password:")
        .with_validator(|input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Password cannot be empty".into()));
            }
            Ok(Validation::Valid)
        })
        .without_confirmation()
        .prompt()?;

    // Collect database (required)
    let database = Text::new("Enter the PostgreSQL database name:")
        .with_validator(|input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Database cannot be empty".into()));
            }
            Ok(Validation::Valid)
        })
        .prompt()?;

    // Collect schema (required)
    let schema = Text::new("Enter the PostgreSQL schema:")
        .with_validator(|input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Schema cannot be empty".into()));
            }
            Ok(Validation::Valid)
        })
        .prompt()?;

    // Show summary and confirm
    println!("\n{}", "Connection Summary:".bold());
    println!("Name: {}", name.cyan());
    println!("Host: {}", host.cyan());
    println!("Port: {}", port.to_string().cyan());
    println!("Username: {}", username.cyan());
    println!("Password: {}", "********".cyan());
    println!("Database: {}", database.cyan()); // Now required
    println!("Schema: {}", schema.cyan()); // Now required

    let confirm = Confirm::new("Do you want to create this data source?")
        .with_default(true)
        .prompt()?;

    if !confirm {
        println!("{}", "Data source creation cancelled.".yellow());
        return Ok(());
    }

    // Create API request
    // Assuming these expect Option<String> based on typical patterns, adjust if linter disagrees
    let postgres_creds = PostgresCredentials {
        host,
        port,
        username,
        password,
        default_database: database.clone(), // Pass as Option<String>
        default_schema: Some(schema.clone()), // Pass as Option<String>
        jump_host: None,
        ssh_username: None,
        ssh_private_key: None,
    };
    let credential = Credential::Postgres(postgres_creds);
    let request = PostDataSourcesRequest {
        name: name.clone(),
        credential,
    };

    // Send to API with progress indicator
    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::default_spinner()
            .tick_chars("⠁⠂⠄⡀⢀⠠⠐⠈ ")
            .template("{spinner:.green} {msg}")
            .unwrap(),
    );
    spinner.set_message("Sending credentials to Buster API...");
    spinner.enable_steady_tick(Duration::from_millis(100));

    let client = BusterClient::new(buster_url, buster_api_key)?;

    match client.post_data_sources(request).await {
        Ok(_) => {
            spinner.finish_with_message(
                "✓ Data source created successfully!"
                    .green()
                    .bold()
                    .to_string(),
            );
            println!(
                "\nData source '{}' is now available for use with Buster.",
                name.cyan()
            );

            // Create buster.yml file
            create_buster_config_file(
                config_path,
                &name,
                &database, // Pass required string ref
                &schema,   // Pass required string ref
            )?;

            println!("You can now use this data source with other Buster commands.");
            Ok(())
        }
        Err(e) => {
            spinner.finish_with_message("✗ Failed to create data source".red().bold().to_string());
            println!("\nError: {}", e);
            println!("Please check your credentials and try again.");
            Err(anyhow::anyhow!("Failed to create data source: {}", e))
        }
    }
}

async fn setup_bigquery(
    buster_url: String,
    buster_api_key: String,
    config_path: &Path,
) -> Result<()> {
    println!("{}", "Setting up BigQuery connection...".bold().green());

    // Collect name (with validation)
    let name_regex = Regex::new(r"^[a-zA-Z0-9_-]+$")?;
    let name = Text::new("Enter a unique name for this data source:")
        .with_help_message("Only alphanumeric characters, dash (-) and underscore (_) allowed")
        .with_validator(move |input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Name cannot be empty".into()));
            }
            if name_regex.is_match(input) {
                Ok(Validation::Valid)
            } else {
                Ok(Validation::Invalid(
                    "Name must contain only alphanumeric characters, dash (-) or underscore (_)"
                        .into(),
                ))
            }
        })
        .prompt()?;

    // Collect project ID
    let project_id = Text::new("Enter the Google Cloud project ID:")
        .with_help_message("Example: my-project-123456")
        .with_validator(|input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Project ID cannot be empty".into()));
            }
            Ok(Validation::Valid)
        })
        .prompt()?;

    // Collect dataset ID (required)
    let dataset_id = Text::new("Enter the BigQuery dataset ID:")
        .with_validator(|input: &str| {
            if input.trim().is_empty() {
                return Ok(Validation::Invalid("Dataset ID cannot be empty".into()));
            }
            Ok(Validation::Valid)
        })
        .prompt()?;

    // Collect credentials JSON
    println!(
        "\n{}",
        "BigQuery requires a service account credentials JSON file.".bold()
    );
    println!(
        "You can create one in the Google Cloud Console under IAM & Admin > Service Accounts."
    );

    let credentials_path = Text::new("Enter the path to your credentials JSON file:")
        .with_help_message("Example: /path/to/credentials.json")
        .with_validator(|input: &str| {
            let path = Path::new(input);
            if !path.exists() {
                return Ok(Validation::Invalid("File does not exist".into()));
            }
            if !path.is_file() {
                return Ok(Validation::Invalid("Path is not a file".into()));
            }
            Ok(Validation::Valid)
        })
        .prompt()?;

    // Read credentials file
    let credentials_content = match fs::read_to_string(&credentials_path) {
        Ok(content) => content,
        Err(e) => {
            return Err(anyhow::anyhow!("Failed to read credentials file: {}", e));
        }
    };

    // Parse JSON to ensure it's valid and convert to serde_json::Value
    let credentials_json: serde_json::Value = match serde_json::from_str(&credentials_content) {
        Ok(json) => json,
        Err(e) => {
            return Err(anyhow::anyhow!("Invalid JSON in credentials file: {}", e));
        }
    };

    // Show summary and confirm
    println!("\n{}", "Connection Summary:".bold());
    println!("Name: {}", name.cyan());
    println!("Project ID: {}", project_id.cyan());
    println!("Dataset ID: {}", dataset_id.cyan()); // Now required
    println!("Credentials: {}", credentials_path.cyan());

    let confirm = Confirm::new("Do you want to create this data source?")
        .with_default(true)
        .prompt()?;

    if !confirm {
        println!("{}", "Data source creation cancelled.".yellow());
        return Ok(());
    }

    // Create API request
    let bigquery_creds = BigqueryCredentials {
        default_project_id: project_id.clone(),       // Expects String
        default_dataset_id: dataset_id.clone(), // Expects Option<String>
        credentials_json: credentials_json,           // Expects serde_json::Value
    };
    let credential = Credential::Bigquery(bigquery_creds);
    let request = PostDataSourcesRequest {
        name: name.clone(),
        credential,
    };

    // Send to API with progress indicator
    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::default_spinner()
            .tick_chars("⠁⠂⠄⡀⢀⠠⠐⠈ ")
            .template("{spinner:.green} {msg}")
            .unwrap(),
    );
    spinner.set_message("Sending credentials to Buster API...");
    spinner.enable_steady_tick(Duration::from_millis(100));

    let client = BusterClient::new(buster_url, buster_api_key)?;

    match client.post_data_sources(request).await {
        Ok(_) => {
            spinner.finish_with_message(
                "✓ Data source created successfully!"
                    .green()
                    .bold()
                    .to_string(),
            );
            println!(
                "\nData source '{}' is now available for use with Buster.",
                name.cyan()
            );

            // Create buster.yml file
            create_buster_config_file(
                config_path,
                &name,
                &project_id, // Project ID maps to database
                &dataset_id, // Dataset ID maps to schema
            )?;

            println!("You can now use this data source with other Buster commands.");
            Ok(())
        }
        Err(e) => {
            spinner.finish_with_message("✗ Failed to create data source".red().bold().to_string());
            println!("\nError: {}", e);
            println!("Please check your credentials and try again.");
            Err(anyhow::anyhow!("Failed to create data source: {}", e))
        }
    }
}

// Helper function to create buster.yml file
fn create_buster_config_file(
    path: &Path,
    data_source_name: &str,
    database: &str, // Now required
    schema: &str,   // Now required
) -> Result<()> {
    // Prompt for model paths (optional)
    let model_paths_input = Text::new(
        "Enter paths to your SQL models (optional, comma-separated):",
    )
    .with_help_message(
        "Leave blank to use current directory, or specify paths like './models,./analytics/models'",
    )
    .prompt()?;

    // Process the comma-separated input into a vector if not empty
    let model_paths = if model_paths_input.trim().is_empty() {
        None
    } else {
        Some(
            model_paths_input
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<String>>(),
        )
    };

    let config = BusterConfig {
        data_source_name: Some(data_source_name.to_string()),
        schema: Some(schema.to_string()),     // Use required schema
        database: Some(database.to_string()), // Use required database
        exclude_files: None,
        exclude_tags: None,
        model_paths,
    };

    let yaml = serde_yaml::to_string(&config)?;
    fs::write(path, yaml)?;

    println!(
        "{} {}",
        "✓".green(),
        format!("Created buster.yml at {}", path.display()).green()
    );

    Ok(())
}
