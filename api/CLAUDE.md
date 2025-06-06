# Buster API Repository Navigation Guide

> **Last Updated**: April 7, 2025  
> **Version**: 1.0.2

## Architecture Overview

```
                  ┌─────────────────┐
                  │    Web Client   │
                  └─────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────┐
│                  API Layer                     │
├───────────────┬──────────────┬────────────────┤
│  REST Routes  │ WS Routes    │ Authentication │
└───────────────┴──────────────┴────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────┐
│               Handlers Layer                   │
├─────────┬───────────┬───────────┬─────────────┤
│ Metrics │ Dashboards│  Chats    │ Collections │
└─────────┴───────────┴───────────┴─────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────┐
│              Libraries Layer                   │
├─────────┬───────────┬───────────┬─────────────┤
│ Database│ Agents    │ Sharing   │ Query Engine│
└─────────┴───────────┴───────────┴─────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────┐
│              External Services                 │
├─────────┬───────────┬───────────┬─────────────┤
│Postgres │  Redis    │   LLMs    │ Data Sources│
└─────────┴───────────┴───────────┴─────────────┘
```

## Row Limit Implementation Notes
All database query functions in the query_engine library have been updated to respect a 5000 row limit by default. The limit can be overridden by passing an explicit limit value. This is implemented in the libs/query_engine directory.

## Documentation
The project's detailed documentation is in the `/documentation` directory:
- `handlers.mdc` - Handler patterns
- `libs.mdc` - Library construction guidelines 
- `rest.mdc` - REST API formatting
- `testing.mdc` - Testing standards
- `tools.mdc` - Tools documentation
- `websockets.mdc` - WebSocket patterns

While these files contain best practices for writing tests, REST patterns, etc., **each subdirectory should have its own README.md or CLAUDE.md** that should be referenced first when working in that specific area. These subdirectory-specific guides often contain implementation details and patterns specific to that component.

### Additional Documentation Resources

- [**Library Index**](./CLAUDE-LIBRARY-INDEX.md) - Comprehensive index of all functionality across libraries
- [**Library Template**](./libs/CLAUDE-TEMPLATE.md) - Template for creating new library documentation
- [**Database Test Guide**](./libs/database/tests/CLAUDE.md) - Detailed guide for using the database test infrastructure

## Library Relationships
- **agents** → depends on → **litellm**, **database**, **braintrust**
- **handlers** → depends on → **database**, **agents**, **sharing**
- **query_engine** → depends on → **database** 
- All libraries depend on common workspace dependencies

## Repository Structure
- `src/` - Main server code (Axum application wiring)
  - `routes/` - API endpoints (REST, WebSocket) - Defines routes, applies middleware
  - `utils/` - Shared server-specific utilities
  - `types/` - Common type definitions for the server layer
- `libs/` - Shared libraries (Core logic)
  - `database/` - Database interactions, schema, models, migrations, **test utilities**
  - `handlers/` - Request handling logic for specific routes/features
  - `agents/`, `sharing/`, `query_engine/`, etc. - Other core logic libraries
  - Each lib has its own `Cargo.toml`, `src/`, and `tests/` (for lib-specific integration tests)
- `server/tests/` - Focused integration tests for the `server` crate (routing, middleware), **mocks handlers**.
- `documentation/` - Detailed docs (`*.mdc` files)
- `prds/` - Product requirements

## Build Commands
- `make dev` - Start development
- `make stop` - Stop development
- `cargo test -- --test-threads=1 --nocapture` - Run tests
- `cargo clippy` - Run linter
- `cargo build` - Build project

## Common Test Commands 

### Run Specific Tests
```bash
# Run tests for a specific library (e.g., database integration tests)
cargo test -p database

# Run tests for the handlers library
cargo test -p handlers

# Run focused server integration tests (routing, middleware)
cargo test -p server

# Run a specific test function (e.g., in handlers)
cargo test -p handlers -- test_get_dashboard_handler

# Run tests with filter (e.g., all tests containing "metric")
cargo test metric

# Run with output visible and single-threaded
cargo test -- --test-threads=1 --nocapture
```

### Test Database Environment (Using `database::test_utils`)
```rust
use database::test_utils::{TestDb, insert_test_metric_file, cleanup_test_data};

#[tokio::test] async fn my_db_test() -> anyhow::Result<()> {
  // Assumes pools are initialized beforehand (e.g., via #[ctor])
  let test_db = TestDb::new().await?;
  
  // Create test data structs
  let metric = test_db.create_test_metric_file(&test_db.user_id).await?;
  let metric_id = metric.id;
  
  // Insert data using helpers
  insert_test_metric_file(&metric).await?;
  
  // ... perform test logic ...
  
  // Clean up specific test data
  cleanup_test_data(&[metric_id]).await?;
  Ok(())}
```

## Core Guidelines
- Use `anyhow::Result` for error handling
- Group imports (std lib, external, internal)
- Put shared types in `types/`, route-specific types in route files
- Use snake_case for variables/functions, CamelCase for types
- Never log secrets or sensitive data
- All dependencies inherit from workspace using `{ workspace = true }`
- Use database connection pool from `get_pg_pool().get().await?`
- Write tests with `#[tokio::test]` for async tests.
- Use database test utilities from `libs/database/src/test_utils.rs` for managing test data.
- Use mocking (`mockall`, `mockito`) for unit tests.
- Use `axum_test_helper::TestClient` for server integration tests (`server/tests/`).

## Common Database Pattern
```rust
let pool = get_pg_pool();
let mut conn = pool.get().await?;

diesel::update(table)
    .filter(conditions)
    .set(values)
    .execute(&mut conn)
    .await?
```

## Troubleshooting Guide

### Common Issues

1. **Test Database Connection Issues**
   - **Symptom**: Tests fail with connection pool errors or timeouts.
   - **Solution**: Ensure test database service is running. Verify `DATABASE_URL` in `.env.test` is correct. Check pool initialization logic (e.g., `#[ctor]` setup).
   - **Example Error**: `Failed to get diesel connection: connection pool timeout`

2. **Test Cleanup Issues**
   - **Symptom**: Tests fail with duplicate records, unique constraint violations, or unexpected data from previous runs.
   - **Solution**: Ensure `cleanup_test_data(&[asset_ids])` is called at the end of *every* integration test that modifies the database, cleaning up precisely the data it created.
   - **Example Error**: `duplicate key value violates unique constraint`

3. **Missing Permissions in Handlers**
   - **Symptom**: 403 errors in REST or WebSocket endpoints
   - **Solution**: Use the `check_permission_access` function from the sharing library
   - **Example Error**: `You don't have permission to view this dashboard`

4. **Tool Execution Failures**
   - **Symptom**: Agent tools fail to execute properly
   - **Solution**: Implement the `ToolExecutor` trait fully with proper error handling
   - **Example Error**: `Failed to execute tool: invalid schema`

### Library-Specific Troubleshooting

Check individual CLAUDE.md files or READMEs in each library directory for specific troubleshooting guidance.