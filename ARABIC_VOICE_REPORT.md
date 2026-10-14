# Arabic brand voice: formal Arabic → Egyptian Arabic

## What changed

Only Arabic **values** changed. No keys, English text, components, CSS, server logic or i18n architecture were touched.

| File | What changed |
| --- | --- |
| `app/lib/i18n-ui-ar.ts` | 1,265 of 2,075 Arabic values rewritten (the rest were already neutral: subject names, grade levels, months, column headers). Header comment updated to describe the new voice. |
| `app/lib/i18n-messages.ts` | 120 of 227 values in the `ar` table only (lines inside `const ar = {…}`). `en`, `translate()`, patterns, cookie and locale code are byte-for-byte unchanged. |
| `tests/i18n.test.ts` | One expected string updated to the new wording (`"اتسجل حضور Mona Ali ✅"`). No test was removed or weakened. |

No other file differs from the delivered project.

## Voice rules applied

- **Simple Egyptian (most of the UI):** اختار، اكتب، مفيش، لسه، جرّب تاني، اتحفظ، عشان، دلوقتي.
- **Friendly:** أهلًا بيك تاني 👋، عندك حساب؟، إحنا موجودين عشانك.
- **Moments (31 strings, about 1.5%), student empty, success and loading states only:**
  - ثواني.. بنجهزلك كل حاجة 👀
  - خلّصت كل اللي عليك.. خد نفسك شوية 😌
  - خلصت الاختبار! 🎉
  - جاوب على كل الأسئلة وسلّم.. ورّينا شطارتك 👀
  - خلص الوقت 👀 والتسليم اتقفل. المرة الجاية متستناش آخر دقيقة
  - مهمة وخلصت! 👏
  - مفيش كورسات هنا لسه.. نبدأ؟
- **Serious areas stay plain, with no emoji and no jokes:** passwords and reset, account suspension and deletion, payments and rejections, permissions, security, privacy, validation, legal and the PDF report.
- **Terminology:**
  - كلمة السر (was كلمة المرور)
  - الإيميل (was البريد الإلكتروني)
  - المدرس، الطالب، المساعد، المسؤول، الكورس، الواجب، الاختبار، الامتحان، الدرجة، الحضور، الاشتراك، الباقة، التقرير، الملف الشخصي
- Nothing asks users to share or screenshot. Nothing mocks students or teachers.

## Safety checks (all automated)

- **Keys:** the key sets and their order are identical (2,075 UI + 227 semantic).
- **English:** the `en` dictionary is unchanged.
- **Placeholders:** every `{placeholder}` multiset is identical to the previous Arabic value for every entry.
- **Line breaks:** the newline count is identical.
- **Reverse lookup** (`englishFor` / `sourceOf`, which drive StatusBadge colours and switching an on-screen message back to English): every new Arabic value maps back to the same English source as before, or to its own key. No new collisions.
- **Semantic and UI tables:** every `ar` semantic value that previously matched its `uiAr` twin still matches, so server error codes and English-text errors show the same Arabic.
- **Round trip:** the dictionaries were re-imported from the edited `.ts` files and compared with the intended values.
- **Tests:** `npm test` gives 45 passed, 0 failed, 2 skipped. These are the same results as the original project in the same environment. The 2 skipped are the live-server suites.

  The sandbox could not reach the npm registry. The suite was therefore run with the globally installed `typescript`, `pdf-lib` and `sharp`, plus two test-only stubs (`next/headers`, `jsqr`) kept outside the project. The original project was run the same way for comparison.

## Unchanged by construction

- `app/layout.tsx`
- `app/lib/i18n.tsx` (single `I18nProvider`)
- `app/lib/server/locale.ts` (server reads the `elta3lem-locale` cookie before render, so the first render is already Arabic + `<html lang="ar" dir="rtl">`, with no flash)
- `app/globals.css` (all RTL overrides)
- the API, services, migrations, middleware and routing

## Please verify on your machine

```powershell
npm ci
npm run check
npm test
npm run build
npm start
npm run verify:locale
```

Then open the student dashboard in Arabic at phone width (390 px). The longest new empty-state lines are «خلّصت كل اللي عليك.. خد نفسك شوية 😌» and «مفيش مواعيد جاية.. استمتع بالهدوء 😌». They are titles and descriptions inside `EmptyState`, which wraps text.

## Known, pre-existing (not changed)

- `LiveWorkspace.tsx` (around lines 921 and 3635) still concatenates the raw English words `Assignment`, `Exam`, `Quiz`, `No deadline`, `exam` and `quiz` without `tr()`. In Arabic these words appear in English inside two small status lines.

  The fix is to wrap them in `tr()`. That is a component edit, so it was left for your approval.
- No score-based messages exist (the quiz result screen shows the same title for every score). A "high score" line would need new keys and component logic, so none was added.
