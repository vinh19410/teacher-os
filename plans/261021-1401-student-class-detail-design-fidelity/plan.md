---
title: "Student: kéo trang chi tiết lớp (/classes/$classId) về đúng design v2"
description: "Trang chi tiết lớp của học viên còn lệch design v2 ở header, thẻ thông tin lớp, banner bài tập, ring, tabs, timeline buổi học, bảng bài tập, giáo trình và avatar bạn cùng lớp; phần lớn là sót lại token/class của design v1 sau #378. Plan này liệt kê từng điểm lệch và sửa theo dữ liệu thật đang có, không bịa dữ liệu."
status: completed
priority: P2
effort: "7h"
issue: 389
branch: ai-handle-issue-389
tags: [frontend, student, design-v2, fidelity]
blockedBy: []
blocks: []
created: 2026-10-21
---

# Trang chi tiết lớp (student) lệch design v2

Nguồn design: `vinh19410/teacheros-design-v2@7a53fc0`, file `src/pages/StudentClass.tsx` (đã có bản
checkout ở `/tmp/teacheros-design-v2`; harness `scripts/design-compare/fetch-design.sh` tự clone đúng SHA).
Ảnh đối chiếu hiện tại: `plans/261020-1446-378-redesign-design-v2/screenshots/s-class-detail/desktop-light.png`.

> **Handover-Ready (`--advice`):** Kế hoạch này tuân thủ hợp đồng bàn giao `--advice` (`advice-handover-plan.md`). Mỗi phase được tách thành các task độc lập có `Goal`, `Target files and symbols`, `Steps`, `Success criteria`, `Verify` cơ học và khối `## Failure Protocol` bắt buộc dừng để hỏi `kongming` khi kiểm chứng thất bại.

## Outcome / Non-goals / Acceptance

- **Outcome:** màn `s-class-detail` khớp cấu trúc + token design v2 ở 3 viewport × 2 theme.
- **Non-goals:** không đổi API/contract/DB; không thêm dữ liệu design có mà server chưa trả; không đụng
  danh sách lớp (`/classes`) ngoài việc không làm vỡ `ClassBadges`/`ClassProgress` đang dùng chung.
- **Acceptance:** (1) Xoá ảnh cũ của `s-class-detail` trong `.state/raw/new/s-class-detail/` và `plans/261020-1446-378-redesign-design-v2/screenshots/s-class-detail/`, chạy `pnpm design:compare --screens s-class-detail --side both --label new` PASS ở 1440/768/375,
  light + dark; (2) `pnpm check`, `pnpm check-types`, `pnpm --filter student test` xanh;
  (3) `student-class-detail.spec.ts`, `student-classmates.spec.ts`, `student-practice.spec.ts` và full Playwright suite xanh; (4) không còn class dead/xung đột trong các file đụng tới (`class-detail-view.tsx`, `ring-stat.tsx`, `class-lesson-list.tsx`, `classmates-tab.tsx`, `teacher-avatar.tsx`).

## Bảng điểm lệch (design v2 vs app hiện tại)

| # | Khối | Design v2 | App hiện tại | Dữ liệu |
|---|---|---|---|---|
| 1 | Banner việc cần làm | Thanh `bg-primary` "Bạn còn N bài chưa làm trong {lớp}" + nút **Làm ngay** | Không có | Có: `assignments` (`source === "class_assignment"`) chưa nộp |
| 2 | Header | `h1` `text-2xl md:text-3xl font-semibold`, badge trạng thái "Đang học" (chấm `bg-success`), nút hành động bên phải | Eyebrow mono "LỚP HỌC", `h1` `extrabold` clamp 32–56px (kiểu v1), tag mono uppercase, thanh tiến độ riêng | Có `cls.status`, `cls.teacher` |
| 3 | Back link | Nút ghost `← Trang chủ` (giữ đích `/` và accessible name `"Trang chủ"`) | Link chữ nhỏ `← Trang chủ` | — |
| 4 | Thẻ thông tin lớp | Card `dl` 4 cột: Khoá, Lịch, Hình thức, Giáo viên, Số buổi đã học (`stats.held/stats.totalSessions`), Ngày khai giảng; footer: số tháng, giờ, "Buổi tới: …" | Không có; giáo viên là một card riêng nằm ngang | Có một phần (xem "Không có dữ liệu") |
| 5 | Ring | Track `stroke-muted`, cung `stroke-primary`, icon chuyên cần `CircleCheck` | `stroke-surface` / `stroke-hot` — **token không tồn tại** trong `globals.css` (grep rỗng), `rounded-lg rounded-xl` xung đột | Đủ (riêng Ring 4 `averageBand` hiện `"—"` trên runtime vì endpoint lớp trả `scores: null`) |
| 6 | Tabs | Segmented `h-9 rounded-lg bg-muted p-[3px]`, tab chọn `bg-background shadow-sm` | Tự viết: `rounded-lg rounded-md`, tab chọn chữ cam viền `border-input` | — |
| 7 | Hành trình học | Timeline: chấm tròn 32px (Check/X/CircleDashed) + đường dọc, buổi tới là card `bg-muted/40` + badge "Buổi tới", buổi tương lai `opacity-60`, "Buổi N · Thứ Ngày · Giờ · Phút" | Danh sách hàng `border-t` phẳng, badge mono uppercase | Có (trừ bài về nhà) |
| 8 | Bài tập | `Table` (Bài tập, Hạn, Trạng thái, hành động Làm ngay/Xem lại/Nhận xét) | `AssignmentList` kiểu card/danh sách | Có (trừ cột Skill và điểm chấm trên nguồn `class_assignment`) |
| 9 | Giáo trình | Card, hàng có `Check` tròn / `CircleDashed` | Số thứ tự trong ô vuông; một card duy nhất theo chủ đề | Có (không có module/kiểm tra) |
| 10 | Bạn cùng lớp | Avatar tròn `bg-muted size-8` + tên (+ "(bạn)") | Ô vuông viền `size-11` | Có (chỉ tên) |

### Không có dữ liệu → bỏ khối, KHÔNG bịa (ghi vào `DESIGN.md` mục lệch có chủ đích)

Bài về nhà theo buổi, Địa điểm/phòng, Học phí của lớp, "Tham gia từ buổi", cột Skill của bài tập, nhóm module
và nhãn Mid/Final test trong giáo trình, "Target band" của bạn cùng lớp (cố tình không trả — quyền riêng #378),
nút "Join online class" (chưa có link lớp online), điểm chấm `scores` trên `class_assignment` ở endpoint `/api/student/classes/:classId` (Ring "Band trung bình" hiện `"—"` khi server trả `scores: null`).

## Phases

| # | Phase | Status | Effort | Phụ thuộc |
|---|---|---|---|---|
| 1 | [Primitive Tabs/Badge/Avatar cho student + sửa Ring](./phase-01-primitives-and-ring.md) | Done | 1.5h | — |
| 2 | [Header, banner, thẻ thông tin lớp](./phase-02-header-banner-info.md) | Done | 2.5h | 1 |
| 3 | [Timeline, bảng bài tập, giáo trình, bạn cùng lớp](./phase-03-journey-assignments-syllabus-classmates.md) | Done | 2h | 1, 2 |
| 4 | [Test, e2e, so ảnh, DESIGN.md](./phase-04-verify-and-docs.md) | Done | 1h | 2, 3 |

Phase 2 và Phase 3 cùng chỉnh sửa `apps/student/src/components/class/class-detail-view.tsx` và `apps/student/test/class-detail.test.tsx` nên chạy tuần tự (Phase 1 → Phase 2 → Phase 3 → Phase 4).

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| `ClassBadges`/`ClassProgress`/`Tag` dùng chung với `/classes` | Không sửa; trang chi tiết dùng `Badge` mới, chỉ thôi import `ClassBadges`/`ClassProgress` |
| e2e bám `heading "Buổi học"`, `aria-current="true"` trên `li`, link `Trang chủ` (exact), `mailto:` email giáo viên, tab `Bài tập`, link `Làm bài: …` | Giữ nguyên các hook này (liệt kê ở phase 2, 3, 4) |
| `student-practice.spec.ts:170-173` tìm `row = body.getByRole("link", { name: "Làm bài: ..." })` rồi gọi `row.getByText("Chưa nộp")` | Cập nhật `student-practice.spec.ts` tìm hàng `<tr>` qua `body.getByRole("row").filter({ has: page.getByRole("link", { name: ... }) })` rồi assert cả link hành động lẫn `"Chưa nộp"` trong hàng đó |
| Bảng bài tập mất dòng link `Xem lại kết quả` | Hành động cuối hàng giữ `aria-label` cũ (`Làm bài: …` / `Xem lại kết quả: …`) |
| Nút header `"Nhắn giáo viên"` trùng selector `mailto:` với link email giáo viên | Nút header đặt text `"Nhắn giáo viên"` (không chứa địa chỉ email trong accessible name); ô Giáo viên trong `ClassInfoCard` hiển thị link `<a href="mailto:...">email</a>` để `getByRole("link", { name: teacherEmail })` khớp duy nhất 1 phần tử |

## Câu hỏi đã chốt (Validation & Kongming Counsel)

1. **Back link:** Giữ nguyên đích `/` và accessible name `"Trang chủ"` (kèm icon `ArrowLeft` `aria-hidden="true"` kiểu nút ghost v2); ghi nhận vào `DESIGN.md` mục lệch có chủ đích.
2. **Tabs/Badge/AvatarInitials:** Copy sang `apps/student/src/components/ui/` (`tabs.tsx`, `badge.tsx`, `avatar-initials.tsx`) để tránh kéo phạm vi sang `apps/web`.
3. **Nút hành động bên phải header:** Hiển thị `"Nhắn giáo viên"` (`mailto:${teacher.email.trim()}`, ẩn khi không có teacher hoặc email rỗng).

## Validation Log

### Session 1 — 2026-10-21
**Mode:** `--advice` (Kongming Supervision + Automated Verification Pass)
**Questions resolved:** 3

1. **Back link destination & label:** Confirmed default — keep `to="/"` and accessible name `"Trang chủ"` to preserve E2E contract (`student-class-detail.spec.ts:169`).
2. **UI primitives location:** Confirmed default — create `tabs.tsx`, `badge.tsx`, `avatar-initials.tsx` under `apps/student/src/components/ui/`.
3. **Header action button:** Confirmed default — render `"Nhắn giáo viên"` mailto link styled with `buttonVariants({ variant: "outline" })` when `teacher?.email` exists.

### Verification Results
- Claims checked: 40
- Verified: 37 | Failed: 3 (resolved via Red Team adjustments below) | Unverified: 0
- Tier: Standard (Fact Checker + Contract Verifier)
- Resolved items:
  - `apps/student/src/components/class/class-lesson-list.tsx:9`: `LESSON_STATUS` is an internal constant, not exported; updated Phase 3 to only require `findNextLessonId` and `lessonDayLabel` exports.
  - `scripts/design-compare/capture.mjs:541,547,561`: `--side both --label new` (after removing existing `s-class-detail` output files) is required to re-compose `plans/261020-1446-378-redesign-design-v2/screenshots/s-class-detail/*.png`.
  - `apps/e2e/specs/student-practice.spec.ts:170-178`: updated `row` locator to `body.getByRole("row").filter({ has: page.getByRole("link", ...) })` for HTML table semantics.

### Whole-Plan Consistency Sweep
- Checked `plan.md` and `phase-01`..`phase-04` for stale claims, file ownership conflicts, and verification commands.
- Sequential execution enforced across Phase 2 and Phase 3 (`class-detail-view.tsx`).
- No unresolved contradictions remain.

## Red Team Review

### Session — 2026-10-21
**Findings:** 5 (5 accepted, 0 rejected)
**Severity breakdown:** 2 Critical, 2 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `student-practice.spec.ts:170-173` queries `row.getByText("Chưa nộp")` inside `getByRole("link", { name: "Làm bài: ..." })` | Critical | Accept | Phase 3, Phase 4 |
| 2 | `capture.mjs` requires `--side both --label new` and deleting prior `s-class-detail` screenshots to compose side-by-side output | Critical | Accept | Plan, Phase 4 |
| 3 | `ClassInfoCard` data consistency (`stats.held/totalSessions`, `findNextLessonId` for next session, `YYYY-MM-DD` guard for months, teacher placeholder & mailto link uniqueness) | High | Accept | Phase 2 |
| 4 | Phase 2 & 3 shared file ownership (`class-detail-view.tsx`), `LESSON_STATUS` non-export, dead classes in `ClassNotFound` & `teacher-avatar.tsx`, and unit test assertions in `class-detail.test.tsx` | High | Accept | Plan, Phase 2, Phase 3 |
| 5 | Timeline empty topic fallback, future `opacity-60` guard (`date > todayISO`), status badge visibility, semantic `bg-success` dot, and `ClassAssignmentTable` empty state + `dueText` prefix stripping | Medium | Accept | Phase 2, Phase 3 |

### Whole-Plan Consistency Sweep
- All 5 accepted Red Team findings propagated into `plan.md`, `phase-01-primitives-and-ring.md`, `phase-02-header-banner-info.md`, `phase-03-journey-assignments-syllabus-classmates.md`, and `phase-04-verify-and-docs.md`.
- Every phase file includes task-level `Goal`, `Target files and symbols`, `Steps`, `Success criteria`, mechanical `Verify`, and the literal `## Failure Protocol` section.
