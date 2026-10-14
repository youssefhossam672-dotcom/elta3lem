# Elta3lem LMS — updated project

The existing Next.js interface uses server sessions, a server-only database layer and private file storage for registration, course subscriptions, payments, assignment submissions, and attendance.

**Database:** Microsoft SQL Server in production (`DATABASE_PROVIDER=sqlserver`, Windows authentication through ODBC Driver 18); SQLite for local development, the automated tests, and as the source of the one-time data transfer. There is no silent fallback between them. Start with:

- [docs/SQLSERVER_SETUP.md](docs/SQLSERVER_SETUP.md) — install, configure, permissions, migrations, scale
- [docs/SQLSERVER_CUTOVER.md](docs/SQLSERVER_CUTOVER.md) — backup, rehearsal, final cutover, rollback
- [docs/BACKUP_DR.md](docs/BACKUP_DR.md) — SQL Server backups, restore tests, RPO/RTO
- [SQLSERVER_MIGRATION_REPORT.md](SQLSERVER_MIGRATION_REPORT.md) — what was done and verified
- `scripts/windows/*.ps1` — guided PowerShell steps (00 … 12)

| Command | Purpose |
|---|---|
| `npm run db:check` | read-only connection / identity / permissions / contents check |
| `npm run db:migrate` (`-- --status`, `-- --dry-run`) | versioned SQL Server schema migrations |
| `npm run db:backup-sqlite` | verified SQLite backup (read-only snapshot + manifest) |
| `npm run db:transfer` / `npm run db:verify` | SQLite → SQL Server copy with row-level verification and report |
| `npm run test:sqlserver` | the test suite on SQL Server in throw-away `_Test` databases |
| `npm run db:seed-loadtest` | synthetic data for load tests (test databases only) |

## Run locally

Requires **Node.js 24 or later**.

```sh
npm install
npm run dev
```

Open http://localhost:3000 for the public home page; sign in at `/login` or create an account at `/register`. Create a Teacher account first. There are no bundled accounts or default passwords.

See `REDESIGN_REPORT.md` for the redesigned interface, role navigation, Admin supervision pages and Help Center.

1. The teacher creates courses under **Courses**, then configures **Payment Settings**.
2. Students register, open **Add Courses**, select a course/teacher, and click **Subscribe**.
3. Students complete external payment and upload a PNG/JPG receipt. The request becomes **Pending Verification**.
4. The course teacher approves or rejects the receipt under **Payment Verification**. Only approval activates the course.
5. Students see approved courses under **Courses**, and can upload PDF answers under **Assignments**.
6. Students find their permanent **Attendance QR** on their Dashboard and Profile.
7. The teacher opens **Attendance**, creates a course session, selects it, then uses the camera or a USB scanner. Duplicate scans in that session are ignored.

## Course structure and discovery

Teachers create each course as **Subject → Grade / Level → Group Name → Price (EGP)**, plus description, optional title and schedule. Each course row is one teaching group, so enrollments, attendance, assignments, quizzes and the Group report all follow it.

- Subjects come from the `subjects` table (sorted alphabetically, with **Other** last). Choosing **Other** asks for a subject name; a name that already exists (case-insensitive, extra spaces ignored) is rejected with “X already exists in the subject list…”. A new name is added once and offered to all teachers afterwards.
- Grade / Level reuses the student-registration grade options.
- Price is numeric (`courses.priceAmount`); `courses.price` stores the matching label (e.g. `500 EGP`) used by payments and reports.
- Students open **Add Courses** to *Browse by Subject* (subjects and teachers come from the courses teachers created; courses for the student's grade are shown first) or *Discover Teachers*. `/student/teacher/<id>` shows a teacher's public profile and every course group with grade, group and price, linking into the existing payment → approval flow. The student Dashboard shows a “Discover Our Teachers” section.

Migration `009_course_structure.sql` runs automatically at startup.

## Phone numbers and password reset

- Personal/account phone numbers must be valid Egyptian mobiles (010, 011, 012, 015) and are **unique across all roles**. Equivalent formats (`01012345678`, `+20 101 234 5678`, `00201012345678`, Arabic-Indic digits) are normalized to `01XXXXXXXXX`; `users.phoneNormalized` carries a UNIQUE index.
- A student's parent/guardian phone is validated the same way but is **not** unique — siblings can share it.
- Forgot password sends a 6-digit SMS code (Twilio or Vonage — see `.env.example`). Codes expire after 10 minutes, are stored only as salted hashes, allow 5 attempts, and can be resent after 60 seconds (plus per-phone/per-IP limits). A verified code is exchanged for a single-use reset token.
- Migration `010_phone_identity_and_otp.sql` runs automatically at startup. It deletes nothing; accounts that already shared a phone are listed in the `phoneConflicts` table for review.

## Profile pictures

Teachers choose a photo, then position/zoom it inside a circular guide. Only the cropped **square** JPEG (up to 800×800) is uploaded; the server checks that it is square and stores it as PNG (max 1024×1024).

## Assistants

Copy the teacher's Account ID (for example `T194762`) from **Profile**, **Dashboard**, or **Assistants**. Assistant registration requires this ID and verifies that it belongs to a Teacher. The teacher then grants content management and/or attendance access in **Assistants**. Until granted, those actions are denied. Assistants never receive payment-verification or payment-settings privileges.

## Account management (Admin)

**Admin → User Management → All Users** has an **Actions** menu (⋯) on every Student, Teacher and Assistant: **View user**, **Suspend account**, **Reactivate account**, **Delete account**. Suspension needs a reason and a duration (1/3/7/14/30 days, a custom end date, or until reactivated). It's enforced on the server for every request, including sessions that were already signed in, and it lifts by itself when the end date passes. **Delete account is permanent**: the account row is removed from the database in one transaction, following an explicit per-table policy (private data deleted, financial records kept de-identified, a teacher's courses transferred to another teacher or removed by the admin's explicit choice). Every session is invalidated and the account can no longer sign in. The **Attendance review** tab flags students whose monthly attendance % is below the minimum set under **Settings → Student attendance policy** (default 25%). Nobody is suspended automatically. Details: `ACCOUNT_MANAGEMENT_REPORT.md`.

The interface language (English / العربية, right-to-left) is chosen from the language button in every header or **Settings → Language**. It is stored in the `elta3lem-locale` cookie, read by the server in `app/layout.tsx` (so pages arrive with the right `<html lang dir>`), and applied immediately by the single `I18nProvider`. Every account has a permanent, randomly generated Account ID: role prefix + exactly six digits (`S583921`, `T194762`, `A736205`, `AD482193`). Course subjects are stored with a stable id and shown in the selected language. Details: `DELETION_IDS_SUBJECTS_REPORT.md` (deletion, random IDs, subjects) and `LANGUAGE_AND_ACCOUNT_IDS_REPORT.md` (language) (`npm run verify:locale` checks a running server).

## Configuration and storage

Copy `.env.example` to `.env.local` if configuration is needed:

- `LMS_DATA_DIR`: absolute path to persistent writable storage; defaults to `./data`.
- `LMS_ORIGIN`: optional. Extra allowed origin(s) for POST requests, comma-separated, such as `https://school.example`. Requests from the same host the browser used (localhost, 127.0.0.1, a LAN address, or `X-Forwarded-Host` behind a proxy) are always accepted; other sites are rejected.
- `LMS_ADMIN_INVITE`: private invitation code required for administrator registration. Omit to disable public admin signup. Admin does not require National ID.

Database: `data/lms.sqlite`. Uploads: `data/uploads/`. Back up the database and uploads together. Keep this directory private and outside the web server's public directory. Uploaded files are delivered through authenticated, ownership-checked endpoints.

The first server request applies `migrations/001_initial.sql` transactionally. Applied migration filenames are tracked, so subsequent starts do not recreate or reset data. No existing real database was present in the supplied demo. Old browser-only demo accounts/subscriptions are not imported or treated as verified records.

Uploads: assignment PDF **10 MB**; payment QR/receipt PNG or JPG **5 MB** and at most 25 megapixels; lesson MP4 **100 MB**. PDFs are parsed before acceptance. Images are decoded and re-encoded, and only storage identifiers are written to database records.

## Production

```sh
npm run build
npm start
```

Deploy as a persistent Node.js service with HTTPS and a persistent data volume. This version requires a server; static export/static-only hosting cannot run its protected APIs. Use a single application instance with the local SQLite database. Set the reverse proxy upload limit high enough for the supported file sizes. HTTPS (or localhost) is required for camera access. Secure session cookies are enabled in production.

The existing unrelated demo areas (for example grades, progress, calendar, messaging and administrative sample dashboards) remain demo features. Password reset/email delivery were not implemented by the source and remain outside this update.

## Verification

```sh
npm run check
npm test
npm run build
```

`npm test` runs isolated database/service checks. The HTTP group is skipped unless `LMS_TEST_URL` is supplied. To run it, start a separate development server with an isolated data directory, then point the tests at that server. Example in PowerShell, from the project directory:

```powershell
# Terminal 1: isolated test server; do not point this at production data.
$env:LMS_DATA_DIR = Join-Path (Get-Location) 'tests/http-data'
npm run dev -- --port 3100

# Terminal 2
$env:LMS_TEST_URL = 'http://localhost:3100'
npm test
```

The HTTP tests create synthetic accounts/files and exercise authentication, QR persistence and decoding, upload validation, payment approval, file access, and attendance. Test databases and generated files are excluded from the delivered source ZIP.

The supplied Vite-only development plugin has an existing peer dependency mismatch. `.npmrc` permits the original dependency tree; the active application uses Next.js. The npm lockfile is the tested installation. The original pnpm 10.4.1 lockfile has also been updated.

See `UPDATE_REPORT.md` for the latest changes (uploads list, quiz late policy, report builder and PDF). See `IMPLEMENTATION_REPORT.md` for the change inventory, verification results, and manual checks.
