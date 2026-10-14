# Elta3lem: SQL Server migration report

## Status in one paragraph

The application is ready to run on SQL Server. It has a server-only data
layer for SQLite and SQL Server, versioned T-SQL migrations, a verified
SQLite → SQL Server transfer tool, least-privilege security scripts,
backup/DR scripts, PowerShell runbooks, load tests and documentation. It
builds and is tested against SQLite in this workspace.

**No real SQL Server connection has been made yet.** `localhost\MSSQLSERVER03`
is on your Windows computer, and that computer was not reachable from this
session, so nothing here has run against `Elta3lemDB`. That database has not
been inspected, created into, written to or altered. Everything that needs
your SQL Server is marked **BLOCKED** below, together with the exact command
that completes it.

**The final cutover needs your approval.** Do not run
`scripts\windows\10-Cutover.ps1` until you have approved it.

## Classification of the 37 required items

The original numbered list was not available when this report was written
(the conversation history was compacted). The 37 items below follow the
order and wording of the sections of the request.

Legend:
* **COMPLETE AND VERIFIED** means implemented and exercised here by
  automated tests or real runs.
* **IMPLEMENTED BUT NOT VERIFIED** means the code or script exists but needs
  your SQL Server or Windows to run.
* **BLOCKED** means it needs access that this session did not have.
* **NOT IMPLEMENTED** means it was not done.

| # | Requirement | Status | Evidence / what remains |
|---|---|---|---|
| 1 | Inspect the existing SQL Server and Elta3lemDB first; stop if it holds conflicting objects | **BLOCKED** (tooling COMPLETE AND VERIFIED) | `npm run db:check` is read-only and classifies the database as EMPTY, ELTA3LEM or OTHER. `db:migrate` refuses OTHER without changing anything (tested). Run `scripts\windows\01-Test-SqlConnection.ps1` on your PC. |
| 2 | Use `localhost\MSSQLSERVER03`, Windows auth, no port assumption, no `sa`, no new instance, do not recreate Elta3lemDB | IMPLEMENTED BUT NOT VERIFIED | `.env.example` and `db.ts`: the named instance is resolved by the Browser service, `Trusted_Connection=yes`, and no CREATE/DROP DATABASE touches Elta3lemDB. Test databases are always `*_Test_*`. |
| 3 | Never claim a real connection that did not happen | COMPLETE | No connection is claimed anywhere. `db:check` prints "CONNECTED" only after a real query succeeds. |
| 4 | Verified SQLite backup with documented location | COMPLETE AND VERIFIED (sandbox) | `npm run db:backup-sqlite` makes a VACUUM INTO copy through a read-only connection, runs an integrity check, takes row counts and a SHA-256, and writes a manifest. Default location is `backups\sqlite\`. Ran here on a 1.2 GB / 500k-account test database. **On your PC:** `03-Backup-Sqlite.ps1`. |
| 5 | No data loss; never reset, delete or overwrite the SQLite file; no regenerated accounts, hashes, UUIDs or Account IDs | COMPLETE AND VERIFIED | The source is only opened read-only. The transfer refuses an out-of-date SQLite schema rather than upgrading it, because an upgrade could issue new IDs. Values are copied byte for byte and checked per row by fingerprint. Tested by `sqlserver-migration.test.ts` and the existing suite. |
| 6 | Staging/test database for trial migrations; never run destructive tests on real data | IMPLEMENTED BUT NOT VERIFIED | `05-Transfer-Rehearsal.ps1` uses `Elta3lemDB_Staging`. `npm run test:sqlserver` creates throw-away `Elta3lemDB_Test_<run>_<n>` databases, refuses any prefix not ending in `_Test`, and drops only the databases it created in that run. |
| 7 | SQL Server is the production database; no silent fallback to SQLite | COMPLETE AND VERIFIED | `DATABASE_PROVIDER` must be set in production. An unreachable server returns 503, not SQLite. `/api/health` reports the provider (checked over HTTP). |
| 8 | Centralised server-only DB layer; no credentials or connections in the browser; no `NEXT_PUBLIC_` secrets | COMPLETE AND VERIFIED | Everything goes through `app/lib/server/db.ts`. There are no `NEXT_PUBLIC_` database variables (grep). UI components only call `/api`. |
| 9 | Supported Windows-auth driver (msnodesqlv8 / ODBC 18); no credentials in code | IMPLEMENTED BUT NOT VERIFIED | `mssql` 12 with `mssql/msnodesqlv8` and our own ODBC connection string. The driver source was reviewed, but the native module cannot be built or run here. |
| 10 | Check the Node process identity and its permissions | IMPLEMENTED BUT NOT VERIFIED | `db:check` shows the process identity, the SQL login, the authentication scheme, the database user, roles and `fn_my_permissions`, and warns about sysadmin/db_owner. |
| 11 | Least privilege; separate migration and runtime privileges | IMPLEMENTED BUT NOT VERIFIED | `sql/security/01–03` define `elta3lem_app` (DML only, no DDL, DENY on the migration log and registry deletes) and `elta3lem_migrator` (ddladmin + read/write). Runbook: `12-Grant-Least-Privilege.ps1`. |
| 12 | `.env.example` server-side only; validated encryption in production; local certificates documented | COMPLETE (docs and config) | Encryption is on and the certificate is validated by default. `TRUST_SERVER_CERTIFICATE` is documented as development-only (`docs/SQLSERVER_SETUP.md` §3). |
| 13 | Complete schema conversion: Unicode, correct types, constraints, no cascades, UTC timestamps | COMPLETE AND VERIFIED (syntax/structure); NOT VERIFIED on a server | `001_baseline_schema.sql`: all 26 application tables plus `legacySqliteMigrations`, NVARCHAR text, DATETIMEOFFSET(3) in UTC, BIT/DECIMAL/FLOAT, ISJSON checks, NO ACTION foreign keys, filtered unique indexes, ported triggers. A test checks that every SQLite table and column exists in SQL Server and vice versa. All statements except the 4 trigger bodies parse as T-SQL (sqlglot), and the trigger bodies were reviewed by hand. |
| 14 | Versioned, ordered, traceable, locked, non-destructive migrations; dedicated command, not requests; no duplicate-column race | COMPLETE AND VERIFIED (logic); NOT VERIFIED on a server | `npm run db:migrate`: SHA-256 checksums, one transaction per file, `sp_getapplock` with a re-check under the lock, `--status` and `--dry-run`. The app refuses an outdated schema. Tests cover ordering, idempotency, edited-file refusal, foreign-database refusal, the lock in every transaction, and no DROP/TRUNCATE/DELETE. |
| 15 | Migration utility: read-only and consistent; batches and transactions; safe retry; counts; duplicate and invalid-reference detection; report; no silent drops; sanitised errors | COMPLETE AND VERIFIED (validation and SQL generation); NOT VERIFIED loading into SQL Server | `db:transfer` and `db:verify` (`app/lib/server/data-transfer.ts`). Validation, duplicate detection under SQL Server rules, orphan cascades, load ordering, the registry/trigger ordering and the 2000-parameter batches are tested on a real populated SQLite database. The generated MERGE/UPDATE/verify SQL parses as T-SQL. Reports are JSON + Markdown, keys only, sensitive keys hashed, values stripped from error messages. |
| 16 | Cutover: maintenance window / write freeze, rehearsal, validation, rollback readiness; never delete SQLite | COMPLETE AND VERIFIED (freeze); IMPLEMENTED (procedure) | `ELTA3LEM_MAINTENANCE=read-only` refuses every write. Signed-in users can still read (tested for all roles). `--final` proves the source did not change during the copy. `--finalize` blocks any later copy into the live database. Procedure and rollback: `docs/SQLSERVER_CUTOVER.md`, `10-Cutover.ps1`. **Awaiting your approval.** |
| 17 | Preserve the Account ID system (S/T/A/AD + 6 digits, CSPRNG, database-level uniqueness, never reused, registry kept) | COMPLETE AND VERIFIED (SQLite); IMPLEMENTED (SQL Server triggers) | The allocator is unchanged (`crypto.randomInt`). The registry is copied as is. The SQLite triggers are ported (THROW 51001–51005, same messages). No IDENTITY values are used as public IDs. The ID tests now run through the portable API on both providers. |
| 18 | Preserve authentication, sessions, OTP, suspension and deletion | COMPLETE AND VERIFIED (SQLite) | The whole existing suite passes through the new async layer: 86 tests, 84 pass, 0 fail, 2 skipped (those 2 need a running Next.js server and were already skipped). Password hashing now uses async scrypt with the same format, and a test confirms that old hashes still verify. |
| 19 | All 4 roles' permissions enforced on the server | COMPLETE AND VERIFIED (SQLite) | Existing role tests pass unchanged. The new admin endpoints call `requireAdmin` (tested: a teacher gets 403). |
| 20 | Permanent-deletion policy preserved | COMPLETE AND VERIFIED (SQLite); IMPLEMENTED (SQL Server branch) | The reference discovery reads `sys.foreign_key_columns` on SQL Server and PRAGMA on SQLite. Deletion tests pass. The SQLite-only failure-injection test is skipped on SQL Server. |
| 21 | Bilingual subjects, Arabic/English, RTL, tested through the backend | COMPLETE AND VERIFIED (SQLite); IMPLEMENTED (SQL Server Unicode) | NVARCHAR plus Unicode parameter binding (non-ASCII text is sent as NVARCHAR). 18 subjects are seeded with Arabic names (`002`). Arabic names were carried through the transfer validation test and the admin search test. |
| 22 | Indexing | IMPLEMENTED BUT NOT VERIFIED on SQL Server | `003_performance_indexes.sql`: every foreign key to `users`, the admin list orders, search columns and housekeeping. The same index set applied to a 500k-account SQLite copy changed timings as recorded below. |
| 23 | Server-side pagination and search | **PARTIAL**: users COMPLETE AND VERIFIED; other lists capped | The All Users, Students, Teachers and Assistants searches use `GET /api/admin-users` (paginated, prefix/indexed) across all accounts. Verified in the browser on 500k accounts: an account outside the loaded window was found. The teacher profile is computed on the server. Enrollments, payments, content and grades are windowed to the newest rows, show exact totals and display a notice, but are not paginated. **The student course catalog is still loaded whole (NOT IMPLEMENTED; see limits).** |
| 24 | No N+1 queries | COMPLETE (reviewed) | Lists use joins and aggregates. The quiz-save loop and per-row deletion checks are bounded per entity, not per platform row. Teacher activity uses grouped counts. |
| 25 | Pooling that survives hot reload; timeouts; bounded retries; no blind write retries | IMPLEMENTED BUT NOT VERIFIED on SQL Server | A single pool on `globalThis`, connect and request timeouts, 2 s back-off, retries only for whole transactions marked safe and only on deadlock (1205/3960). Rate-limit and totals sweeps are throttled. |
| 26 | Structured logging without sensitive data | COMPLETE (reviewed) | JSON log lines with error code and number, never parameters or rows. Transfer reports strip literals, e-mails and long numbers. A test checks that no OTP or personal values appear. |
| 27 | Concurrency correctness (no duplicate enrollments, payments or IDs; no lost updates) | COMPLETE AND VERIFIED (SQLite); IMPLEMENTED (SQL Server locking hints) | New tests: 6 simultaneous quiz submissions with maxAttempts=1 give exactly 1; two simultaneous reviews of one payment give one winner and a consistent enrollment. MERGE HOLDLOCK and UPDLOCK/HOLDLOCK insert-if-missing are used on SQL Server, and subscription approval and rejection are conditional. The earlier multi-process Account ID race test still passes. |
| 28 | Files on disk / object storage, metadata in SQL Server; shared storage documented | COMPLETE (unchanged design + docs) | `LMS_UPLOAD_DIR` is documented for shared SMB storage. Uploads are refused during the write freeze. |
| 29 | Security: parameterised queries, least privilege, no `sa`, secure logging, TLS, backup security | IMPLEMENTED (+1 pre-existing hole fixed) | All values are `@pN` parameters, and identifiers are allow-listed. **Fixed:** in production, administrator sign-up no longer accepts the built-in default invitation `test123`. Without `LMS_ADMIN_INVITE` it is closed. Registration rate limiting is now per client address, not one global counter. |
| 30 | Backup/DR: full, differential, log; recovery model; retention; encryption; off-server copies; restore testing; RPO/RTO; failure monitoring | IMPLEMENTED BUT NOT VERIFIED | `sql/backup/00–05` and `docs/BACKUP_DR.md`: proposed RPO ≤ 15 min, RTO to be measured with the restore test, retention, Express/Standard encryption notes, a monitoring script that exits with an error when backups are late. |
| 31 | Development vs production; no hard-coded localhost; hosted SQL Server / Azure SQL options | COMPLETE (config + docs); Azure managed identity NOT IMPLEMENTED | Everything comes from environment variables. `sql` authentication mode exists for hosted servers. Azure AD / managed identity is documented as an extension point only. |
| 32 | k6 load-test scenarios; never fabricate; implemented vs tested | IMPLEMENTED; partially run (sandbox only) | `loadtest/` has smoke, students, admin and login-burst scenarios plus `npm run db:seed-loadtest`. All pass `k6 inspect`. They ran **only** against the sandbox (SQLite, one process); see the results below. **Not run against SQL Server.** |
| 33 | Automated SQL Server tests in isolated test databases covering the full areas | IMPLEMENTED BUT NOT VERIFIED | `npm run test:sqlserver` runs the same 86-test suite on SQL Server (SQLite-specific tests skipped there), with one new database per file. The tests were made provider-portable: `insertIgnore`/`upsert`/`foreignKeyViolations` replace SQLite-only SQL. |
| 34 | Verify the real Next.js app on SQL Server | **BLOCKED** | Needs your PC. Run `08-Typecheck-Build.ps1`, then `09-Start-With-SqlServer.ps1`, which confirms through `/api/health` that the provider is `sqlserver`. In this session the real route handler and the real React components ran over HTTP in a harness on SQLite. |
| 35 | `npm run check` / `npm test` / `npm run build` | `npm test` COMPLETE AND VERIFIED; check/build **BLOCKED** | `npm test`: 86 tests, 84 pass, 0 fail, 2 skipped. Next.js and the full dependency tree cannot be installed here (the package registry is blocked), so `tsc` ran with type stubs. Server code, scripts and tests have 0 errors. The UI components have no new type errors compared with the original project (identical error set from stubs). `npm run build` was not run. |
| 36 | PowerShell scripts for every listed step; prompt before anything irreversible; never silently delete | IMPLEMENTED; parse-verified | `scripts/windows/00–12` all parse with PowerShell 7.4. The helpers were run here. Every write step asks first, and real databases require typing the database name. Nothing deletes except the test runner dropping the `_Test` databases it created itself. |
| 37 | Audit, plan, documentation and honest final report | COMPLETE | `docs/SQLSERVER_SETUP.md`, `docs/SQLSERVER_CUTOVER.md`, `docs/BACKUP_DR.md`, `README.md`, this report. |

## How this was verified in this session

**Test suite.**
* `npm test` on SQLite: 86 tests, 84 pass, 0 fail, 2 skipped (they need a
  running Next.js server).
* New tests cover:
  * the translator (including `LIMIT … OFFSET` → `OFFSET … FETCH`);
  * the migration runner rules;
  * SQLite ↔ SQL Server schema parity;
  * transfer validation and its rejection cases;
  * admin totals, windows and search;
  * rate-limit window restart;
  * async scrypt compatibility;
  * the maintenance write freeze;
  * the concurrency races.

**T-SQL validation.**
* Every SQL statement the application executed during the whole test suite
  (430 unique statements) was translated to T-SQL and parsed (sqlglot,
  T-SQL dialect): 0 errors.
* The same statements were linted for constructs SQLite accepts but SQL
  Server rejects (predicates in SELECT, bare BIT conditions, incomplete
  GROUP BY, DISTINCT + ORDER BY, timestamp = `''`, and others): 0 findings.
  The linter was itself checked against known-bad samples.
* The migration files and the generated transfer SQL also parse (except
  trigger bodies, which the parser does not support; they were reviewed by
  hand).
* **Parsing proves syntax, not execution on SQL Server.**

**Scale data.**
* A 500,000-student database (2,000 teachers, 10,000 courses, 1,000,000
  enrollments, 1,000,000 payments) was generated with the new seeder.
* The admin UI was driven in Chromium against the real API route handler.
* The k6 scenarios were run against it.

## Measured numbers (sandbox only, SQLite, one Node process)

These are **not SQL Server numbers**. SQLite here runs synchronously on a
single connection, so concurrent requests queue behind each other. Use them
only to compare behaviours.

**Service level (median):**

| Operation | Time |
|---|---|
| Old behaviour: load all students | 4.7 s |
| Old behaviour: all enrollments with joins | 14.3 s |
| Admin state, windowed (before the totals cache) | 4.7 s |
| Admin search, Account ID prefix | 0.2 s |
| Admin search, e-mail prefix | 0.4 s |
| Admin search, name | 1.1 s |
| Teacher activity profile | 3 ms |
| `state(teacher)` | 11 ms |
| `state(student)` | 168 ms |

**HTTP and UI:**
* **Attendance review.** It was 26 s and a **185 MB** response at 500k
  students. It is now scoped to students in courses that held sessions:
  0.27 s.
* **Admin dashboard in the browser:** about 8 s to first render.
* **k6 on the sandbox:**

| Scenario | Errors | Latency |
|---|---|---|
| Login burst, 20/s for 1 min | 0 | p95 75 ms |
| 50 student VUs | 0 | `GET /api/state` p95 3.2 s |
| 5 admin VUs | 0 | search p95 6.3 s |

SQL Server numbers must be measured on your hardware with `loadtest/README.md`.

## Known limits and recommended next steps

1. **The student course catalog** (`GET /api/state` for students) includes
   every course and every teacher. At the test size this was 4.4 MB per page
   load. The discovery page derives its subjects and teacher rankings from
   that full list. Recommended: a paginated discovery endpoint (subject →
   teachers → course groups), with `CourseDiscovery` reading from it. This
   was not changed because it is a redesign of the student discovery page.
2. **Account ID capacity** is 1,000,000 per role, and IDs are never reused.
   500k students uses half of the student range. Plan an agreed format
   extension before about 900k students. The format was not changed, as
   required.
3. **Admin monitoring lists** (enrollments, payments, content, grades) show
   the newest `ADMIN_LIST_WINDOW` rows, with exact totals and a notice, but
   no paging or server-side filtering.
4. **Attendance review** at very large activity still computes in memory for
   every student in courses that held sessions. A monthly summary table is
   the next step if that becomes slow.
5. **Lock files** (`package-lock.json`, `pnpm-lock.yaml`) do not yet include
   `mssql`, `msnodesqlv8` or `@types/mssql`. Run `npm install` once (not
   `npm ci`) and commit the updated lock file.
6. **Azure AD / managed identity** authentication is not implemented.

## What to run on your PC (in order)

1. `scripts\windows\00-Check-Prerequisites.ps1` (read-only)
2. `scripts\windows\02-Install-Dependencies.ps1`
3. `scripts\windows\01-Test-SqlConnection.ps1` (read-only). **Send me the
   output.** It tells us whether Elta3lemDB is EMPTY, ELTA3LEM or OTHER, and
   which identity connects.
4. `scripts\windows\03-Backup-Sqlite.ps1`
5. `scripts\windows\07-Run-Tests.ps1` (SQLite and SQL Server suites)
6. `scripts\windows\08-Typecheck-Build.ps1`
7. `scripts\windows\05-Transfer-Rehearsal.ps1`, then
   `11-Show-Migration-Report.ps1`
8. **Your approval**, then `scripts\windows\10-Cutover.ps1`, then
   `09-Start-With-SqlServer.ps1`

## Files

**New:**
* `app/lib/server/`: `schema-migrations.ts`, `data-transfer.ts`,
  `admin-lists.ts`
* `migrations/sqlserver/001–004`
* `scripts/db/`: `common.ts`, `check.ts`, `migrate.ts`, `backup-sqlite.ts`,
  `transfer.ts`, `seed-loadtest.ts`
* `scripts/windows/*.ps1`
* `sql/security/*`, `sql/backup/*`
* `loadtest/*`
* `docs/*`
* `tests/sqlserver-migration.test.ts`
* `.gitignore`

**Changed:**
* `app/lib/server/`: `db.ts` (pool and transfer helpers, chunked IN lists,
  FK check), `sql-dialect.ts` (OFFSET/FETCH, THROW mapping, bounded cache),
  `service.ts` (admin window and totals, conditional reviews, atomic quiz
  attempts, admin invite in production), `auth.ts` (async scrypt, rate
  limit), `account-status.ts` (write freeze), `accounts.ts` (scoped
  attendance review), `reports.ts` and `account-ids.ts` (2100-parameter
  chunking)
* `app/api/[...path]/route.ts` (admin endpoints, per-IP registration limit)
* `app/components/AdminWorkspace.tsx` (totals, server search, window
  notices, server-side teacher profile)
* `app/lib/i18n-ui-ar.ts` (one Arabic string)
* `scripts/run-tests.mjs` (`--sqlserver`)
* tests, made provider-portable
* `package.json`, `next.config.mjs`, `.env.example`, `README.md`
