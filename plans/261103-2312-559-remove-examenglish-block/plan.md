---
title: "#559: Bỏ khối \"Đã làm test examenglish\" khỏi form đăng ký profile"
description: "Xoá khối tuỳ chọn nhập kết quả ExamEnglish (HTML, CSS, JS, draft) khỏi apps/profile; placement chỉ còn lấy từ quiz."
status: completed
priority: P3
effort: 0.5h
issue: 559
branch: fix/559-remove-examenglish-block
tags: [frontend, profile]
blockedBy: []
blocks: []
created: 2026-11-03
---

# Plan: #559 — Bỏ khối "Đã làm test examenglish"

## Outcome

Form đăng ký ở `apps/profile` không còn khối `<details>` "Đã làm test examenglish?", 2 link ExamEnglish và ô nhập kết quả. Trường `placement` gửi từ `#consultForm` chỉ lấy giá trị từ `quizPlacementInput` (đã `.trim().slice(0, 300)`), không còn ghép thêm ô ExamEnglish.

## Non-goals

- Không đổi API/schema lead; không sửa quiz placement; không sửa plan cũ #506 (bản ghi lịch sử).

## Phạm vi đã scout

Mã nguồn cần xoá nằm trong `apps/profile/public/index.html` (thư mục output build `dist/` không sửa tay). Lưu ý `biome.json:37` loại trừ `!**/apps/profile/public/index.html`, nên Phase 1 bổ sung kiểm tra biên dịch `<script>` inline bằng `node:vm` (`new vm.Script`, lọc bỏ non-JS `type`/`src`) trong `apps/profile/tests/index.test.mjs` và ghi nhận `CHANGELOG.md`.

## Phases

| # | Phase | Trạng thái |
|---|---|---|
| 1 | [Xoá khối ExamEnglish](phase-01-remove-examenglish-block.md) | completed |

## Acceptance criteria

- `grep -i examenglish apps/profile/public/index.html` không còn kết quả.
- Gửi form vẫn tạo lead; `placement` giữ giá trị quiz.
- `pnpm --filter profile test` và `pnpm exec biome check .` xanh; không lỗi console.

## Validation Log

### Session 1 — 2026-11-04
- **Mode:** Autonomous (`ak-vibe --ship --beta --advice`) — handover-ready cho downstream executor kèm `## Failure Protocol`.

### Verification Results
- **Tier:** Light (1 phase — Fact Checker)
- **Claims checked:** 12
- **Verified:** 9 | **Failed:** 3 (đã xử lý triệt để vào Phase 1) | **Unverified:** 0

#### Verified & Resolved Claims
1. `VERIFIED (apps/profile/public/index.html:1445-1470,2835-2847,3220,3307,3325,3361)` — Toàn bộ CSS, HTML và biến JS của khối ExamEnglish nằm trong `apps/profile/public/index.html`.
2. `VERIFIED (apps/profile/build.mjs:5-24)` — Output `apps/profile/dist` sinh tự động từ `public/`, không sửa tay.
3. `VERIFIED (apps/profile/tests/index.test.mjs:1-125, apps/e2e/specs/profile-lead-intake.spec.ts:1-291)` — Test hiện hữu chưa tham chiếu `examenglish`.
4. `VERIFIED (apps/profile/public/index.html:3304-3310,3432,3466,3517)` — `getCombinedPlacement()` có đúng 1 định nghĩa và 3 điểm gọi (bao gồm nhánh lỗi `buildFallbackZaloMessage`).
5. `FAILED -> RESOLVED (biome.json:37)` — `biome.json` có `"!**/apps/profile/public/index.html"` nên `biome check .` không quét JS inline của `index.html`. Theo tư vấn Kongming, bổ sung kiểm tra biên dịch `new vm.Script` cho mọi thẻ `<script>` JS inline vào `apps/profile/tests/index.test.mjs` (không mock DOM giả cồng kềnh; hành vi runtime được kiểm chứng trên Chromium thật và Playwright E2E).
6. `FAILED -> RESOLVED (apps/profile/public/index.html:3304,3432)` — Đã bỏ tuỳ chọn đổi tên `getPlacement()` (giữ nguyên `getCombinedPlacement()` + `.trim().slice(0, 300)`) để chặn lỗi `ReferenceError` ở nhánh fallback Zalo và chặn lỗi HTTP `400` khi `restoreDraft()` nạp chuỗi dài.
7. `FAILED -> RESOLVED (phase-01-remove-examenglish-block.md)` — Đã nâng cấp `phase-01` lên chuẩn handover `--advice` (tách task TDD Red-Green, điều kiện `Verify` cơ học, cấu hình `LEAD_API_URL` + cổng `8105` khi chạy smoke 3 viewport để không chạm prod API hay vướng `403` CORS, kèm khối `## Failure Protocol`).

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-remove-examenglish-block.md`
- Decision deltas checked: 5 (cập nhật `Outcome` chính xác, mở rộng `Files` thêm `apps/profile/tests/index.test.mjs` và `CHANGELOG.md`, chốt `getCombinedPlacement().trim().slice(0, 300)`, chuẩn hoá cổng `8105` + `?ketqua=` cho smoke 3 viewport, gắn `## Failure Protocol`)
- Reconciled stale references: 4
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-11-04
**Findings:** 6 deduplicated from `RedTeamSecurity` & `RedTeamAssumptions` (5 accepted, 1 rejected)
**Severity breakdown:** 1 Critical, 3 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `biome.json:37` loại trừ `!**/apps/profile/public/index.html` và `apps/profile/tests/index.test.mjs` chỉ kiểm regex tĩnh, khiến lỗi cú pháp/runtime trong `<script>` inline lọt qua CI và làm vỡ `e.preventDefault()` của `#consultForm` (rò rỉ PII qua native `GET`) | Critical | Accept | `plan.md`, Phase 1 (Task 1.1, Task 1.3) |
| 2 | Tuỳ chọn đổi tên `getCombinedPlacement()` → `getPlacement()` lọt qua `grep -i examenglish` (gây `ReferenceError` ngầm ở `buildFallbackZaloMessage:3432`) và thiếu chỉ định giữ `.trim().slice(0, 300)` chống lỗi `400 LEAD_INVALID` từ `restoreDraft()` (`packages/api/src/lead-contracts.ts:13,212`) | High | Accept | Phase 1 (Task 1.2) |
| 3 | Kiểm chứng 3 viewport chưa chỉ định `LEAD_API_URL` / cổng `8105` và `?ketqua=...` với SĐT mới (nguy cơ bắn nhầm prod API `https://api.teacheros.io.vn`, dính `403 LEAD_ORIGIN_FORBIDDEN` ở cổng `8005`, hoặc dính bẫy `LEAD_MIN_ELAPSED_MS = 3000` / SQL dedupe `CASE WHEN`) | High | Accept | Phase 1 (Task 1.4) |
| 4 | `phase-01-remove-examenglish-block.md` thiếu cấu trúc task bàn giao `--advice`, điều kiện `Verify` cơ học và khối `## Failure Protocol` | High | Accept | Phase 1 (toàn file) |
| 5 | Thiếu kiểm tra keyboard `Tab` (`#targetNote` → `#submitLeadBtn`), `320px` reflow theo `REVIEW.md` và cập nhật `CHANGELOG.md` (`#559`); đồng thời câu `Outcome` trong `plan.md` cần nêu rõ phạm vi form client thay vì hàm ý xác thực `?ketqua=` phía server | Medium | Accept | `plan.md`, Phase 1 (Task 1.4, Task 1.5) |
| 6 | `apps/profile/public/kiem-tra-dau-vao/test.js:121` dùng `{ ...existing }` trên `msmy_lead_draft_v1` có thể giữ lại key `examEnglish` cũ trong `localStorage` cho tới lần `saveDraft()` kế tiếp trên trang chủ | Medium | Reject | Không áp dụng — sửa `kiem-tra-dau-vao/test.js` vi phạm Non-goal (`không sửa quiz placement`); key `examEnglish` cũ trong `localStorage` hoàn toàn không được đọc vào DOM hay gửi lên API, và tự động bị xoá ở lần `saveDraft()` hoặc `clearDraft()` tiếp theo trên trang chủ |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-remove-examenglish-block.md`
- Decision deltas checked: 5 accepted findings
- Reconciled stale references: 4
- Unresolved contradictions: 0
