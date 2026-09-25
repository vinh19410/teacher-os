---
title: "Phase 3: Update-E2E-And-Verify"
status: done
---

# Phase 3: Update-E2E-And-Verify

## Context Links

- `apps/e2e/specs/assignment-bank.spec.ts` (#208) — spec chính của trang bank
- `apps/e2e/specs/assignment-prompt-create.spec.ts` — 5 lần `page.goto("/assignments/bank")`
- `apps/e2e/specs/class-assign.spec.ts` — bước 12 & 14 goto `/assignments/bank`, check tag "Đã dùng 1 lớp"

## Overview

- **Priority**: P1
- **Status**: todo
- Trỏ cả 3 e2e spec tới `/assignments`, cập nhật assertion theo trang gộp (heading "Bài tập",
  bỏ bước click CTA "Ngân hàng đề"), rồi chạy bộ verify toàn diện: check-types + unit + e2e.

## Key Insights

- Playwright tự boot api + web + student qua `webServer` trong `apps/e2e/playwright.config.ts`
  (`pnpm run boot:api`, `pnpm --filter web exec vite`, `pnpm --filter student exec vite`) — chỉ cần chạy `pnpm --filter e2e e2e`.
- Body của trang gộp (filter card, listbox, StatusTag, count, preview) giữ nguyên từ bank →
  phần lớn assertion trong `assignment-bank.spec.ts` chỉ cần đổi URL + heading.
- Label `+ Tạo bài tập` trên `/assignments` được `assignment-prompt-create.spec.ts:14` click — giữ nguyên từ Phase 1.
- `assignment-bank.spec.ts:36-42`: bước "goto /assignments → click 'Ngân hàng đề' → expect URL /assignments/bank → expect heading 'Ngân hàng bài tập'" phải được thay bằng goto trực tiếp + expect heading "Bài tập".

## Requirements

- [x] Không spec e2e nào còn navigate tới `/assignments/bank`
- [x] Toàn bộ verify chain xanh: check-types → unit test → e2e
- [x] Sweep toàn repo: 0 tham chiếu `/assignments/bank` ngoài `routeTree.gen.ts`

## Architecture

Không đổi kiến trúc. Chỉ thay đổi e2e specs + chạy verification.

## Related Code Files

- Modify: `apps/e2e/specs/assignment-bank.spec.ts` — bỏ bước click "Ngân hàng đề", goto `/assignments`, heading "Ngân hàng bài tập" → "Bài tập", đổi comment header spec
- Modify: `apps/e2e/specs/assignment-prompt-create.spec.ts` — 5× `goto("/assignments/bank")` → `goto("/assignments")`; rà các assertion heading kèm theo
- Modify: `apps/e2e/specs/class-assign.spec.ts` — 2× `goto("/assignments/bank")` → `goto("/assignments")` (bước 12, 14)

## Implementation Steps

1. `assignment-bank.spec.ts`: thay khối navigation (dòng ~36-42) bằng `await page.goto("/assignments")` + expect heading "Bài tập"; giữ nguyên các assertion filter/search/count/StatusTag; cập nhật comment mô tả đầu file.
2. `assignment-prompt-create.spec.ts`: thay 5 URL goto; tìm trong file các assert nội dung liên quan "Ngân hàng" (nếu có) và đổi theo UI mới; label `+ Tạo bài tập` giữ nguyên.
3. `class-assign.spec.ts`: thay 2 URL goto (bước 12 & 14); assertion tag "Đã dùng 1 lớp" giữ nguyên.
4. Sweep: `grep -rn "assignments/bank" apps packages --include="*.ts" --include="*.tsx" | grep -v routeTree.gen` → phải 0 kết quả.
5. Chạy full verification (mục Verification bên dưới); nếu e2e fail do timing/label, sửa spec theo UI thực tế rồi chạy lại.

## Todo

- [x] Cập nhật `assignment-bank.spec.ts`
- [x] Cập nhật `assignment-prompt-create.spec.ts`
- [x] Cập nhật `class-assign.spec.ts`
- [x] Sweep grep = 0 tham chiếu `/assignments/bank`
- [x] `pnpm --filter web check-types` + `pnpm --filter web test` + `pnpm --filter e2e e2e` pass

## Success Criteria

- Cả 3 lệnh verify exit 0; grep sweep = 0
- Không có thay đổi nào trong `apps/server`, `packages/api`, `packages/db` (git diff confirm)

### Verification
```bash
grep -rn "assignments/bank" apps packages --include="*.ts" --include="*.tsx" | grep -v routeTree.gen
pnpm --filter web check-types
pnpm --filter web test
pnpm --filter e2e e2e
git diff --stat apps/server packages/api packages/db
```

## Risk Assessment

- E2E chạy đầy đủ stack (api + 2 web apps) — chậm; để lặp nhanh đúng 3 spec đã sửa: `pnpm --filter e2e exec playwright test specs/assignment-bank.spec.ts specs/assignment-prompt-create.spec.ts specs/class-assign.spec.ts` (KHÔNG dùng `--grep "assignment"` — grep khớp theo test title chứ không phải tên file, sẽ chạy 0 test).
- Heading "Bài tập" trùng text nav sidebar — Playwright dùng `getByRole("heading")` nên không conflict.

## Security Considerations

- Không thay đổi nào về auth/permission; e2e vẫn chạy trong môi trường test local.

## Next Steps

- Plan hoàn tất: review diff, tạo PR lên `develop`.
