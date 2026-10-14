# Update report — uploads list, quiz late policy, reports & PDF

## What changed

1. **Teacher Uploads page (`/teacher/videos`)** — uploaded videos and lecture materials are listed in a compact, sortable table (**Video Title · Course Name · Uploaded · Action**) built with the existing `DataGrid` component, instead of one large embedded player per video. **View** opens the video in an accessible dialog (Esc / close button / backdrop click), **Open** opens a material file, **Edit** loads the item into the existing edit form. On phones the table collapses into stacked cards. Student video pages are unchanged.
2. **Quiz / exam late-submission policy** — the manual quiz builder (also used to review generated drafts and to edit quizzes) has a *Late Submission Policy* fieldset: *Block submissions after deadline* or *Allow late submissions and mark them overdue*. The server stores it in the existing `content.lateSubmissionPolicy` column (previously forced to `block` for quizzes) and enforces it in `submit-quiz-attempt`. Late attempts are saved with `isLate = 1` and status `Late`. Students see "Submissions are closed" or "Attempt Quiz (late)" with an overdue warning; teachers see *Late · Overdue* badges on the Grades page, the course grades tab, and in reports.
3. **Create Quiz button** — moved into the page header action area (same placement and style as **Add Course**), content-width with an icon.
4. **Reports page** — rebuilt as a three-step builder:
   - **Report for:** *Individual student* (optional course filter) or *Group*. A group is a course: every student enrolled in it.
   - **Report period:** *Monthly* (month + year), *Date range* (one From → To control), or *All time*. Only one date control is visible at a time — the old duplicated date filter is gone.
   - **Include in report:** a multi-select checkbox group (Attendance, Quiz / Exam Grades, Assignments, Payments) with Select all / Clear all. At least one is required.
   - **Sort records:** Newest first (default) or Oldest first. This applies to the preview and the PDF, and preview columns can still be sorted by clicking their headers.
   - A live preview shows exactly what the PDF will contain. **Download PDF** shows a loading/disabled state and reports errors.
5. **Professional PDF** — branded header band, an information card (name, ID, course/group, grade, teacher, parent phone, period, generated date), one section per selected category (figures + table), a final summary, a generation note, signature lines, and *Page X of Y* footers. Tables wrap long text, repeat their header row after page breaks ("continued"), and use status colours. Only the selected sections are rendered.
6. **Arabic / Unicode names in PDFs** — text the standard PDF fonts cannot encode (e.g. Arabic names, which registration explicitly allows) is drawn with an embedded DejaVu Sans font, with Arabic letter shaping and right-to-left ordering. Latin-only reports stay small (~10–25 KB) because they use built-in fonts.

## Data used by reports (no sample data)

| Section | Source | Period filter |
|---|---|---|
| Attendance | `attendanceSessions` for the student's/group's courses (sessions on or after enrollment) + `attendance` check-ins → Present/Absent | session date |
| Quiz / Exam grades | `quizAttempts` (score, total, %, late flag) + closed quizzes/exams with no attempt ("Not attempted") | attempt date / deadline |
| Assignments | assignments in the course(s) + `submissions` → Submitted / Late / Overdue / Graded / Not Submitted / Not yet due | deadline (or publish date if none) |
| Payments | `payments` (amount, method, real statuses: Pending Verification, Cash Pending, Approved, Rejected) | submission date |

Everything is limited to the signed-in teacher's workspace (or the assistant's teacher, with content permission). A student report only contains that student. A group report only contains students enrolled in that group/course. Dates use the viewer's time zone.

## Files

Modified: `app/components/LiveWorkspace.tsx`, `app/globals.css`, `app/lib/server/service.ts`, `app/api/[...path]/route.ts`, `scripts/run-tests.mjs`.
Created: `app/lib/server/reports.ts`, `app/lib/server/pdf-report.ts`, `app/lib/server/pdf-text.ts`, `migrations/008_quiz_late_policy.sql`, `assets/fonts/DejaVuSans.ttf` (+ licence/readme), `tests/reports.test.ts`, this report.

## Database

`migrations/008_quiz_late_policy.sql` adds `quizAttempts.isLate INTEGER NOT NULL DEFAULT 0`. It runs automatically on the first server request, like the other migrations. Existing quizzes keep `lateSubmissionPolicy = 'block'`, which matches how they behaved before. Existing attempts are `isLate = 0`.

## API

- `GET /api/teacher-report?target=student|group&studentId|groupId&courseId&period=monthly|range|all&month&year&dateFrom&dateTo&sections=attendance,quizzes,assignments,payments&sort=newest|oldest&tz=<minutes>` — JSON preview.
- `GET /api/teacher-report-pdf?<same parameters>` — PDF download. The previous single-category form (`?type=…`) still works for existing links.
