# Arabic/English language switching and Account IDs — report

> **Superseded in part:** Account IDs are now RANDOM (role prefix + exactly six digits, e.g. `S583921`), not sequential. See `DELETION_IDS_SUBJECTS_REPORT.md`.

## 1. Why selecting Arabic did not change the real website

The version you were running (the account-management delivery) had three faults.

1. **Almost nothing was connected to translations (main cause).** Only `AccountManagement.tsx` and the All Users part of `AdminWorkspace.tsx` called the translation hook. Every other screen had its English text typed directly into the code (`LiveWorkspace.tsx` — about 6,400 lines covering most Student/Teacher/Assistant pages — `WorkspaceShell.tsx`, `RoleSidebar.tsx`, `LandingPage.tsx`, `RegistrationFlow.tsx`, `Elta3lemApp.tsx`, `CourseDiscovery.tsx`, `HelpCenter.tsx`, `SiteChrome.tsx`, `CalendarPage.tsx`, `forgot-password/page.tsx`, …). Clicking Arabic flipped `<html dir>`, but there was no Arabic for those components to re-render into, so the page stayed English. In the debugging chain, the break was at steps 6–7 (*components re-render / visible strings become Arabic*).
2. **No shared language state, and the server never knew the language.** The old `app/lib/i18n.tsx` gave every component its own `useState("en")`, synced through `localStorage` and a window event. The server can't read `localStorage`, so `app/layout.tsx` always rendered `<html lang="en">`. Every page load arrived in English and was only flipped by an inline script after the fact.
3. Server messages existed only in English, and the language button was missing from the login, registration and public pages.

## 2. Language architecture now

There is one language state, persisted in one place: the `elta3lem-locale` cookie (`en` | `ar`).

- **Click** — `LanguageToggle` (top bar, public header, auth pages) or **Settings → Language** calls `I18nProvider.setLocale()` in `app/lib/i18n.tsx`. That function:
  1. writes the cookie;
  2. updates the provider's React state, so every component using `useT()`/`useI18n()` re-renders immediately;
  3. sets `<html lang dir>` straight away;
  4. calls `router.refresh()`, so the server components re-render with the new cookie.
- **Page load, refresh and new tabs** — `app/layout.tsx` reads the cookie on the server (`app/lib/server/locale.ts`). It renders `<html lang="ar" dir="rtl">` (or `en`/`ltr`) and the single `<I18nProvider initialLocale=…>`. The first paint and hydration are therefore already in the chosen language: no flash, no mismatch. Page titles are localised too.
- **Navigation** — the provider lives in the root layout, above every route (public, auth and all four role workspaces), so it survives client-side navigation. Full page loads re-read the cookie.
- **No second state**:
  - The old `localStorage` value is adopted once into the cookie, then deleted.
  - Using a translation hook outside the provider throws an error instead of silently creating its own state.
  - Tests check that there is exactly one provider and one context.
- **Dictionaries**:
  - `app/lib/i18n-messages.ts` holds the semantic keys (226) and the `translate()` / `translateText()` logic.
  - `app/lib/i18n-ui-ar.ts` holds Arabic for 2,075 English UI and server texts, plus placeholder patterns, server-formatted dates and composed labels such as "Mathematics – 3rd Secondary · Group".
  - Unknown text — names, emails, phone numbers, Account IDs, user content — is never translated.
- **Messages already on screen follow a switch.**
  - `api()` keeps server text in its language-neutral source form.
  - Components translate at render time, and `translate()` works both ways (Arabic ⇄ English).
- **Server messages** — all 183 server error/success messages have Arabic (enforced by a test). Errors with a stable `code` use the semantic dictionary.
- **PDF reports** — the teacher report PDF is generated in the cookie language: labels, statuses, dates and footer.

## 3. Account IDs (built to the "best design" you chose earlier)

- **Format:** Student `S000001`, Teacher `T000001`, Assistant `A000001`, Admin `AD000001`. Each role has its own counter; after 999999 an ID simply grows to 7 digits.
- **Database** (`migrations/012_account_ids.sql`, non-destructive):
  - adds `users.accountId` with a unique index;
  - adds an `accountIdCounters` table;
  - backfills existing users per role in registration order;
  - adds a trigger that makes IDs permanent (they can't be changed or cleared).
- **Internal UUID:** `users.id` is still the primary key, and every relationship (enrollments, payments, attendance, grades, …) is unchanged.
- **Allocation:** happens inside the same transaction as the account insert, so simultaneous registrations never share a number. Numbers are never reused, even after a soft delete.
- **Where IDs appear:**
  - profiles of all roles;
  - All Users (its own column, and searchable);
  - the View user and delete dialogs;
  - attendance review;
  - reports and PDF;
  - an assistant's view of their teacher.
- **Assistant registration:** assistants sign up with the teacher's Account ID. Input is case-insensitive, Arabic-Indic digits are accepted, and old UUID invitations still work.
- **Arabic pages:** IDs stay Latin letters with ASCII digits, isolated with `<bdi dir="ltr">`. Arabic number formatting uses `ar-EG-u-nu-latn`, so no Arabic-Indic digits appear anywhere.

## 4. Tests (`npm test`) — 41 passed, 0 failed, 2 skipped (the live-server suites)

- **`tests/account-ids.test.ts`**
  - per-role prefix and format;
  - sequences per role;
  - uniqueness;
  - permanence trigger;
  - no reuse after delete;
  - migration backfill with UUID relationships intact;
  - 25 rapid registrations;
  - assistant linking (case and Arabic-Indic digits; wrong or non-teacher IDs rejected);
  - API and admin lists expose the ID;
  - Latin digits in Arabic.
- **`tests/i18n.test.ts`**
  - every literal passed to `tr()`/`t()` has Arabic;
  - every server message has Arabic;
  - two-way translation;
  - patterns and dates;
  - lang/dir mapping;
  - single provider and single cookie (no `localStorage` language copies);
  - placeholders preserved.
- **Existing suites** (account management, reports, courses, phones/reset, service) all still pass.

## 5. What was run here, and how

This cloud workspace cannot download npm packages, so **`next dev`, `next build` and `next start` were NOT run here**. The real components and the real API/SQLite were tested in a local harness (test-only, kept outside the project). It mirrors `app/layout.tsx`: the cookie decides `<html lang dir>`, public pages are server-rendered with React's `renderToString` and then hydrated, and there is one provider. Results:

- **Click → instant change:** starting in English and clicking العربية switched the visible text, `lang="ar"` and `dir="rtl"`. It stayed Arabic after navigating and after refreshing. Clicking English reversed all of that, including after refreshing.
- **Pages covered:** the public pages (home, login, register, forgot password, help) and all four roles — Student, Teacher, Assistant, Admin, including Profile, All Users and account management — at desktop, tablet and 390 px mobile widths, in light and dark mode.
- **Hydration:** server-rendered public pages in both languages hydrated with 0 mismatches.
- **No stale text:** right after a switch, the text matches what a full reload shows (0 differences). An error already on screen changes language along with the page.
- **Leftover-English sweep in Arabic:** 72 pages plus nested pages and interactive states (dialogs, create forms, validation errors, report preview, registration steps). Only technical values remain: the `01XXXXXXXXX` and `https://` placeholders, and a teacher's own biography. English mode shows 0 Arabic leftovers.
- **RTL layout:** 0 horizontal overflow at any tested width. The mobile drawer slides in from the right and works in dark mode.
- **Account management:** the suspend → blocked → reactivate → delete flow and its HTTP test still pass.

**The harness is not proof the real Next.js app works.** Please run this on your PC:

```powershell
npm ci
npm run check
npm test
npm run build
npm start                      # production server on http://localhost:3000
# second terminal, while the server runs:
npm run verify:locale          # checks server-rendered <html lang dir> + language of every public page, EN and AR
# optional, also checks a signed-in workspace:
$env:LMS_VERIFY_EMAIL='you@example.com'; $env:LMS_VERIFY_PASSWORD='…'; npm run verify:locale
```

Repeat with `npm run dev` instead of `npm start`. Then click through in the browser:

1. Open `/login` in English → click **العربية**. The text turns Arabic at once, the page mirrors, and DevTools shows `<html lang="ar" dir="rtl">`.
2. Sign in, open a few pages from the sidebar: they stay Arabic. Press F5: still Arabic.
3. Click **English**: English and `lang="en" dir="ltr"`. Navigate and refresh: still English.
4. Check Profile: معرّف الحساب shows `S000001` (Latin).
5. Repeat on a phone-width window and in dark mode.

## 6. Known limitations

- The older admin **student PDF** (`/api/student-report-pdf`) uses a built-in Latin font and stays English; the teacher report PDF is fully localised.
- PDF tables keep a left-to-right layout; Arabic text inside them is shaped and ordered correctly.
- Values typed by users (course group names, biographies, school names) are shown as entered.
- Grade levels, subjects and plan names that come from the system lists are translated.
- `YYYY-MM-DD` is translated in placeholders; phone and URL format placeholders stay technical.
