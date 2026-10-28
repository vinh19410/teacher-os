---
phase: 2
title: "UI Chấm nhanh và cảnh báo hết Credit"
status: completed
effort: 0.25d
---

# Phase 2 — UI Chấm nhanh và cảnh báo hết Credit

## Files to Create or Modify

- `packages/api/src/contracts.ts` — thêm `aiGradingMode: z.enum(AI_GRADING_MODES).nullable().optional()` vào `gradingQueueItemSchema`.
- `apps/server/src/routes/grading.ts` (+ `apps/server/src/routes/grading.test.ts`) — `loadGradingQueue` select thêm `aiGradingMode: aiGradingDraft.gradingMode` và trả về trong mỗi item.
- `apps/web/src/components/grading/ai-draft-panel.tsx` — thêm badge `"Bản nháp chấm nhanh"` (`AiQuickGradeBadge` hoặc hiển thị trong `AiDraftPanel` khi `draft.gradingMode === "quick"`), cập nhật `aiDraftErrorLabel` đọc thông điệp nguyên văn E-001 / E-002 từ `AI_GRADING_ERROR_MESSAGES`, và hiển thị banner cảnh báo E-001 / E-002 kèm nút **"Nạp thêm Credit"** (mở dialog hướng dẫn nạp thêm Credit / liên hệ chủ trung tâm hoặc link `topUpHref`).
- `apps/web/src/routes/_auth/grading/index.tsx` — hiển thị badge `"Bản nháp chấm nhanh"` trên hàng chờ khi `item.aiGradingMode === "quick"`.
- `apps/web/src/components/grading/ai-draft-panel.test.tsx` — unit tests cho badge `"Bản nháp chấm nhanh"`, thông điệp E-001 / E-002, và nút `"Nạp thêm Credit"`.

## Tasks & Steps

### Task 2.1 — Expose `aiGradingMode` trên hàng chờ `GET /api/grading`
- **Goal:** Mỗi phần tử của `GET /api/grading` có thêm `aiGradingMode` (`"standard" | "quick" | null`) để bảng hàng chờ `/grading` biết bài nào được chấm ở chế độ Chấm nhanh.
- **Target files and symbols:**
  - `packages/api/src/contracts.ts`: `gradingQueueItemSchema`.
  - `apps/server/src/routes/grading.ts`: `loadGradingQueue`.
  - `apps/server/src/routes/grading.test.ts`.
- **Steps:**
  1. Trong `packages/api/src/contracts.ts`, thêm `aiGradingMode: z.enum(AI_GRADING_MODES).nullable().optional()` vào `gradingQueueItemSchema`.
  2. Trong `apps/server/src/routes/grading.ts`, select thêm `aiGradingMode: aiGradingDraft.gradingMode` ở cả `assignmentRows` và `practiceRows` trong `loadGradingQueue`, chuẩn hoá qua helper `toAiGradingMode` và gắn vào `GradingQueueItem`.
  3. Cập nhật/thêm assertion trong `apps/server/src/routes/grading.test.ts`.
- **Success criteria:** `GET /api/grading` trả `aiGradingMode: "quick"` cho draft chấm nhanh và `null` khi chưa có draft.
- **Verify:** `pnpm --filter server test -- grading` exits 0.

### Task 2.2 — Badge `"Bản nháp chấm nhanh"` và banner E-001/E-002 + nút `"Nạp thêm Credit"` trên UI [7] & `/grading`
- **Goal:** Màn rà soát [7] (`AiDraftPanel`) và hàng chờ `/grading` hiển thị nhãn `"Bản nháp chấm nhanh"` khi `gradingMode === "quick"`; khi draft ở `manual_pending` với `errorCode` E-001 hoặc E-002 thì hiển thị đúng thông điệp nguyên văn spec kèm nút `"Nạp thêm Credit"`.
- **Target files and symbols:**
  - `apps/web/src/components/grading/ai-draft-panel.tsx`: `AiQuickGradeBadge`, `aiDraftErrorLabel`, `AiDraftPanel`.
  - `apps/web/src/routes/_auth/grading/index.tsx`.
  - `apps/web/src/components/grading/ai-draft-panel.test.tsx`.
- **Steps:**
  1. Trong `ai-draft-panel.tsx`, cập nhật `aiDraftErrorLabel(errorCode)` để trả nguyên văn `AI_GRADING_ERROR_MESSAGES[AI_GRADING_ERROR_CODES.INSUFFICIENT_CREDITS]` cho `E-selfomy-alignment-001` và `AI_GRADING_ERROR_MESSAGES[AI_GRADING_ERROR_CODES.QUOTA_EXHAUSTED]` cho `E-selfomy-alignment-002`.
  2. Tạo `AiQuickGradeBadge` render `<Badge variant="secondary">Bản nháp chấm nhanh</Badge>`; hiển thị trong header của `AiDraftPanel` khi `draft.gradingMode === "quick"`, và tại cột trạng thái của `apps/web/src/routes/_auth/grading/index.tsx` khi `item.aiGradingMode === "quick"`.
  3. Trong `AiDraftPanel`, khi `draft.status === "manual_pending"` và `draft.errorCode` là E-001 hoặc E-002: render khối cảnh báo (`role="alert"` / `data-testid="ai-credit-exhausted-banner"`) chứa thông điệp lỗi nguyên văn và nút/link **"Nạp thêm Credit"** (nếu truyền `topUpHref` thì render link, mặc định bấm mở thông báo/dialog hướng dẫn nạp thêm gói 100 Credit hoặc nâng cấp gói tháng).
  4. Bổ sung test trong `ai-draft-panel.test.tsx` kiểm tra: (a) `gradingMode: "quick"` hiện `"Bản nháp chấm nhanh"`, `"standard"` không hiện; (b) `errorCode = "E-selfomy-alignment-002"` và `"E-selfomy-alignment-001"` hiện nguyên văn thông điệp spec + nút `"Nạp thêm Credit"` và tương tác mở hướng dẫn nạp Credit.
- **Success criteria:** Unit tests của web pass, type-check toàn repo xanh.
- **Verify:** `pnpm --filter web test -- ai-draft-panel` exits 0 và `pnpm check-types` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
