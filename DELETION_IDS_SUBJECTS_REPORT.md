# Permanent deletion, random Account IDs and Arabic subjects — report

This release does three things:

1. **Admin "Delete account" is now a real database deletion.**
2. **Account IDs are random:** a role prefix plus exactly six digits.
3. **Course subjects are shown in the selected language everywhere.**

The database is never reset. Migrations run automatically at start-up, inside transactions.

## 1. Files changed

**New**

| File | Purpose |
|---|---|
| `migrations/013_permanent_delete_random_ids_subjects.sql` | ID registry and triggers, old→new mapping table, nullable links for kept records, `subjects.nameAr`, `courses.subjectId` |
| `app/lib/server/data-migrations.ts` | Code migrations `014_random_account_ids.code` and `015_course_subject_ids.code` (steps SQL cannot do) |
| `app/lib/server/account-deletion.ts` | The permanent-deletion policy and its transaction |
| `app/lib/server/account-id-allocator.ts` | Random ID generation (CSPRNG), reservation, collision retry |
| `app/lib/subjects.ts` | Subject catalogue: stable id, English and Arabic labels, aliases, bilingual search and duplicate detection |
| `tests/permanent-delete.test.ts`, `tests/random-account-ids.test.ts`, `tests/account-id-migration.test.ts`, `tests/subjects.test.ts` | New tests |
| `DELETION_IDS_SUBJECTS_REPORT.md` | This report |

**Changed**

- **Server**
  - `app/lib/server/db.ts`: the runner also runs code migrations.
  - `app/lib/server/account-ids.ts`
  - `app/lib/server/accounts.ts`
  - `app/lib/server/account-status.ts` (comment only)
  - `app/lib/server/service.ts`
  - `app/lib/server/reports.ts`
  - `app/api/[...path]/route.ts`
- **Shared and i18n**
  - `app/lib/account-ids.ts`
  - `app/lib/i18n.tsx`
  - `app/lib/i18n-messages.ts`
  - `app/lib/i18n-ui-ar.ts`
- **UI**
  - `app/components/AccountManagement.tsx`
  - `app/components/AdminWorkspace.tsx`
  - `app/components/CourseDiscovery.tsx`
  - `app/components/LiveWorkspace.tsx`
  - `app/components/LandingPage.tsx`
  - `app/globals.css`
- **Tests**
  - `scripts/run-tests.mjs`
  - `tests/account-ids.test.ts`
  - `tests/account-management.test.ts`
  - `tests/account-http.test.ts`
  - `tests/phone-and-reset.test.ts`
- **Docs**
  - `README.md`
  - `ACCOUNT_MANAGEMENT_REPORT.md` and `LANGUAGE_AND_ACCOUNT_IDS_REPORT.md` (marked as superseded in part)

## 2. Database migrations

They run in name order and each runs once (recorded in `migrations`).

**`013_permanent_delete_random_ids_subjects.sql`**

Deletes no data.

- **`issuedAccountIds(accountId PK, origin, assigned)`**
  - The never-reuse registry. It holds no personal data and no link to `users`.
  - Every existing ID is reserved as `legacy`.
  - Triggers refuse deleting a row or re-opening an assigned ID.
- **`accountIdMigrations(oldAccountId, newAccountId, role, migratedAt)`**
  - The old→new mapping.
- **Triggers on `users` INSERT**
  - The ID must be the role prefix plus exactly six digits (`S`/`T`/`A` + 6, or `AD` + 6).
  - It must be a freshly reserved, never-assigned registry entry.
  - It is then marked as assigned.
  - The existing permanence trigger from 012 still blocks any later change.
- **Three tables rebuilt** so kept records can lose their link to a deleted account. Every row is copied unchanged.
  - `payments`: `studentId`, `teacherId` and `courseId` become nullable, plus `courseTitleSnapshot` and `deidentifiedAt`.
  - `teacherSubscriptions`: `teacherId` becomes nullable, plus `deidentifiedAt`.
  - `attendance`: `recordedBy` becomes nullable.
  - A `CHECK` keeps every non-de-identified row exactly as strict as before.
- **Subjects**
  - `subjects.nameAr`, filled for all 18 predefined subjects.
  - `courses.subjectId` → `subjects.id`, backfilled by name.
- Indexes used by deletion.

**`014_random_account_ids.code`**

Gives every existing account a new random ID. See section 10.

**`015_course_subject_ids.code`**

- Gives every course a `subjectId`.
- A custom subject that is only another spelling of a predefined one is folded into it. For example, a custom subject typed as `الأحياء` becomes Biology. Real custom subjects such as "Robotics" stay exactly as typed.

## 3. How permanent deletion works

1. **Admin → All Users → ⋯ → Delete account** opens a dialog showing:
   - name, role and Account ID;
   - a warning that the deletion is permanent and cannot normally be undone;
   - a list, grouped by outcome, of what happens to each kind of related record;
   - for teachers, the course policy.

   The button stays disabled until the admin types `DELETE`, and for a teacher with students also until a course policy is chosen.
2. **`POST /api/admin-delete-user`**
   - The server checks `requireAdmin` and the confirmation word.
   - It only allows Student, Teacher or Assistant accounts. Admins are never deletable here, and neither is the acting admin.
3. **`permanentlyDeleteUser()`** runs everything in **one `BEGIN IMMEDIATE` transaction**. The policy is in section 4.
4. Before the final step, a reference scan reads every foreign key to `users(id)` from the live schema.
   - If any row still points at the account, the deletion fails with `DELETE_BLOCKED` and everything is rolled back.
   - Then `DELETE FROM users WHERE id=?` runs, with SQLite foreign keys ON.
5. Any error rolls back the whole transaction. Uploaded files are removed from disk **only after the commit**.
6. The response returns, and only then does the dialog close and the All Users table reload from the server.

Accounts left soft-deleted by the previous release appear under **Deactivated (legacy)** and can now be permanently deleted the same way.

## 4. Records deleted

- **Every role**
  - the `users` row;
  - all `sessions`;
  - `passwordResets`;
  - rate-limit entries keyed by its email, phone or id;
  - `phoneConflicts` rows;
  - its row in the old→new ID mapping.
- **Student**
  - enrollments;
  - assignment submissions and their PDF files;
  - quiz attempts;
  - attendance records;
  - to-do tasks;
  - uploaded files (receipts, assignments), from the database and from disk.
- **Teacher**
  - payment settings and their QR image;
  - avatar, CV and other personal uploads.
  - **When policy is "remove"** (or the teacher has no students and no course payments), also:
    - the courses, with their content and quiz questions;
    - enrollments;
    - students' submissions and files in those courses;
    - quiz attempts;
    - attendance sessions and records.
- **Assistant**
  - the teacher link and permissions (stored on the account row);
  - uploads not used by any course.

## 5. Records kept, and why

| Kept | What stays / what is removed | Why |
|---|---|---|
| Course payments of a deleted **student** | Amount, method, status, dates and course stay. Student link and receipt image removed. Marked `deidentifiedAt`. | The teacher's financial records must stay complete. |
| Course payments of a **teacher** whose courses were removed | Student, amount, status and dates stay, plus the course title as text. Teacher and course link removed. | The student's payment history. |
| Platform subscription payments of a deleted **teacher** | Plan, amount, **transaction reference**, status and dates stay. Teacher link and receipt image removed. | Platform accounting. The transaction reference can still identify the payer *through the payment provider*. |
| Attendance recorded, work graded and payments reviewed by a deleted **assistant** or teacher | The record stays. "recorded / graded / reviewed by" is cleared. | These are the students' records. |
| Course files uploaded by an assistant (videos, materials, quiz images) | Re-owned by the course's teacher. | They belong to the course. |
| Admin audit entries about the account | Link to the account removed. Free-text reason and note **erased**. Action, date and reason category stay. A new `user_deleted_permanently` entry keeps **role + former Account ID only** (no name, email or phone). | Administrator accountability. |
| The Account ID | Stays in `issuedAccountIds` (ID, origin, assigned flag only). | So it is never given to anyone else. |
| A deleted teacher's assistants | Accounts kept but **unlinked**: no teacher, no permissions. | They are other people's accounts. The admin can delete them separately. |

**Not every trace of the person is gone.** The former Account ID stays in the audit log and the registry. Subscription transaction references can identify the payer through the provider. Anything exported earlier (PDFs, CSVs) is outside the database.

**Teacher with enrolled students or course payments.** Deletion is refused (`TEACHER_POLICY_REQUIRED`) until the admin explicitly chooses one of:

- **Transfer to another active teacher.** Courses, content, enrollments, attendance, submissions, quiz attempts and course payments move with them. Course files are re-owned. Students lose nothing.
- **Close and remove.** The dialog shows how many students are affected.

**Messages:** the app has no direct-messaging table, so there is nothing to delete there.

## 6. How sessions are invalidated

- All of the account's `sessions` rows are deleted inside the transaction.
- Every authenticated request already reloads the account by joining `sessions` to `users` (`accessForToken`). With the row gone, an old cookie resolves to nothing:
  - the API returns **401**;
  - pages redirect to `/login`.
- Login looks the email up in `users`, finds nothing and returns **401**.

This was verified in unit tests and over HTTP against the real route handler (`tests/account-http.test.ts`).

## 7. How random IDs are generated

- `app/lib/server/account-id-allocator.ts` uses `randomInt(1, 1_000_000)` from **`node:crypto`** (a CSPRNG), never `Math.random`.
- The range is 000001–999999. `000000` is reserved.
- The number is zero-padded to exactly six digits (529 → `S000529`) and prefixed by role: `S`, `T`, `A` or `AD`.
- Generation happens only on the server, inside `register()`. Any client-sent `accountId` is ignored.

## 8. How uniqueness is guaranteed

Three layers, all enforced by the database:

1. **Registry primary key.** `INSERT OR IGNORE INTO issuedAccountIds` reserves a candidate atomically. An ID that was ever issued (current, deleted or legacy) cannot be inserted again.
2. **`UNIQUE` index** on `users.accountId`.
3. **Insert trigger.** A user row is only accepted with a freshly reserved, never-assigned ID in the right role format.

**Concurrency:** reservation and the user insert run in the same `BEGIN IMMEDIATE` transaction, so SQLite's write lock serialises registrations, even across separate server processes. A rolled-back registration also rolls back its reservation. The tests run 6 processes × 15 simultaneous registrations on one database: 90 unique IDs.

## 9. How collisions are handled

- If the reservation inserts nothing, the candidate was taken. A new number is drawn, up to 64 times.
- If every draw fails, `allocateAccountId` returns a controlled **503** `ACCOUNT_ID_UNAVAILABLE` ("We couldn't create an Account ID right now. Please try again.", also in Arabic), and nothing is written.
- Another account's ID is never overwritten. The permanence trigger also blocks any `UPDATE`.

## 10. How existing sequential IDs are migrated

Code migration `014_random_account_ids.code` runs once, inside a transaction. It selects accounts whose current ID is a **legacy** registry entry, or that have none. For each one it:

1. keeps the old ID reserved in the registry;
2. draws a new random ID and assigns it, with the permanence trigger lifted inside the transaction and restored right after;
3. writes old → new to `accountIdMigrations`.

It is **idempotent**:

- It is recorded in `migrations`, so it never runs again.
- Run by hand, it changes nothing, because random IDs are never selected.
- IDs do not change on restart or when a profile is opened (tested by re-opening the database in a fresh process).

Admins can review and download the mapping (role, old ID, new ID, date; no personal data) under **Admin → Settings → Account ID migration** (`/api/admin-account-id-migration` and `.csv`).

**Dependent integrations**

- Assistant registration still accepts a teacher's **old** ID (`T000001`), resolved through the mapping.
- Admin search also finds an account by its old ID.
- Reports, PDFs and lists read the current ID live from `users`, so they show the new ID.

The previous release's `accountIdCounters` table is now unused and left in place (non-destructive).

## 11. Deleted IDs are never reused

- The registry row outlives the account and cannot be deleted or re-opened (triggers).
- The allocator skips it.
- A direct SQL `INSERT` with that ID is refused by the insert trigger.

All three are tested.

## 12. Internal UUID relationships

- `users.id` (UUID) is still the primary key, and **every** foreign key still uses it.
- Only the display ID changes.
- Tests confirm that enrollments, payments, attendance (including QR attendance), assistant↔teacher links, submissions and quiz attempts are unchanged after migration.

## 13. Account IDs in every role

- **Profile pages** (Student, Teacher, Assistant, Admin) show the friendly ID.
  - The old fallback to the UUID was removed. A missing ID shows "—".
  - An assistant also sees the teacher's Account ID.
  - A student sees it next to the attendance QR.
- **Elsewhere:** All Users (column and search), the View and Delete dialogs, teacher payment and student lists, reports and the audit log.
- IDs are always Latin letters and ASCII digits inside `<bdi dir="ltr">`, also in Arabic.
- An Account ID is a public identifier, never a password or authentication secret.

## 14. How Admin search works

`accountIdMatchesQuery()` in `app/lib/account-ids.ts`:

- case-insensitive;
- accepts Arabic-Indic digits;
- matches partial IDs;
- also matches the account's pre-migration ID.

Name, email and phone search work as before.

## 15. How subject translations are stored

- `app/lib/subjects.ts` is the single source.
  - Each subject has a stable `id` (`biology`), the canonical English `name` (`Biology`, stored in `courses.category` as before) and its Arabic label.
  - Aliases are used for search and duplicate detection only.
- The database holds the same labels in `subjects.nameAr` (a test checks they are identical).
- Each course carries `courses.subjectId`.
- Translated labels are **never stored as identifiers**.
- The app-wide dictionary takes subject names from the catalogue, so composed titles such as "Biology – 3rd Secondary" are also shown in Arabic.

## 16. All translated subjects

| id | English | العربية |
|---|---|---|
| arabic | Arabic | اللغة العربية |
| biology | Biology | الأحياء |
| chemistry | Chemistry | الكيمياء |
| computer-science | Computer Science | علوم الحاسب |
| english | English | اللغة الإنجليزية |
| french | French | اللغة الفرنسية |
| geography | Geography | الجغرافيا |
| german | German | اللغة الألمانية |
| history | History | التاريخ |
| italian | Italian | اللغة الإيطالية |
| mathematics | Mathematics | الرياضيات |
| philosophy-logic | Philosophy and Logic | الفلسفة والمنطق |
| physics | Physics | الفيزياء |
| psychology-sociology | Psychology and Sociology | علم النفس والاجتماع |
| religious-education | Religious Education | التربية الدينية |
| science | Science | العلوم |
| social-studies | Social Studies | الدراسات الاجتماعية |
| spanish | Spanish | اللغة الإسبانية |
| (UI entry) | Other | أخرى |

## 17. Arabic and English subject search

- `subjectMatches()` searches the English name, the Arabic label and the aliases **in any interface language**.
- Matching ignores:
  - case;
  - Arabic diacritics and tatweel;
  - hamza and alef forms (أ/إ/آ → ا), ى/ي and ة/ه;
  - the definite article "ال";
  - punctuation.
- So `كيم` finds الكيمياء, `احياء` finds الأحياء, and `bio` finds Biology even in Arabic mode.
- Options are sorted by the label shown.
- The dropdown's value is the stored subject, so switching language keeps the selection.

**Places that use it**

- Teacher Create/Edit Course (searchable dropdown)
- Teacher and Assistant course lists, course detail
- Student Add Courses (Browse by Subject), Discover Teachers, teacher profile, course cards
- Admin Courses, Course Categories, enrollments and monitoring tables
- Workspace search
- Report preview and PDF
- Landing page

**Other**

- "Other" is shown as أخرى.
- A custom subject that already exists in **either language** (or under a known alias such as "Math") is rejected, both in the form and on the server.
- Genuinely different subjects ("Marine Biology", "Robotics") are accepted and shown exactly as typed.

## 18. Existing course data compatibility

- `courses.category` keeps its English canonical value, so existing reports, filters, PDFs and duplicate checks work unchanged.
- Migration 015 adds `subjectId` to every course.
- The server accepts the subject as id, stored name, or (defensively) its Arabic label. It always stores the id plus the canonical name. No duplicate subject rows are created.

## 19. How RTL was verified (sandbox browser run, see section 22)

Checked in headless Chromium with the real components and the real API route:

- **Language state:** `<html lang dir>` is `ar/rtl` on load from the cookie. The language button switches to `en/ltr` and back. A refresh keeps Arabic.
- **Subject dropdown in RTL:**
  - aligned to the trigger's right edge;
  - at 390 px width it stays inside the viewport with no horizontal page overflow;
  - also checked in dark mode;
  - the delete dialog has `direction: rtl` in Arabic.
- **Result: 49 of 49 UI checks passed**, including all of Part 1's dialog flows and all profile pages.

## 20. TypeScript check

`npm run check` (`tsc --noEmit`) **could not be run** here: the npm registry is unreachable from this workspace, so React, Next.js and lucide-react type packages could not be installed.

Instead, TypeScript was run with real Node types and loose stand-ins for those packages, on the original project and on this one:

- **Server code** type-checks clean.
- **UI code** has 134 errors versus 133 in the original. All of them are caused by the stand-in types; the one extra is the same pattern (`onChange={e => …}` on a `<select>`).

## 21. Test results (`npm test`, real runner, Node's built-in SQLite)

**76 tests: 74 passed, 0 failed, 2 skipped.** The two live-server HTTP suites are skipped unless `LMS_TEST_URL` is set.

- **`tests/account-http.test.ts`** was also run against the **real API route handler** (`app/api/[...path]/route.ts`), served by a small sandbox stand-in for Next: **passed**.
- **`tests/http.test.ts`** could not run here. It needs the real Next server (page routes), plus the `qrcode` and `jsqr` packages, none of which could be installed.

New suites:

- **permanent-delete (9 tests):**
  - Student, Teacher (transfer / remove / no students) and Assistant;
  - non-admins refused;
  - admins protected;
  - the row is gone;
  - login fails;
  - old sessions get 401;
  - not in admin search;
  - related records follow the policy;
  - other users intact;
  - no foreign-key violations;
  - an injected database failure and an unexpected reference both roll back completely, with files untouched.
- **random-account-ids (8 tests):**
  - formats for all 4 roles;
  - CSPRNG, not sequential;
  - collision retry and the 503 error;
  - database-enforced uniqueness;
  - multi-process concurrency;
  - permanence;
  - admin search;
  - QR attendance.
- **account-id-migration (5 tests):** a database built by migrations 001–012 is migrated with:
  - no account lost;
  - UUIDs and relationships intact;
  - the mapping recorded;
  - idempotency and stability across restarts;
  - old teacher IDs still working;
  - subject ids assigned.
- **subjects (6 tests):**
  - every subject translated, and the catalogue equals the migration labels;
  - Arabic and English labels;
  - search in both languages;
  - no duplicates;
  - server course creation;
  - all four roles' data compatible.

## 22. Production build, and what you should run

**`npm run build` was NOT run.** Next.js cannot be installed in this environment, so **the production build is not verified.** Every UI check above used the real components with stand-ins for `next/link`, `next/navigation` and the icon library. That is strong evidence, but it is **not** a verified Next.js build.

Please run on your machine:

```sh
npm ci
npm run check
npm test
npm run build
npm start
```

Then, with the server running, in a second terminal:

```sh
LMS_TEST_URL=http://localhost:3000 npm test     # live HTTP suites, same LMS_DATA_DIR as the server
```

## 23. Unresolved / limitations

- Not verified here:
  - `npm run check`, against the real React and Next types;
  - `npm run build`;
  - the live `tests/http.test.ts`.
- Changing visible IDs is a one-time event. External copies (printed lists, earlier PDF/CSV exports, messages sent to parents) still show old IDs. Use the mapping CSV to reconcile; assistant linking and admin search still accept old IDs.
- Teacher-entered custom subject names have no automatic translation. They are shown as typed, in both languages.
- The free-text "subjects" field in teacher and assistant registration profiles is not part of the subject catalogue and is shown as entered.
- If removing a file from disk fails after the commit, the database is still consistent: the file has no record and can't be downloaded. The failure is logged and counted in the response (`fileRemovalFailures`).
- Each role has 999,999 possible numbers. Allocation stays fast until the space is close to full, then returns the controlled 503.
