---
phase: 1
title: "Harness chụp đối chiếu + baseline ảnh cũ"
status: completed
priority: P1
effort: "5h"
dependencies: []
---

# Phase 1: Harness chụp đối chiếu + baseline ảnh "cũ"

## Goal

Có một lệnh chụp cùng một màn ở design v2 và ở app (cũ/mới) theo 3 viewport × 2 theme, ghép
side-by-side, để mọi phase sau dùng làm DoD; chụp baseline "cũ" trước khi đổi bất kỳ UI nào.

## Files to Create / Modify

- Create: `scripts/design-compare/screens.json` — bảng ánh xạ màn (nguồn duy nhất).
- Create: `scripts/design-compare/capture.mjs` — Playwright: chụp design + app, ghép ảnh.
- Create: `scripts/design-compare/fetch-design.sh` — `gh` clone design v2 ở SHA ghim vào
  `.cache/design-v2/`, `pnpm install`, chạy `vite --port 8200`.
- Modify: `.gitignore` — thêm `.cache/design-v2/`.
- Modify: `package.json` (root) — script `design:compare` (`node scripts/design-compare/capture.mjs`).
- Output (commit): `plans/261020-1446-378-redesign-design-v2/screenshots/{screen}/{viewport}-{theme}.png`
  + `screenshots/verdict.md`.

## Bảng ánh xạ màn (khởi tạo `screens.json`)

Design điều hướng bằng hash + state: harness phải bấm "Login" trước; màn học viên cần bấm
`PortalSwitch` → "student" rồi bấm nav (state, không có URL). Ghi bước bấm trong `designSteps`.

| id | Design v2 | App (app URL) | Phase |
|---|---|---|---|
| login-teacher | `Login` (`App.tsx`) | web `/login` | 5 |
| login-reset | `Login` mode reset | web `/forgot-password` | 5 |
| pay | `#/pay/p7Hq2x` | web `/pay/$token` (seed) | 5 |
| t-dashboard | `#/dashboard` | web `/dashboard` | 6 |
| t-classes | `#/classes` | web `/classes` | 6 |
| t-class-detail | `#/classes/c2` (3 tab) | web `/classes/$classId` | 6 |
| t-attendance | `AttendanceDialog` | modal điểm danh trong class detail | 6 |
| t-students | `#/students` | web `/students` | 6 |
| t-student-detail | `#/students/s3` (2 tab) | web `/students/$studentId` | 6 |
| t-schedule | `#/schedule` | web `/schedule` | 6 |
| t-syllabus | `#/syllabus` | web `/syllabus` + `/syllabus/$id` | 6 |
| t-profile | `#/profile` | web `/profile` | 6 |
| t-reports | *(không có — áp khung Dashboard/Stat/Card)* | web `/reports` | 6 |
| t-assignments | `#/assignments` | web `/assignments` | 7 |
| t-test-builder | `#/assignments/tests` | web `/assignments/tests/new`, `/tests/$id` | 7 |
| t-grading | `#/grading/a1` | web `/grading/$attemptId` | 7 |
| t-tuition | `#/tuition` | web `/tuition` | 7 |
| t-invoice | `#/tuition/TOS9B4C7` | web `/tuition/$invoiceId` | 7 |
| t-search | ô Search `⌘K` (header) | palette ⌘K | 8 |
| s-dashboard | Student → Dashboard | student `/` | 9 |
| s-classes | Student → Class | student `/classes` | 9 |
| s-class-detail | `StudentClassDetail` (4 tab) | student `/classes/$classId` | 9 |
| s-quiz-reading / -listening / -writing / -speaking | `ReadingExam`/`ListeningExam`/`WritingExam`/`SpeakingUpload` | student `/learn/quizzes/attempt/$id` (seed theo skill) | 9 |
| s-vocab | `Vocabulary` + `VocabCatalog` | student `/vocab`, `/vocab/courses` | 9 |
| s-practice-{reading,listening,writing,speaking,vocabulary} | Student → Practice → skill | student `/practice/$skill` | 10 |
| s-history | Student → History | student `/history` | 11 |

Màn app không có trong design (onboarding, verify-email, assignments preview, tuition học
viên, assignment detail giáo viên…) ghi `design: null` + `pattern` (màn design gần nhất để
đối chiếu khung) — checklist vẫn áp dụng ở mức khung/primitive.

## Tasks & Steps

1. `fetch-design.sh`: `gh repo clone vinh19410/teacheros-design-v2 .cache/design-v2` →
   `git -C … checkout 7a53fc0fcbf415367d245539cedc3855606266a7`; idempotent; `PORT=8200 pnpm dev`
   chạy nền, ghi PID vào `.cache/design-v2/.pid`, lệnh `stop` dừng đúng PID (không `pkill` rộng).
2. `capture.mjs` (dùng `@playwright/test` của `apps/e2e`):
   - Tham số `--screens id1,id2|all`, `--side design|app|both`, `--label old|new`.
   - App: đăng nhập bằng seed e2e (`apps/e2e` boot, port 8100/8101/8103), set
     `localStorage.theme` trước `goto`; design: set `localStorage.theme` + bấm `designSteps`.
   - Mỗi viewport (1440×900, 768×1024, 375×812) × theme (light, dark): `fullPage` screenshot,
     tắt animation (`reducedMotion: 'reduce'`), chờ `networkidle` + font ready.
   - Ghép `design | app-old | app-new` thành 1 PNG (canvas trong page Playwright, không thêm
     dependency ảnh mới), nhãn cột ở trên.
3. Chạy baseline: `pnpm design:compare --screens all --side both --label old` (design + app cũ)
   trước khi phase 2 sửa gì. Commit ảnh.
4. Tạo `screenshots/verdict.md`: bảng `id | viewport×theme | trạng thái | ghi chú`, mọi dòng
   `TODO`.

## Checklist khớp cấu trúc

Áp cho mỗi ảnh; tất cả ✓ mới PASS:

1. **Shell**: sidebar 16rem (lg) / drawer (mobile), team switcher, nhóm nav có nhãn, user
   footer, content inset `rounded-xl border` trên nền sidebar, header 56px breadcrumb + actions.
2. **Bố cục vùng**: cùng thứ tự khối (page head → stat row → lưới chính/phụ → bảng…), cùng số
   cột ở từng breakpoint.
3. **Component**: cùng loại (Card/Stat/Tabs segmented/Table/Badge/Btn variant/Modal/Field).
4. **Token**: nền/viền/chữ muted/primary đúng theme; radius `rounded-xl` card, `rounded-md`
   control; không còn cam v1, không còn `font-mono uppercase` kicker v1.
5. **Typography**: Geist; tiêu đề trang `text-2xl md:text-3xl font-semibold`; số `tabular-nums`.
6. **Responsive**: 375px không tràn ngang, không chữ cắt, không chồng lớp.
7. **Khác biệt chấp nhận được**: dữ liệu, độ dài copy tiếng Việt, khối chỉ app có (ghi chú).

## Verification

- `bash scripts/design-compare/fetch-design.sh && curl -sf http://localhost:8200 >/dev/null`
- `pnpm design:compare --screens t-dashboard --side both --label old` sinh 6 PNG ghép.
- `ls plans/261020-1446-378-redesign-design-v2/screenshots | wc -l` ≥ số màn trong `screens.json`.
- Dừng server design sau khi chụp (`fetch-design.sh stop`), `lsof -i :8200` trống.
