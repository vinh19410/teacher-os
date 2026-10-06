---
phase: 2
title: "Server chặn check-in buổi tương lai"
status: completed
effort: "0.25d"
---

# Phase 2 — Server chặn check-in buổi tương lai

## Context

- `apps/server/src/routes/kernel.ts:1016-1056` — `lessonStatusAction` (check-in/cancel theo lesson id): chỉ kiểm tra `status === "upcoming"`; `findLessonAction` (`:328`) đã trả `row.date`.
- `apps/server/src/routes/kernel.ts:1303-1321` — `POST /classes/:id/sessions/:date/check-in` → `occurrenceStatusAction` (`:1271`), bulk update mọi row `upcoming` của bucket.
- `vietnamTodayISO` đã import ở `kernel.ts:35` (đang dùng cho due date bài tập). Test server đã có tiền lệ ngày tương đối `vietnamTodayISO()` (`kernel.test.ts:5725`).
- Client: `apps/web/src/lib/repos/kernel.ts:392` `parseErrorReason` lấy `body.error ?? body.reason` — **`error` thắng `reason`**. Hai hàm toast riêng: `planDirectOutcome` (modal /schedule, chỉ rẽ nhánh 409) và `occurrenceSummary` (tab chi tiết lớp `$classId.tsx:88`, không có `reconcile`). 409 bị map thành "Dữ liệu đã được cập nhật trước đó…" → **không** dùng 409 cho lỗi này.

## Requirements

1. Chỉ áp dụng cho **check-in** (`nextStatus === "completed"`); cancel và edit buổi tương lai vẫn cho phép.
2. `/lessons/:id/check-in`: nếu `row.date !== null && row.date > today` → `422`. Đặt guard **sau** check `status !== "upcoming"` (client cũ/duplicate vẫn nhận 409 heal) và thêm `date <= today` vào WHERE của UPDATE cho row có ngày (chống đua với đổi ngày giữa pre-read và write).
3. `/classes/:id/sessions/:date/check-in`: nếu `dateISO > today` → cùng response 422, kiểm tra trước khi ghi (sau check class/bucket tồn tại để 404 giữ nguyên).
4. Body 422 phải để **cả `error` lẫn `reason` đều là mã máy** `"future-session"` (vì `error` thắng `reason` ở client; body `{error: "session is in the future", reason: "future-session"}` sẽ không bao giờ khớp mapping).
5. "Hôm nay" = `vietnamTodayISO()` (so sánh chuỗi `yyyy-mm-dd`, độ chính xác theo ngày, đồng nhất với `sessionIsEligibleDate` web). **Không** thêm clock inject vào `kernelRoutes(deps)`/`AppDeps`: test dùng ngày tương đối `vietnamTodayISO()` ± n như `kernel.test.ts:5725`.
6. Client: map `422` + reason `future-session` → toast lỗi "Chưa tới ngày học — chưa thể điểm danh." ở **cả hai** `planDirectOutcome` (`reconcile: "check"` để tab cũ tự đồng bộ lại) và `occurrenceSummary`.
7. **Giới hạn đã biết (ghi vào PR):** row undated không có ngày để so → server cho qua; UI phase 1 chặn qua `isSequentialHead`/`canCheckIn` và Phase 3 gắn ngày cho lớp conform. Lớp không conform giữ NULL → chỉ UI chặn. Chặn `moveDate` đưa bucket đã chốt sang tương lai là ngoài phạm vi (endpoint edit-occurrence khác, không thuộc quyết định đã chốt).

## Files

- Modify: `apps/server/src/routes/kernel.ts`, `apps/web/src/lib/kernel-outcome.ts`
- Tests: `apps/server/src/kernel.test.ts`, `apps/server/src/kernel-occurrence.test.ts`, `apps/web/src/lib/kernel-outcome.test.ts` (hoặc test hiện có của kernel-outcome), `apps/web/src/lib/repos/kernel.transport.test.ts` (body thật có cả `error` và `reason`), `kernel-runtime.contract.test.ts` nếu regex trên source bị ảnh hưởng.

## Steps

1. Test server (viết trước), toàn bộ dùng ngày tương đối:
   - Dated lesson `date = today + 1` → check-in 422 `future-session` (cả `error` và `reason`), DB vẫn `upcoming`.
   - Dated lesson `date = today` → 200.
   - Undated lesson → 200 (giữ hành vi).
   - Lesson `completed` + date tương lai → 409 (không phải 422).
   - Cancel lesson tương lai → 200.
   - Occurrence check-in `:date = today + 1` → 422; `:date = today` → 200.
2. Implement guard.
3. Mapping toast client cho `planDirectOutcome` + `occurrenceSummary` + test transport với body thật.
4. `pnpm --filter server test`, `pnpm --filter web test`, `pnpm check-types`.

## Validation

- Toàn bộ test server cũ xanh (các fixture dùng ngày cố định 2026-08/09 đã ở quá khứ nên qua guard).
- E2E `class-operations` sau khi phase 1 sửa seed (`startDate = today`) vẫn check-in được.

## Risks

- Lệch múi giờ: so sánh chuỗi `yyyy-mm-dd` theo giờ VN, độ chính xác theo ngày (buổi hôm nay check-in được từ 00:00 VN). Tab mở qua nửa đêm VN có "hôm nay" cũ ở client → server là nguồn quyết định, `reconcile: "check"` làm tab tự đồng bộ.
- Client cũ (tab đang mở trước deploy) bấm Điểm danh buổi tương lai → nhận toast 422 mới sau khi đồng bộ; chấp nhận.
