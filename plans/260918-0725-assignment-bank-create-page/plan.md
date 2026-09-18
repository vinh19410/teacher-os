---
title: "Trang tạo bài tập — Thêm đề vào ngân hàng (thiết kế mới)"
description: "Dựng trang /assignments/new theo design v3 'Thêm đề vào ngân hàng' (Open Design): composer đề Writing Task 1/2 + ngữ cảnh ngân hàng + xem trước học viên + sticky action bar + success state, persist thật end-to-end qua kernel (bảng assignment_prompt mới, POST /api/assignments/prompts, snapshot, command bus)."
status: pending
priority: P2
effort: 12h
issue: 202
branch: feat/assignment-bank-create-page
tags: [feature, frontend, backend, database, api]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Trang tạo bài tập — Thêm đề vào ngân hàng (thiết kế mới)

## Overview

Hiện tại "tạo bài tập" chỉ là **placeholder modal** (`AddAssignmentModal` — redirect sang Lớp học/Học viên, không có luồng tạo thật); bảng `assignment` là grading-only gắn cứng học viên. Thiết kế mới (Open Design project `f2f4d498-7ea3-403c-89e9-6ac3099ac79b`, bản `assignment-create-3.html` — mới nhất, `primary: true`) định nghĩa trang tạo bài tập theo hướng **bank-first**: soạn đề Writing Task 1/2 (dạng bài, dạng đề, band mục tiêu, nguồn, nội dung, hướng dẫn thêm), lưu vào **ngân hàng đề** với trạng thái Bản nháp/Sẵn sàng giao — việc giao cho lớp là luồng riêng ở trang Lớp học. Plan này dựng trang đó theo đúng thiết kế, có persist thật theo đúng vertical-slice kernel của repo (schema → migration → contract → snapshot → POST route → kernel action → command bus → mapper → UI → tests → E2E). Đây chính là ứng viên feature "tạo assignment" mà `docs/project-roadmap.md` (M5, dòng 100) đã điểm danh.

## Design Source

- Chuẩn: `…/Open Design/namespaces/release-stable/data/projects/f2f4d498-7ea3-403c-89e9-6ac3099ac79b/assignment-create-3.html` — "Thêm đề vào ngân hàng · Teacher OS" (13:59, artifact `primary: true`, `status: complete`).
- Lịch sử iterate trong cùng project: `assignment-create.html` + `assignment-create-2.html` ("Tạo bài tập Writing IELTS" — giao thẳng lớp + chọn học viên + hạn nộp). v3 bỏ phần giao bài, thay bằng trạng thái đề + danh sách "Đề đã có". **Plan theo v3**; các yếu tố v2 (chọn lớp/học viên, hạn nộp) thuộc luồng giao bài — không làm ở đây.

## Key Decisions

1. **Bảng riêng `assignment_prompt`, không FK student/class** — đề trong ngân hàng tồn tại trước khi được giao; giao bài sau này tạo row `assignment` (bảng hiện có) tham chiếu đề, là plan khác.
2. **Đọc qua snapshot, viết qua command bus** — không endpoint list riêng; thêm collection `assignmentPrompts` vào `KernelSnapshot` (ép web glue land cùng phase 1 vì guard compile-time `SNAPSHOT_COLLECTION_KEYS`).
3. **Genre là string bounded, không enum DB** — catalog dạng đề là preset client-side; thêm dạng đề mới không cần migration.
4. **Trung thực dữ liệu** — không hiển thị "Đã dùng N lớp" (chưa có dữ liệu link đề→lớp); "Đề đã có" chỉ hiện trạng thái + nguồn; breadcrumb bỏ nấc "Ngân hàng" vì chưa có trang list ngân hàng riêng.
5. **Xóa `AddAssignmentModal`** — placeholder chết sau khi có trang thật; nút "+ Tạo bài tập" điều hướng `/assignments/new`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Bảng `assignment_prompt` org-scoped + migration D1 + contract zod `.strict()` + `KernelSnapshot.assignmentPrompts` | P1 |
| 2 | `POST /api/assignments/prompts` (201/400/401, org-scoped, kế thừa CSRF guard kernel) | P1 |
| 3 | Trang `/assignments/new` đúng thiết kế v3: composer 2 cột + bank context + student preview + sticky action bar + success state | P1 |
| 4 | Luồng lưu thật 2 trạng thái (Sẵn sàng giao / Bản nháp) với validate client + server; đề mới hiện trong "Đề đã có", sống qua reload | P1 |
| 5 | Điều hướng: CTA list page → trang mới, route title, service-worker matcher; xóa modal placeholder | P2 |
| 6 | Tests đủ ba lớp (server/unit/component) + E2E Playwright persist thật | P1 |

## Non-Goals

- Không giao bài cho lớp/học viên trong trang này (thiết kế v3 tách bạch; luồng giao là plan riêng ở trang Lớp học).
- Không đính kèm ảnh biểu đồ cho Task 1 (chính design ghi "Ảnh biểu đồ chưa đính trong bản này").
- Không đổi topbar/search toàn cục ("Tìm đề trong ngân hàng" là của shell trong mock; global search là issue riêng).
- Không làm trang list ngân hàng riêng, không sửa bảng `assignment` hiện có, không thêm `promptId` vào bảng đó.
- Không lưu nháp form vào localStorage khi rời trang (ngoài scope; mất input khi navigate là hành vi chấp nhận).

## Assumptions

- **v3 là bản thiết kế chuẩn** (mới nhất + `primary: true` + nội bộ nhất quán với roadmap). Nếu ý định là v2 (giao thẳng lớp), plan phải đổi hướng — đã ghi rõ lên GitHub issue để xác nhận.
- Ngữ cảnh sản phẩm là IELTS Writing Academic (thiết kế nêu rõ; danh sách band 6.0–7.5).
- Band lưu dạng chuỗi enum `"6.0"|"6.5"|"7.0"|"7.5"` — không cần toán trên số.
- Giá trị ví dụ trong design ("Cambridge IELTS 10, Test 2") là placeholder, không prefill thật.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Kernel schema, contract & POST route](./phase-01-kernel-schema-and-api.md) | Pending |
| 2 | [Trang /assignments/new + data layer web](./phase-02-web-create-page-and-data-layer.md) | Pending |
| 3 | [Tests, E2E & verification sweep](./phase-03-tests-e2e-and-verification-sweep.md) | Pending |

## Success Criteria

- [ ] `/assignments/new` render đủ cấu trúc design v3 (composer + ngân hàng + preview + sticky bar + success) bên trong app shell hiện có; CTA "+ Tạo bài tập" dẫn đến trang
- [ ] Lưu "Sẵn sàng giao" và "Bản nháp" đều tạo row thật; đề xuất hiện trong "Đề đã có" và còn sau reload; org khác không thấy
- [ ] Validate: thiếu tiêu đề/nội dung đề bị chặn client (field error, không POST) và server (zod 400)
- [ ] `AddAssignmentModal` bị xóa, không còn reference; `routes-matcher` + `routeTitles` cập nhật
- [ ] `pnpm check`, `pnpm check-types`, `pnpm test`, Playwright spec mới — tất cả xanh

## Verification Commands

```bash
pnpm --filter db db:generate
cd apps/server && npx vitest run
cd apps/web && npx vitest run
cd apps/e2e && npx playwright test assignment-prompt-create
pnpm check && pnpm check-types && pnpm test
```

## Dependencies

- Không phụ thuộc plan nào đang mở (checked `plans/` + issues #53/#67-70: không đụng milestone tracker).
- Blocked-by: không. Blocks: luồng giao đề cho lớp (tương lai, chưa có plan).

## Red-Team Record (4 personas, 2026-09-18)

*(Red-team chạy inline bởi orchestrator — hạ tầng spawn subagent lỗi `[reasoning-level-missing]`; mọi claim đều đối chiếu trực tiếp file nguồn, danh sách ở Validation Log.)*

**Assumptions** — Giả định lớn nhất: **v3 là bản thiết kế chuẩn** (mới nhất 13:59, `primary: true`; v2 giao thẳng lớp bị thay bằng bank-first + status). Nếu chủ sản phẩm thật ra muốn v2 thì toàn bộ phase 2 đổi hướng (thêm chọn lớp/học viên, bỏ status) — đã ghi lên GitHub issue để xác nhận trước khi cook. Giả định còn lại (IELTS Academic, band dạng chuỗi, không prefill nguồn) đều đọc trực tiếp từ design. Không blocker.

**Failure** — (F1) Route xung đột `/assignments/new` vs `$assignmentId`: TanStack Router xếp static trên dynamic; thêm exact key vào `routes-matcher` cho service worker — có component test + E2E chốt. (F2) Mở rộng `KernelSnapshot` làm gãy `check-types` web nếu contract land trước web glue: phase 1 đã gộp web glue nên mỗi phase đều green. (F3) Double-submit: command bus serialize sẵn (apps/web/src/lib/repos/kernel.ts:480-537) + `submitBlocked` của `useKernelFormSubmit`. (F4) Người dùng rời trang giữa chừng mất nội dung — đã ghi Non-Goal (không localStorage draft); chấp nhận và ghi rõ. (F5) Preset prompt chứa ký tự đặc biệt: render qua JSX text node, không `innerHTML` như bản design — không XSS surface. Không blocker.

**Scope** — Không lan sang giao bài/lớp học, không đụng bảng `assignment`, không làm trang list ngân hàng; xóa `AddAssignmentModal` là thay thế 1-1 tính năng placeholder chứ không phải scope creep. "Đếm từ" giữ client-side hiển thị, không persist. Không blocker.

**Security** — Endpoint nằm trong kernel router (kế thừa Origin + JSON CSRF guard — docblock routes/assignments/index.ts:13-18); zod `.strict()` chặn field lạ; org-scoped qua `kernelCtx.orgId` + index `assignment_prompt_org_idx`; nội dung đề render dạng text; không log PII. Không blocker.

**Verdict: GO** — 0 blocker; 1 xác nhận sản phẩm (v3 vs v2) đã đẩy lên issue.

## Validation Log

### Verification Results (Fact-check pass, 2026-09-18)

- Claims checked: 18 — bao gồm mọi đường dẫn file, số dòng, hành vi guard, pattern precedent
- Verified: 18 | Failed: 0 | Unverified: 0
- Tier: Standard (3 phases → Fact Checker + Contract Verifier)
- Bằng chứng chọn lọc (đọc trực tiếp trong phiên):
  - `packages/db/src/schema/assignment.ts:19-44` — grading-only, `studentId` notNull → phải bảng mới
  - `apps/web/src/lib/repos/kernel.ts:354-377` — `SNAPSHOT_COLLECTION_KEYS` + guard `MissingSnapshotKey extends never` → web glue cùng phase 1
  - `apps/server/src/routes/reporting/index.ts:54-103` — precedent POST create (zod strict + 201 CreatedResponse)
  - `apps/server/src/routes/assignments/index.ts:13-18` — docblock CSRF mount-inside; `readBody` helper có sẵn
  - `apps/web/src/routes/_auth/assignments/index.tsx:58,137-140` — CTA mở modal placeholder; `index.test.tsx:134-152` — 2 test modal sẽ dọn
  - `apps/web/src/components/layout/app-shell.tsx:9-25` — `routeTitles` map; `apps/web/src/routes-matcher.ts:4-18` — `VALID_EXACT_ROUTES`
  - `apps/web/src/lib/use-kernel-form-submit.ts` + `KernelSubmitNotice` (dùng bởi 4 modal create hiện có) — pattern submit/reconcile
  - `apps/e2e/specs/create-invoice.spec.ts` + `helpers.ts:9 signUpViaUi` — pattern E2E persist
  - `docs/project-roadmap.md:100` — "tạo assignment" ứng viên M5; artifact design v3 `primary: true`, cập nhật 13:59 (muộn nhất trong 3 bản)
  - `KernelSubmitNotice` reuse verified qua grep 4 file modal

### Whole-Plan Consistency Sweep (2026-09-18)

- Đối chiếu chéo plan.md ↔ 3 phase files: tên route `/assignments/new`, tên action `create-assignment-prompt`, path POST `/api/assignments/prompts`, tên bảng `assignment_prompt`, collection `assignmentPrompts` — dùng thống nhất 1 cách viết ở mọi nơi.
- Không còn tham chiếu cũ (modal giữ lại / "Đã dùng N lớp" / prefill nguồn) mâu thuẫn với Key Decisions — Non-Goals và phase 2 đều nhất quán với tinh thần "honest UI".
- Phases table khớp filename + title frontmatter; `ak plan validate` → `[OK]`.

