# Elta3lem frontend redesign — report

The visual identity, navigation and role organization were redesigned on top of the existing Next.js + SQLite project. The architecture, routes, API endpoints, database schema and authentication are unchanged, except for the read-only Admin data and the server-side Admin restriction described below.

## 1. Visual identity and design system (`app/globals.css`, `app/components/WorkspaceComponents.tsx`)

- **Palette:** deep academic navy (`#1d4189` primary, `#0e2547`/`#081833` brand surfaces), medium educational blue (`#2f6fd6`), teal accent (`#0b8f8a`) used sparingly, a cool blue‑gray canvas (`#f3f6fa`), white cards and navy‑charcoal text (`#15233f`).
- **Semantic colors:** success (green), warning (amber), danger (red), info (blue) and neutral (gray). `statusTone()` maps every status label in the app to one tone, so a status always has the same color.
- **Tokens for everything** (surfaces, text, borders, status, shadows, radii). Dark mode redefines the tokens rather than inverting colors: a deep‑navy background, raised navy surfaces, brighter accessible blues and translucent status fills.
- **Role accents:** Student = teal, Teacher = blue, Assistant = indigo, Admin = slate navy. They appear in the sidebar identity card, top‑bar role chip, page‑header icons and eyebrows.
- **Typography:** Inter for body text (14px base, up from 10–11px) and Plus Jakarta Sans for headings.
- **Shared primitives:** `PageHeader` (icon, eyebrow, actions), `StatCard` (optionally linked), `StatusBadge` (semantic tone), `DataGrid` (sortable; turns into stacked cards on phones), `Tabs`, `ProgressBar`, `Deadline` (marks overdue and due within 48h), `MiniBar`, `CopyField`, `EmptyState` (icon + action), `ErrorState`, `ReadOnlyBanner`, `ConfirmDialog` (danger/primary), skeleton loading and date helpers.
- Subtle motion only: a short fade on page entry and toasts. `prefers-reduced-motion` is respected.

## 2. Public website

- `/` — **new public landing page** (`components/LandingPage.tsx`, `components/SiteChrome.tsx`): header (Home, About, How It Works, Features, Help / Support, theme toggle, Get Started, Login), hero ("Learn Smarter. Teach Better."), About (students, teachers, assistants, administration), How It Works (4 steps), Student benefits, Teacher benefits, Platform features, How learning works, Why Elta3lem, FAQ, a support call‑to‑action and a footer. Signed‑in visitors see "My workspace" instead of Login. Every statement describes a feature that exists.
- `/login` — login (moved from `/`); `/register` — registration; `/help` — public Help Center. Signed‑in users opening `/login` or `/register` are sent to their own dashboard.
- Unauthenticated workspace requests now redirect to `/login`; logout returns to `/login`.

## 3. Login, registration, password reset

- Split layout: a navy brand panel and the form. The panel is hidden on tablets and phones.
- All registration steps, fields, role selection, admin invitation, teacher plan/CV, assistant Teacher ID and validation are unchanged. Restyled stepper, role cards, plan cards and agreement checkboxes; errors show with an icon.
- Forgot password shows its step number and links back to `/login`.

## 4. Navigation (`components/RoleSidebar.tsx`, `components/WorkspaceShell.tsx`)

- **Teacher:** same groups and order (Course Management, Class Management, Communication & Planning, Management, Account & Support), plus a Dashboard link at the top. Restyled only.
- **Student:** Learning / Explore / Planning & Communication / Account & Support.
- **Assistant:** Dashboard, Course Support / Student Management / Communication & Planning / Monitoring / Account & Support.
- **Admin:** Overview / User Management / Teacher Management / Platform Monitoring / Academic Monitoring / System.
- Logout is pinned at the bottom of the sidebar for every role. Help Center opens a real page for every role; it no longer redirects to Messages.
- Desktop: collapsible to an icon rail (saved per device). Tablet and phone (≤1024px): an off‑canvas drawer with a backdrop. Escape closes it, and it closes after you navigate.
- Top bar: back button, page search, role chip, theme toggle, notifications and a profile chip with the user's initials and name. Notifications now come from **real data** only; the hard‑coded sample admin notices were removed. Badges show pending teacher verifications (Admin) and payments waiting for review (Teacher).

## 5. Admin — platform supervision (`components/AdminWorkspace.tsx`)

All Admin pages now use real data; the previous mock Admin dashboard, Users, Videos, Assignments, Quizzes and other placeholder pages are gone.

| Page | Purpose |
|---|---|
| Dashboard | Total students, teachers, assistants and courses; pending verifications; active plans; pending course payments; new registrations; action alerts; recent registrations; subscription and content breakdowns; most‑enrolled courses |
| All Users, Students, Teachers, Assistants | Searchable, sortable tables with role, phone, registration date and account status (teacher plan status, assistant access, student enrollments). Passwords and National IDs are never selected |
| Teacher Verification (`/admin/verification`) | Tabs: Pending review / Payment required / Verified / Rejected / All. Shows identity and professional details, plan, amount, method, reference, payment proof and CV. Approve (with confirmation) or Reject (reason required) using the existing endpoints |
| Teacher monitoring (`/admin/teachers/<id>`) | Read‑only teacher profile: courses, students, assistants, content activity, submissions, attendance, subscription and payment status, course‑payment summary |
| Subscriptions & Plans | Plan management (add, edit, hide/show) and a table of teacher, plan, amount, payment status, start and expiry dates, and verification |
| Courses, Enrollments, Course Payments, Categories | Read‑only monitoring with teacher and course filters |
| Videos, Assignments, Quizzes, Grades | **Academic Monitoring, read‑only:** no create, edit or grade controls |
| Reports | Student report list and detail with PDF download (existing endpoint) |
| Notifications, Settings, Profile, Help | Real platform events; appearance and the platform payment details teachers see (existing `platform-payment-settings` action); account details |

Statuses come only from what the backend stores: `pending_payment` → Payment Required, `pending_approval` → Pending, `active` → Active, `rejected` → Rejected, `expired` → Expired. Verification is Pending, Verified or Rejected; teachers created before subscriptions existed show as "Legacy account".

## 6. Backend changes (minimal, all related to the Admin requirements)

- `lib/server/service.ts` `state()` — Admin‑only, read‑only monitoring data: non‑sensitive profile fields on the user lists, plus `adminEnrollments`, `adminContent` (no file IDs), `adminSubmissions` (no file IDs), `adminPayments` (no receipt IDs) and `adminAttendance` (counts).
- `canReadFile` — administrators can open a **teacher's CV** for verification. Payment proofs were already readable by admins.
- `lib/server/auth.ts` `teacherScope()` — explicitly rejects administrator accounts with a clear message. Teacher‑only actions (courses, content, quizzes, grading, attendance) were already limited to teachers and permitted assistants; this makes the Admin rule explicit on the server, not only hidden in the UI. `review-payment`, `payment-methods` and teacher uploads were already teacher‑only.
- `tests/service.test.ts` — new test: Admin data contains no National ID, password hash or QR token; content rows contain no file ID; and Admin calls to `course`, `content`, `grade-submission`, `quiz-questions`, `attendance-session` and `review-payment` are rejected.

## 7. Student, Teacher, Assistant pages

- **Student:** dashboard hero with stats and "Next up"; course cards show teacher, progress, next activity and a clear action; an Attendance QR card on the dashboard; assignment and quiz cards show status badges (Submitted / Overdue / Deadline passed / Graded x/y / Best score) and deadline chips that turn amber within 48 hours and red when overdue; gradebook summary (quiz average, assignment average, awaiting grading) and an assignment‑grades table; a two‑column payment page; a course hero with progress; a real Notifications page. The old mock routes `/student/teacher` and `/student/teacher/<id>` now open Discover Courses.
- **Teacher:** same workflows, restyled. Payment review cards; attendance in two steps with a records table; Students table with a course filter; Assistants page with a copyable Teacher ID and permission toggles; course cards with lesson, assignment and quiz counts.
- **Assistant:** dashboard states the supporting role and shows the assistant's access as badges. Quick actions only offer pages the assistant is permitted to use, and missing permissions show a clear notice. No new privileges.
- **Calendar** (all three roles): month grid and agenda built from real deadlines, quiz opening times, student to‑dos and attendance sessions.
- **Messages:** direct messaging does not exist in the backend, so the page says so plainly and links to the channels that do exist (course announcements, Help Center, WhatsApp support).
- **Profile and Settings:** structured details, copyable IDs, and a light/dark theme picker.

## 8. Help Center (`components/HelpCenter.tsx`)

Search ("How can we help you?"), role‑specific category cards, role‑specific FAQs describing how the platform actually behaves, and Contact Support with **Call** (`tel:+201042848929`) and **WhatsApp** (`https://wa.me/201042848929`) for 01042848929. It makes no 24/7 or response‑time claims.

## 9. Verification performed

The npm registry was not reachable from the build environment, so `npm ci`, `next build` and `tsc` against the real dependencies could not be run there. Instead:

1. TypeScript compiled every file under `app/` with strict mode and type shims for the unavailable packages. No errors in the new code.
2. `npm test` service tests (with the real TypeScript transpiler and Node's built‑in SQLite): all service tests pass, including the new Admin security test.
3. The **real API route** (`app/api/[...path]/route.ts`) and service layer ran against a fresh SQLite database through a small Next.js request adapter. Seeded through the real endpoints: registration for all four roles, teacher payment proof upload, admin approval, payment methods, courses, assignments, quizzes and questions, announcements, student receipt upload, teacher approval, cash request, PDF submission, grading, quiz attempt, to‑dos and QR attendance.
4. A Chromium (Playwright) run of the real React components: logged in through the UI as Student, Teacher, Assistant and Admin; opened every sidebar route plus course, teacher‑monitoring and report detail pages at desktop, tablet (820px) and phone (390px) widths, in light and dark mode. Result: no render crashes, console errors or horizontal page overflow. UI actions checked: admin approval, plan creation, teacher course creation, completing a student to‑do, and Help search with the WhatsApp link.

**Please run on your machine:** `npm ci`, `npm run check`, `npm test`, `npm run build`, then click through once with real devices (especially camera scanning).

## 10. Files

New: `app/components/AdminWorkspace.tsx`, `HelpCenter.tsx`, `CalendarPage.tsx`, `MessagesPage.tsx`, `LandingPage.tsx`, `SiteChrome.tsx`, `app/login/page.tsx`, `app/register/page.tsx`, `app/help/page.tsx`, `REDESIGN_REPORT.md`.

Modified: `app/globals.css` (rewritten), `app/layout.tsx`, `app/page.tsx`, `app/Elta3lemApp.tsx`, `app/RegistrationFlow.tsx`, `app/forgot-password/page.tsx`, `app/[role]/[...slug]/page.tsx`, `app/components/RoleSidebar.tsx`, `WorkspaceShell.tsx`, `WorkspaceComponents.tsx`, `LiveWorkspace.tsx`, `app/lib/server/service.ts`, `app/lib/server/auth.ts`, `tests/service.test.ts`.

`app/lib/mock-data.ts` is no longer imported anywhere and can be deleted.
