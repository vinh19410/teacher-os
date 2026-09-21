---
phase: 3
title: "E2E preview flow & verification sweep"
status: todo
priority: P1
effort: "1h"
dependencies: ["phase 1", "phase 2"]
---

# Phase 3: E2E preview flow & verification sweep

## Context Links

- Plan: [plan.md](./plan.md) — Goals 3; Success Criteria toàn plan.
- Evidence: [reports/scout-report.md](./reports/scout-report.md) — cấu hình Playwright (webServer vite :8001 `--strictPort` + API :8000, `reuseExistingServer: false` — apps/e2e/playwright.config.ts:33-51); 3 spec phụ thuộc chip "Bản nháp".
- Spec sẽ sửa: `apps/e2e/specs/assignment-prompt-create.spec.ts` (2 test hiện có đã được phase 1 dời assert sang bank).

## Overview

Thêm test E2E khóa trọn luồng mới: soạn dở trên `/assignments/new` → bấm "Xem trước" → trang `/assignments/preview` hiển thị đề đúng như học viên đọc (kèm vùng làm bài mô phỏng) → quay lại soạn mà không mất form → lưu ready → dữ liệu sống qua reload. Sau đó chạy toàn bộ gate (unit + types + lint + 3 spec E2E phụ thuộc chip "Bản nháp") và sweep cuối cùng các kiểm tra dọn dẹp của phase 1-2.

## Key Decisions

1. **Test mới thêm vào `assignment-prompt-create.spec.ts`** (không tạo file spec mới — luồng preview là phần mở rộng của create flow, giữ spec tập trung theo trang).
2. **Dùng `getByText` cho title trên trang preview** — title trong `StudentPreviewPaper` là `<p class="font-display…">` (student-preview-paper.tsx:37-39), **không phải heading**; `getByRole("heading")` sẽ thất bại. Prompt body cũng là text (`getByText` với chuỗi con).
3. **Khóa cả nhánh "không mất form"** — assert bằng `toHaveValue` trên 2 input `getByLabel("Tiêu đề")` / `getByLabel("Nội dung đề")` sau khi quay lại từ preview.
4. **Bề mặt E2E cần xanh**: `assignment-prompt-create` (đã sửa ở phase 1 + test mới), `assignment-bank` + `class-assign` (không được sửa — chứng minh chips dời vị trí không phá nhãn).
5. **Sweep cuối**: grep xác nhận không còn tham chiếu `BankContextCard`; addendum design-spec còn nguyên; không có file chết.

## Related Code Files

| Action | File |
|--------|------|
| Modify | `apps/e2e/specs/assignment-prompt-create.spec.ts` (thêm 1 test) |
| Create | không |
| Delete | không |

## Implementation Steps

1. Thêm test `"preview as a student, return to the form without losing it, then save ready"` vào `assignment-prompt-create.spec.ts`:
   1. `signUpViaUi(page)` → `page.goto("/assignments/new")`.
   2. Fill `getByLabel("Tiêu đề")` = `"QC-202 Preview Flow"`; fill `getByLabel("Nội dung đề")` = `"Some people believe that preview should match the student view…"`.
   3. Bấm `getByRole("button", { name: "Xem trước" })` → `await expect(page).toHaveURL(/\/assignments\/preview$/)`.
   4. Assert paper: `getByText("QC-202 Preview Flow").first()` visible; `getByText(/Some people believe that preview/)`.first() visible; `getByText("Bản xem trước — bài làm không được lưu.")` visible; `getByText("Bài làm của học viên (mô phỏng)")` visible.
   5. Reload trang preview → title paper vẫn visible (khóa `readPreviewDraft` không xóa).
   6. Bấm `getByRole("button", { name: "Quay lại soạn đề" })` → `toHaveURL(/\/assignments\/new$/)`; assert `getByLabel("Tiêu đề")` `toHaveValue("QC-202 Preview Flow")` và `getByLabel("Nội dung đề")` `toHaveValue(/Some people believe that preview/)` (khóa restore-on-mount).
   7. Bấm `getByRole("button", { name: "Lưu vào ngân hàng" })` → heading `"Đã thêm vào ngân hàng"` visible → `page.goto("/assignments/bank")` → reload → TITLE vẫn visible (persist thật).
2. Chạy riêng spec mới tới khi xanh (`npx playwright test assignment-prompt-create -g "preview"`).
3. **Sweep dọn dẹp**: `grep -rn "BankContextCard\|bank-context-card" apps/ packages/` (kỳ vọng 0); `grep -n "Addendum 2026-09-21" plans/260921-0351-assignment-create-redesign/research/design-spec.md` (kỳ vọng 1); mở tay `/assignments/preview` trực tiếp khi clear sessionStorage → empty state (đã tự kiểm phase 2, xác nhận lại).
4. Chạy toàn bộ 3 spec E2E phụ thuộc chip "Bản nháp": `assignment-prompt-create`, `assignment-bank`, `class-assign`.
5. Chạy full gate repo + server (không đổi, chỉ chứng minh không vỡ): `pnpm check && pnpm check-types && pnpm test` + `cd apps/server && npx vitest run`.

## Todo

- [ ] Thêm test E2E preview flow (7 bước trên)
- [ ] Spec mới xanh độc lập (`-g preview`)
- [ ] Sweep grep BankContextCard = 0, addendum = 1
- [ ] 3 spec E2E xanh (`assignment-prompt-create assignment-bank class-assign`)
- [ ] Full gate + server vitest xanh
- [ ] Đánh dấu các Success Criteria plan.md đạt được

## Success Criteria

- [ ] Test E2E preview xanh: URL đúng 2 chiều, paper đúng đề, reload preview vẫn hiện, quay lại còn nguyên form, lưu ready + persist qua reload
- [ ] `assignment-bank.spec.ts` + `class-assign.spec.ts` xanh **không phải sửa gì thêm** (chứng minh Key Decision chips giữ nhãn đúng)
- [ ] `pnpm check && pnpm check-types && pnpm test` exit 0; `apps/server` vitest run exit 0
- [ ] Sweep grep sạch: 0 tham chiếu `BankContextCard`; addendum design-spec còn nguyên

## Risk Assessment

- **R1 (Medium): assert heading cho title preview sẽ sai selector** — title là `<p>` (Key Decision 2); dùng `getByText` + `.first()` (tránh trùng text ở tag khác).
- **R2 (Low): port bị chiếm khiến Playwright không boot** — config đã `--strictPort` + `reuseExistingServer: false`; tắt tiến trình dev tay trước khi chạy.
- **R3 (Low): restore bị flaky nếu navigate quá sớm trước khi `savePreviewDraft` ghi xong** — `savePreviewDraft` là API đồng bộ (sessionStorage setItem); gọi `navigate` sau khi save trong cùng handler là đủ, không cần await.

## Security Considerations

- Không thay đổi bề mặt bảo mật — E2E chỉ exercise luồng đã có; không thêm route public mới (preview nằm sau `_auth`).

## Verification Commands

```bash
cd apps/e2e && npx playwright test assignment-prompt-create
cd apps/e2e && npx playwright test assignment-prompt-create assignment-bank class-assign
cd apps/server && npx vitest run
pnpm check && pnpm check-types && pnpm test
```

## Next Steps

- Đánh dấu plan hoàn thành; mở issue/plan tương lai cho preview đề **đã lưu** (`/assignments/preview?id=…`) và write-path đánh dấu nộp bài — ngoài phạm vi (plan.md Key Decision 7).
