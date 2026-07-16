# Dentweb Integration Plan

## Goal

Connect Dental Consult CRM to Dentweb safely by making only one server PC read Dentweb directly. Other clinic PCs connect to the local Dental Consult CRM server over the clinic LAN.

## Architecture

```text
[Server PC]
Dentweb server/DB
Dental Consult CRM server mode
- Dentweb discovery
- Read-only Dentweb adapter
- local.db sync
- Internal API server
- Client device registration

        Clinic LAN

[Reception PC] Dental Consult CRM client mode
[Consultation PC] Dental Consult CRM client mode
[Doctor Room PC] Dental Consult CRM client mode
```

## Development Phases

1. Add server/client mode concept to the current app.
2. Run an internal API server on the server PC.
3. Let client PCs connect to the server IP manually.
4. Add read-only Dentweb discovery and connection test.
5. Add server local.db sync.
6. Add client automatic discovery.
7. Add pairing code and server approval.
8. Add staff permissions and device management.
9. Add firewall and installer handling.
10. Add remote support, logs, and diagnostics.
11. Add auto update.
12. Run pilot tests at another clinic.

## Current Step

- Step 3 is complete.
- Step 4 is complete.
- Step 5 is complete for the first local DB/API migration pass.
- Step 7 is complete for the first read-only JSON/file adapter pass.
- Step 7 approval basics were pulled forward and partially implemented because client registration already needs a server-side approval path.
- Admin mode now stores a per-clinic Dentweb integration mode setting.
- Local internal API server skeleton has been added.
- Client mode manual server connection UI has been added to Admin Mode.
- Server mode can now load client registration requests and approve or reject them.
- Server mode can now run a read-only Dentweb discovery and path readability test.
- Server mode can now initialize and inspect a server-PC-only central SQLite DB at `.dentweb-local/local.db`.
- Server mode can now run a first read-only JSON/file-based Dentweb snapshot sync into local DB.

## Step 1 Scope

- Add server/client mode setting to Admin Mode.
- Store mode per clinic.
- Store internal API host, port, pairing code, and auto-discovery preference.
- Do not start a real local API server yet.

## Step 3

Step 3: let client PCs connect to the server IP manually from the app UI.

Step 2 endpoints:

- `GET /health`
- `GET /clinic`
- `POST /client/register`
- `GET /clients`
- `POST /clients/:deviceId/approve`
- `POST /clients/:deviceId/reject`
- `GET /dentweb/discover`
- `POST /dentweb/discover`
- `POST /dentweb/connection-test`
- `GET /local-db/status`
- `GET /local-db/schema`
- `POST /local-db/dry-run-sync`

The first implementation is mocked. Dentweb direct access should come after the local server skeleton is stable.

## Step 2 Run Command

```bash
npm run dentweb:server
```

The local API server uses port `34254` by default and creates local runtime config under `.dentweb-local/`.

## Step 3 Scope

- Add manual server IP connection UI for client mode.
- Test `GET /health` from the client mode screen.
- Show connected clinic information from `GET /clinic`.
- Send `POST /client/register` with pairing code.

## Step 3.5 Scope

- Persist client registration requests in `.dentweb-local/clients.json`.
- Show requested client PCs in Admin Mode server settings.
- Approve or reject each client request from the server PC.
- Return an approved client token for the future authenticated client API flow.

## Step 4 Scope

Step 4: add read-only Dentweb discovery and connection test for server mode.

Initial server mode discovery candidates:

- Detect Dentweb process.
- Check common install folders.
- Check config and DB file candidates.
- Add manual Dentweb DB/path selector.
- Keep all access read-only.

Implemented first:

- Detect Windows processes with Dentweb-like names.
- Check common local install folders and DB file candidates.
- Allow manual DB/folder path input.
- Test whether the selected path exists and is readable.
- Do not write to Dentweb, and do not run patient/reservation queries yet.

## Step 5 Scope

Step 5: design and add the server-side `local.db` sync layer.

Important rule:

- `local.db` lives only on the server PC.
- Client PCs must not create or read their own app DB.
- Client PCs read and write Dental Consult CRM data only through the server PC internal API.
- Supabase later remains the cloud/backoffice sync target, not the first source of truth for clinic LAN operation.

Initial Step 5 scope:

- Define the local SQLite schema for synced Dentweb snapshots.
- Store sync metadata per clinic.
- Keep Dentweb reads separated from Dental Consult CRM write records.
- Add a dry-run sync endpoint before any scheduled sync.

Implemented first:

- Create `.dentweb-local/local.db` on the server PC.
- Add core tables for clinics, consultations, recall records, admin settings, Dentweb patient snapshots, Dentweb appointment snapshots, sync runs, and device events.
- Add status/schema endpoints.
- Add a dry-run sync endpoint that does not write Dentweb source data.

## Step 5.5 Scope

Step 5.5: migrate app data access behind the server API.

Initial Step 5.5 scope:

- Add server API endpoints for consultations.
- Add server API endpoints for recall records.
- Add server API endpoints for admin settings snapshots.
- Change client hooks to use server API when client/server mode is enabled.
- Keep browser localStorage only as temporary fallback for standalone development.

Implemented first:

- Add central API endpoints for consultations, recall records, and admin settings snapshots.
- Keep every central API query scoped by `clinic_id`.
- Make consultation create/update use the server PC API first, then browser storage as fallback.
- Make recall round/final save/delete use the server PC API first, then browser storage as fallback.
- Sync admin settings snapshots to the server PC API when settings change.
- Keep localStorage as a temporary development/offline fallback.

## Step 6 Scope

Step 6: add authenticated client data flow.

Initial Step 6 scope:

- Require approved client device token for client PC data API calls.
- Store approved device token on the client PC after pairing.
- Add lightweight auth checks to central app-data endpoints.
- Add client connection status UI so staff know whether they are saving to server PC or local fallback.

Implemented first:

- Require approved device token on non-local `/app-data/*` requests.
- Allow loopback server PC browser access without a client token for server-side administration.
- Store the approved client token on the client PC after pairing.
- Attach `X-Device-Id` and `X-Client-Token` automatically in client mode.
- Show a global storage status card: server storage, approval required, local fallback, or unchecked.
- Verify local app-data access, blocked LAN access without token, and successful LAN access with approved token.

## Completed Step 7

Step 7: add the first read-only Dentweb sync adapter.

Initial Step 7 scope:

- Persist selected Dentweb source path/connection info in server config.
- Add a read-only adapter interface for patient and appointment snapshots.
- Implement a mock/file-based adapter first so the sync engine can be tested safely.
- Add `POST /dentweb/sync-now` for manual read-only snapshot sync.
- Show last sync result and row counts in Admin Mode.

Implemented first:

- Persist the selected readable Dentweb source path in `.dentweb-local/server-config.json`.
- Add a JSON/file-based read-only adapter for patient and appointment snapshot arrays.
- Add `POST /dentweb/sync-now` and `GET /dentweb/sync-status`.
- Upsert synced snapshots into `dentweb_patients_snapshot` and `dentweb_appointments_snapshot`.
- Store every sync attempt in `sync_runs`.
- Show manual sync controls and latest sync result in Admin Mode.
- Verified `node --check`, `npm run lint`, `npx tsc --noEmit --incremental false`, `/health`, and `/dentweb/sync-status`.

## Next Step

Step 8: connect the read-only adapter to the real Dentweb source.

Initial Step 8 scope:

- Inspect the real Dentweb installation or export/database format on the server PC.
- Add a Dentweb source capability probe that reports which reader can be used.
- Keep the existing JSON/file adapter as a safe fallback and test harness.
- Add a read-only real-source adapter for patients and appointments once the schema is confirmed.
- Add diagnostics for connection failures, permission issues, and unsupported formats.

Implemented first:

- Add `POST /dentweb/source-probe` and `GET /dentweb/source-probe` as a read-only source capability probe.
- Detect JSON snapshot files, SQLite database files, Access candidates, Firebird candidates, and unknown files.
- Inspect JSON arrays without exposing raw patient values.
- Inspect SQLite table and column names read-only, without reading patient rows.
- Show source probe results in Admin Mode next to Dentweb discovery and connection testing.
- Add first-pass patient and appointment table mapping suggestions from SQLite table and column names.
- Show mapping confidence, score, and matched columns in Admin Mode.
- Add `GET /dentweb/source-mapping` and `POST /dentweb/source-mapping` for saving a confirmed read-only source mapping on the server PC.
- Add Admin Mode controls to save the top recommended patient/appointment table mapping and review the saved mapping.
- Make `POST /dentweb/sync-now` use the saved SQLite mapping when a mapped SQLite source is detected, while keeping the JSON snapshot adapter as the safe test fallback.
- Keep the mapped SQLite sync read-only and select only the mapped fields instead of reading full source rows.
- Add a manual mapping editor in Admin Mode so the server PC can adjust patient and appointment table/column mapping before saving it.
- Add `POST /dentweb/mapping-preview` for read-only masked sample validation before running sync.
- Add Admin Mode mapping preview UI that shows mapped fields, sample counts, warnings, and masked values only.
- Require a clean mapping preview before running read-only sync for mapped SQLite sources.
- Disable the Admin Mode read-only sync button until mapped SQLite sources pass preview without warnings.
- Add `GET/POST /dentweb/integration-status` as a final read-only readiness checklist for the server PC.
- Add Admin Mode integration status UI that shows central DB, Dentweb path, source probe, mapping, preview, and sync readiness in one place.
- Add `GET/POST /dentweb/schema-report` for a read-only schema report that ranks patient and appointment table candidates without exposing raw patient values.
- Add Admin Mode schema report UI to review candidate tables, matched columns, missing fields, and readable table inventory before confirming the mapping.
- Add read-only snapshot lookup endpoints: `GET/POST /dentweb/patients/search` and `GET/POST /dentweb/patients/appointments`.
- Add Admin Mode patient search test UI so synced Dentweb patient and appointment snapshots can be verified before wiring them into consultation registration.
