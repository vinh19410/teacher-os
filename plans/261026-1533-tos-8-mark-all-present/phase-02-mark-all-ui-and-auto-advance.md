---
phase: 2
title: "Nút điền nhanh, hộp xác nhận khi lưu thiếu, tự mở ca kế tiếp"
status: pending
priority: P2
effort: "4h"
dependencies: [1]
---

# Phase 2: UI thao tác nhanh trên màn /attendance

> **Cập nhật 2026-10-26 (red-team #2–#9, #11, #12):** neo tích hợp dùng đúng code thật của TOS-7 — lưu qua hàm async `handleSaveSession` (không có useMutation), mở ca qua `expandedKeys: Set<string>` + `sessionKey()` = `${mode}:${classId}:${time}` (không chứa ngày), giữ multi-open. Không tạo state song song `openClassKey`.
>
> **Cập nhật 2026-10-26 (kongming GO, 4 điều kiện):** (1) thông báo/empty-state dùng `actionablePending` (loại legacy), không dùng `counts.pending`; (2) route giữ `latestSearchRef` — date/status đổi giữa lúc lưu thì bỏ auto-advance; tìm ca kế tiếp bằng index ca vừa lưu trong `fresh.sessions` đầy đủ rồi quét tới + vòng lại; kiểm `getQueryState(...).status !== "error"` và `dataUpdatedAt > thời điểm lưu`; cờ "đang lưu" bằng `useRef`; **không đụng `autoExpandedForKey`**; (3) "Quay lại chỉnh"/Esc focus dòng thiếu đầu tiên **sau khi modal đóng** (cờ `focusFirstMissingAfterClose` + effect, vì cleanup của `Modal` trả focus về nút lưu) — test assert `toHaveFocus()`; (4) vùng aria-live đặt `role="status"` + `data-testid="attendance-live-status"` để e2e chọn đúng 1 phần tử.

## Goal

Đưa `markAllPresent()` ra giao diện và rút ngắn luồng điểm danh nhiều ca liên tiếp.

## Files to Create / Modify

- Modify: `apps/web/src/components/attendance/attendance-session-row.tsx` (TOS-7 tạo).
  - Nút secondary **Đánh dấu tất cả Có mặt** đặt trên bảng học viên (hàng động tác, theo wireframe). Disabled khi `missingAttendanceLessonIds(draft).length === 0` **hoặc `session.recorded`** (kể cả khi còn dòng "Chưa rõ (điểm danh cũ)" — không bulk-fill đè lịch sử) **hoặc** `isFutureDate` / `session.mode === "legacy"` / `saving`; **không render** cho lớp legacy.
  - Nhận prop `autoFocusBulk?: boolean`; khi `true` và hàng vừa mở thì **focus picker trạng thái đầu tiên** (không phải nút điền nhanh — tránh Enter mặc định đậu trên thao tác ghi hàng loạt) + `scrollIntoView({ block: "nearest" })` trên thẻ ca.
  - Khi bấm lưu mà `missingAttendanceLessonIds(draft).length > 0` **và ca chưa `recorded`**: mở `Modal` xác nhận thay vì chặn ngay; ca recorded có dòng thiếu vẫn đi đường TOS-7 (viền vàng + focus dòng thiếu đầu tiên).
  - Responsive `<lg`: hàng động tác (điền nhanh + lưu) xếp chồng full-width, ô bấm ≥ 44px chiều cao (`min-h-11`), không tràn 375px.
- Create: `apps/web/src/components/attendance/fill-missing-confirm.tsx`. Nội dung `Modal` (`apps/web/src/components/ui/modal.tsx`):
  - Tiêu đề "Còn N học viên chưa chọn trạng thái".
  - Mô tả "Gán Có mặt cho N học viên này rồi lưu điểm danh ca học?"
  - Nút "Gán Có mặt và lưu" (primary) và "Quay lại chỉnh". Esc / đóng modal = "Quay lại chỉnh".
  - **Cấm dispatch-then-read** (red-team #2): "Gán Có mặt và lưu" tính `next = markAllPresentState(draft)` (pure helper Phase 1), gọi `onSave(toSaveEntries(next))`, rồi mới `dispatch({ type: "markAllPresent" })` để sync UI.
  - **Guard double-submit** (red-team #6): nhận prop `saving`, cả 2 nút `disabled={saving}`; modal đóng ngay khi bấm xác nhận, route chịu trách nhiệm idempotent theo key.
  - "Quay lại chỉnh": hành vi TOS-7 (viền `warning` + focus dòng thiếu đầu tiên + thông báo).
- Modify: `apps/web/src/routes/_auth/attendance.tsx` (TOS-7 tạo).
  - Tái dụng `sessionKey()` + `expandedKeys`: thêm state `autoFocusBulkKey: string | null` (tự mở = thêm key vào `expandedKeys` **và** đặt `autoFocusBulkKey`); `toggleSession` thủ công xoá `autoFocusBulkKey`.
  - Trong `handleSaveSession` **nhánh thành công**, sau `await queryClient.invalidateQueries({ queryKey: ["kernel"] })` (red-team #3 — danh sách stale trước refetch giữ `recorded=false` cho ca vừa lưu, không dùng được): đọc dữ liệu mới `queryClient.getQueryData(dailyAttendanceQueryKey(search.date))`, lọc theo chip đang hiển thị, quét ca kế tiếp theo thứ tự hiển thị với điều kiện `!recorded && mode !== "legacy" && key !== keyVừaLưu`; hết thì vòng lại từ đầu danh sách đã lọc (an toàn vì `recorded` đã flip). Thấy thì thêm key vào `expandedKeys` + đặt `autoFocusBulkKey`; đồng thời đặt `autoExpandedForKey` để không đụng độ effect tự-mở-ca-đầu của TOS-7.
  - **Không tự mở khi lưu thất bại** (mọi nhánh catch) (red-team #12).
  - Hết ca: vùng `aria-live="polite"` **persistent** (luôn mount, ẩn thị giác) trong route. `counts.pending === 0` (sau refetch) → "Đã điểm danh xong mọi ca trong ngày" + focus về ô chọn ngày (anchor, không rơi về `body`) (red-team #8, #11); còn pending ngoài danh sách lọc (legacy, hoặc chip completed/all quét hết) → "Còn N ca chưa điểm danh trong ngày".
  - Empty-state riêng cho chip `pending` khi `counts.all > 0 && counts.pending === 0`: "Đã điểm danh xong mọi ca trong ngày" thay vì "Không có ca học nào trong ngày này." (red-team #8).
  - Route chặn `onSave` re-entry khi `savingKey !== null` (red-team #6).
- Modify: `apps/web/src/components/attendance/attendance-session-row.test.tsx`, `apps/web/src/routes/_auth/attendance.test.tsx`. Hai test hiện có assert chặn-lưu-trực-tiếp (row test "bấm lưu khi còn học viên chưa chọn…" và test ca recorded "Chưa rõ") **đổi có chủ đích** theo D2: sau bấm lưu phải thấy modal (chưa recorded) hoặc giữ hành vi TOS-7 (recorded); assertion không giảm, chỉ mở rộng.

## Tasks & Steps

1. Test cho `AttendanceSessionRow`:
   - Bấm "Đánh dấu tất cả Có mặt" → mọi radio trống chuyển "Có mặt", radio đã chọn giữ nguyên, ghi chú giữ nguyên.
   - Nút disabled khi đủ trạng thái, khi `recorded` (kể cả còn dòng "Chưa rõ"), khi ngày tương lai; không render cho lớp legacy.
   - Lưu khi thiếu 2 người (ca chưa recorded) → modal ghi "Còn 2 học viên"; "Gán Có mặt và lưu" → `onSave` nhận đủ entries với 2 người `present` (entries tính từ helper — spy không thấy throw).
   - "Quay lại chỉnh" và Esc → `onSave` không được gọi, dòng thiếu có viền cảnh báo.
   - Ca recorded còn thiếu → bấm lưu **không** mở modal, đi đường TOS-7.
   - Modal double-click khi `saving` → chỉ 1 lần `onSave`.
   - `autoFocusBulk` → picker đầu tiên có focus sau khi mở.
2. Test cho route: lưu ca thứ nhất thành công → ca pending thứ hai mở + picker đầu focus; lưu ca cuối (`counts.pending === 0`) → aria-live "Đã điểm danh xong mọi ca trong ngày" + focus ô chọn ngày; ngày còn legacy pending → aria-live "Còn N ca…"; lưu 409 → không tự mở, không thông báo hoàn tất; ngày còn đúng 1 ca pending → sau lưu **không** tái mở chính nó; empty-state pending riêng. Kiểm cả khi `status=pending` (ca vừa lưu biến khỏi danh sách sau refetch).
3. Viết component và logic route cho test xanh.
4. Tự kiểm bàn phím: luồng một ca gồm điền nhanh (Shift+Tab từ picker đầu nếu cần) → chỉnh ngoại lệ → "Lưu điểm danh ca học" → Enter, focus tự sang picker đầu của ca kế tiếp.
5. Đọc `DESIGN.md`; nút secondary dùng biến thể `Button` có sẵn, không hard-code màu.

## Verification

- `pnpm --filter web test -- attendance`
- `pnpm check-types`
- `pnpm check`
