# Admin account management — implementation report

> **Superseded in part:** “Delete” is now a PERMANENT deletion (not a soft delete). See `DELETION_IDS_SUBJECTS_REPORT.md`.

Admin → User Management → **All Users**: View / Suspend / Reactivate / Delete for Students, Teachers and Assistants. The path is Admin UI → server authorisation → business logic → database → session enforcement.

## Files

**New**
- `migrations/011_account_management.sql`: adds account-status columns, `platformSettings` and `adminAuditLog`. Non-destructive.
- `app/lib/server/account-status.ts`: decides whether an account has access, lifts expired suspensions automatically and writes audit entries.
- `app/lib/server/accounts.ts`: admin operations (suspend, reactivate, soft delete, view), related records, payment flags, the attendance review and the threshold setting.
- `app/lib/account-policy.ts`: reasons, durations and the delete-confirmation word, shared by the server and the UI.
- `app/lib/i18n-messages.ts`: English and Arabic dictionaries and `translate()`.
- `app/lib/i18n.tsx`: the `useI18n()` hook and language switching (sets `lang` and `dir` on `<html>`).
- `app/components/AccountManagement.tsx`: action menu, dialogs, status cell, attendance review, threshold form, audit panel, language controls and the suspended-account notice.
- `app/account-suspended/page.tsx`: the page a suspended user sees.
- `tests/account-management.test.ts` and `tests/account-http.test.ts`.

**Changed**
- `app/lib/server/auth.ts`: `sessionAccess`, `accessForToken`, `assertAccessAllowed`, `createSessionToken`. `teacherScope` now blocks an assistant whose teacher is suspended or deleted.
- `app/lib/server/db.ts`: migration race fix (see below).
- `app/lib/server/service.ts`: admin lists carry account status; deleted accounts are hidden; payment flags; new admin actions; payment and attendance guards for inactive accounts; password reset refuses deleted accounts.
- `app/api/[...path]/route.ts`: login refuses suspended and deleted accounts; new admin GET endpoints.
- `app/[role]/[...slug]/page.tsx`: a suspended session is redirected to `/account-suspended`.
- `app/components/AdminWorkspace.tsx`: the All Users page (actions, status filter, flags, Attendance review tab) and the Settings panels.
- `app/components/WorkspaceShell.tsx`: language toggle; a suspended session is redirected.
- `app/Elta3lemApp.tsx`: translated suspension message at login.
- `app/layout.tsx`: applies the saved language before first paint.
- `app/globals.css`: styles for the new controls, plus RTL overrides for shared primitives (tables, selects, sidebar drawer).
- `scripts/run-tests.mjs`, `README.md`.

## Database (migration 011)

The migration only uses `ADD COLUMN`, `CREATE TABLE` and `INSERT OR IGNORE`. No table is rebuilt and no row is deleted. Every existing account starts as `active`.

- `users.accountStatus` (`active` | `suspended` | `deleted`, CHECK constraint) is the single authoritative access status.
- Suspension columns: `suspendedAt`, `suspendedUntil` (NULL means indefinite), `suspensionReasonCode`, `suspensionReason` (shown to the user), `suspensionNote` (admin only), `suspendedBy`.
- Deletion columns: `deletedAt`, `deletedBy`.
- `platformSettings(key, value, updatedAt, updatedBy)` is seeded with `studentMinMonthlyAttendancePercent = 25`.
- `adminAuditLog(id, adminId, action, targetUserId, details JSON, createdAt)`.

The existing "workspace" statuses are not duplicated. Teacher subscription states (Pending / Active / Expired), assistant "Access granted" and student enrollments still come from their own tables. All Users shows Suspended or Deleted on top of them.

**Migration race fix.** `db.ts` used to set `journal_mode=WAL` before `busy_timeout`, and it checked "already applied?" outside the write lock. When several processes opened a fresh database at once (for example `next build` workers), some failed with `database is locked` and others with `duplicate column name`. Reproduced: 25 failures in 5 runs of 6 processes. Now `busy_timeout` is set first and the check is repeated inside `BEGIN IMMEDIATE`. Result: 0 failures in 10 runs of 8 processes. A regression test is included.

## Suspension

- **Reasons:** non-payment, unethical or inappropriate behaviour, attendance violation (students only), administrative decision, and "Other". "Other" requires a reason of at least 3 characters. Reasons are stored as free text, so new ones need no schema change.
- **Durations:** 1, 3, 7, 14 or 30 days; a custom end date and time; or until manually reactivated. A custom end must be at least 1 minute in the future and no more than 5 years away.
- **Server enforcement:** every authenticated page and API request goes through `sessionAccess()` → `accessForToken()`. This re-reads the account from the database each time, so an existing cookie cannot bypass a suspension. `requireUser()` returns 403 `ACCOUNT_SUSPENDED` with the reason and end date (never the internal note). Workspace pages redirect to `/account-suspended`. Login is refused with the same message, but only after the password has matched, so account status is never revealed to someone without the password.
- **Effect on other accounts:** a suspended teacher also blocks their assistants' teacher-scoped work. New payments to that teacher's courses are paused. Their attendance QR scans are refused.
- **Automatic expiry:** the project has no scheduler, so each authenticated request runs `expireDueSuspensions()`, an indexed query. Any suspension past its end date is lifted and logged once as `suspension_expired` (admin = system).
- **Reactivation:** requires `confirm: true`. Only the suspension columns change; it is the same account row and every course, subscription, grade and other record stays as it was. The user's existing session works again immediately.

## Attendance rule

The project already measures **attendance %** (teacher reports: present ÷ sessions held), so the rule keeps that model. Within the selected month, in the admin's own time zone:

- **Applicable sessions:** sessions held for the student's enrolled courses from one day before their enrollment date (the same rule the teacher reports use), plus any session they checked in to. Other courses are not counted.
- **Attended:** applicable sessions with a check-in record.
- **Absent:** applicable − attended.
- **Attendance %** = attended ÷ applicable × 100. **Absence %** = absent ÷ applicable × 100.
- **Flagged** when attendance % is below the minimum. The comparison is exact, with no rounding: exactly 25% is not flagged at a 25% minimum.
- A month with 0 applicable sessions is shown as "No sessions". There is no division by zero and the student is not flagged.

Admins change the minimum under **Admin → Settings → Student attendance policy**. The default is **25%**; it accepts 0–100 with up to 2 decimals and is validated on the server. The All Users **Attendance review** tab shows, for each student: month, applicable, attended, absent, attendance %, absence %, minimum, status and a per-course breakdown. Flagged students also get a "Low attendance" chip in the users table. Nobody is suspended automatically: suspending from the review pre-fills the "Attendance violation" reason, and the admin decides.

## Non-payment and behaviour

- **Payment flags** come only from real records. A teacher is flagged when their latest platform subscription is payment-required, rejected or expired. A student is flagged for rejected course payments or unconfirmed cash payments. The flags are warnings and pre-fill the "non-payment" reason. Nothing is suspended or deleted automatically.
- **Behaviour** suspension is purely an admin decision, with a required reason and confirmation. It is never inferred from data.

## Delete: soft delete

Every academic and financial table (enrollments, payments, submissions, quiz attempts, attendance, courses, content, subscriptions, files) references `users(id)` without cascade, and those rows are other people's history too. A hard delete would either fail on foreign keys or destroy grades, attendance and payments. So deletion:

- sets `accountStatus='deleted'`, `deletedAt` and `deletedBy`
- revokes all sessions and closes open password-reset requests
- refuses sign-in and password reset from then on
- hides the account from all normal admin lists (All Users shows it under the "Deleted" filter)
- removes a deleted teacher from the student teacher directory and from new-course discovery

Every related record is kept. The dialog shows the name, role, a warning and a count of related records per type, and requires typing `DELETE`; the server checks the same word. Deleting your own account or an admin account is refused.

## Audit and security

- **Audit actions:** `user_suspended` (reason, note, start, end, duration), `user_reactivated`, `user_deleted` (with a snapshot of preserved-record counts), `suspension_expired`, `settings_updated` (from → to). Each entry records the admin and a timestamp. Visible to admins only: per user under **View user**, and as a list under **Settings → Account activity**.
- **Authorisation:** every admin endpoint calls `requireAdmin()` on the server.
- **Allowed targets:** only student, teacher and assistant accounts can be managed, and never the acting admin.
- **Input validation:** the IDs, reason, duration, date, percentage, month and confirmation fields are all checked on the server. Errors carry a stable `code` that the UI translates.
- **Existing protections kept:** the cross-origin POST check and login rate limiting.
- **Data exposure:** National ID, password hash and QR token are never selected.

## Arabic, English, RTL, responsive, dark mode

The project had no i18n system, so a small one was added: `useI18n()`, the language saved per device, and `<html lang dir>` set before paint. There are **225 keys**, each with English and Egyptian-friendly Arabic, and a test checks that both languages have every key with matching placeholders. The feature's strings and the All Users page chrome use it. *Superseded:* the whole application is now translated with one cookie-based language state; see `LANGUAGE_AND_ACCOUNT_IDS_REPORT.md`.

The new controls use logical CSS properties (`inset-inline`, `text-align: start`). RTL overrides were added for shared tables, selects, sort icons and the sidebar drawer. The drawer now slides in from the right in Arabic; before, it caused horizontal scrolling. The menu and dialogs render into `<body>`, so a transformed ancestor never shifts them, and they are clamped to the viewport. All colours are design tokens, so light and dark mode both work.

## Verification (in the sandbox; npm was unreachable)

- **`npm test` equivalent:** the real runner with a shim for `next/headers` only. **26 passed, 0 failed, 2 skipped.** The skipped ones are the live-server HTTP suites.
- **New HTTP suite:** passes against the harness server, which runs the real route handler on a real SQLite database.
- **Type check:** `tsc` with loose stubs for the packages that couldn't be installed. No new type errors compared with the original; the 7 that remain are stub artefacts and appear in the original too.
- **UI:** the real components, bundled with esbuild, were run in headless Chromium at 1366, 1024, 768 and 390 px, in EN and AR, light and dark.
  - No page errors.
  - No horizontal overflow.
  - Menus and dialogs stay inside the viewport.
  - Full suspend → blocked → reactivate → delete flow works through the UI.
  - Every Admin, Teacher, Assistant and Student page (53 routes × 2 languages) loads without errors.
- **Not run here:** real `next build` and the full `tsc` against real React and Next types. Run these on your machine:

```sh
npm ci
npm run check
npm test
npm run build
```

## `.next` "End of file expected" warning

`.next/trace` is a newline-delimited JSON log: one JSON array per line. VS Code parses it as a single JSON document and stops at line 2. It is a generated file, not source and not a build error. If the build itself fails, stop the server, delete `.next` and run `npm run build`.

## Known limitations

- (Resolved since: the whole UI is translated — see `LANGUAGE_AND_ACCOUNT_IDS_REPORT.md`.)
- A deleted account keeps its email and phone reserved, so they can't be reused for a new registration. This is intentional, to keep history unambiguous.
- Absences during a suspension count toward that month's attendance, because a suspended student can't be checked in.
