---
phase: 2
title: "Tests, E2E & verification gates"
status: pending
effort: 1h
---

# Phase 2 — Tests, E2E & gates

## Files

| File | Action |
|---|---|
| `apps/student/src/components/vocab/vocab-session-view.test.tsx` | modify — case `mode` |
| `apps/e2e/specs/vocab-srs.spec.ts` | modify |
| `apps/e2e/specs/vocab-hub-suggestion.spec.ts` | modify |
| `apps/e2e/specs/vocab-library-clone.spec.ts` | modify |

## Steps

1. **Unit** (`vocab-session-view.test.tsx`):
   - Deck có cả từ `new` và từ `review`: `mode="review"` → không render `vocab-learn-intro`, render prompt ôn tập; `mode="learn"` → render `vocab-learn-intro`; không truyền `mode` → như cũ (learn).
   - Deck chỉ có từ `review` + `mode="learn"` → fallback review, không crash.
2. **E2E** — thay testid cũ theo ngữ cảnh (đọc từng chỗ trước khi sửa):
   - `vocab-deck-new-count` toHaveText("3") (`vocab-srs.spec.ts:~279`, `vocab-hub-suggestion.spec.ts:~306`) → assert `vocab-start-learn-btn` toContainText("Bắt đầu học (3)") và 3 thẻ không còn (`vocab-deck-new-count` toHaveCount(0)).
   - Luồng **học từ mới** → `vocab-start-learn-btn`: `vocab-srs:~284`, `vocab-hub-suggestion:~309`, `vocab-library-clone:~298`, `vocab-library-clone:~526`.
   - Luồng **ôn tập** → `vocab-start-review-btn`: `vocab-srs:~411`, `vocab-hub-suggestion:~374`.
   - `vocab-library-clone:~526` đang assert URL bằng regex `/session\?course=<id>$` — sửa để chấp nhận thêm `mode=learn` (thứ tự query do TanStack Router serialize; assert bằng `new URL(page.url()).searchParams` thay vì regex cứng).
   - Sau khi đổi, `grep -rn "vocab-start-session-btn\|vocab-deck-.*-count" apps/` phải rỗng.
   - Thêm assertion dashboard: `vocab-overview-new-count` hiển thị đúng tổng ở 1 spec có sẵn dữ liệu (vd `vocab-srs` trước khi học: "3").
3. **Gates**:
   ```bash
   pnpm check
   pnpm check-types
   pnpm --filter student test
   E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- vocab-srs vocab-hub-suggestion vocab-library-clone
   ```
   Trước khi squash-merge vào `develop`: chạy full e2e suite.
4. **Screenshot** trang `/vocab/$deckId` (2 trạng thái: bài mới tinh — Ôn tập disabled; bài đã học một phần — cả 2 enabled) và `/vocab` ở 1440×900, 768×1024, 375×812; kiểm tra focus ring khi Tab qua 2 nút (theo `REVIEW.md`). Đính kèm screenshot vào PR.

## Validation

Mọi lệnh bước 3 pass; acceptance criteria trong `plan.md` tick đủ.
