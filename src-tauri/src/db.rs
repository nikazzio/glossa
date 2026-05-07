use serde::Deserialize;
use serde_json::Value as JsonValue;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Debug, Deserialize)]
pub struct SqlStatement {
    query: String,
    #[serde(default)]
    params: Vec<JsonValue>,
}

#[tauri::command]
pub async fn execute_transaction(
    db_instances: State<'_, DbInstances>,
    db: String,
    statements: Vec<SqlStatement>,
) -> Result<(), String> {
    let instances = db_instances.0.read().await;
    let db_pool = instances
        .get(&db)
        .ok_or_else(|| format!("Database not loaded: {db}"))?;

    match db_pool {
        DbPool::Sqlite(pool) => {
            let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;

            for statement in statements {
                let mut query = sqlx::query(&statement.query);
                for value in statement.params {
                    query = bind_json_value(query, value);
                }
                query
                    .execute(&mut *transaction)
                    .await
                    .map_err(|error| error.to_string())?;
            }

            transaction
                .commit()
                .await
                .map_err(|error| error.to_string())?;
            Ok(())
        }
        #[allow(unreachable_patterns)]
        _ => Err("Only SQLite transactions are supported".to_string()),
    }
}

fn bind_json_value<'q>(
    query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    value: JsonValue,
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    if value.is_null() {
        query.bind(None::<JsonValue>)
    } else if let Some(value) = value.as_str() {
        query.bind(value.to_owned())
    } else if let Some(value) = value.as_bool() {
        query.bind(value)
    } else if let Some(value) = value.as_i64() {
        query.bind(value)
    } else if let Some(value) = value.as_u64() {
        query.bind(value as i64)
    } else if let Some(value) = value.as_f64() {
        query.bind(value)
    } else {
        query.bind(value)
    }
}
