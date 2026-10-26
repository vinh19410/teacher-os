---
title: "TOS-8: Đánh dấu tất cả Có mặt và lưu điểm danh hàng loạt"
description: "Thêm thao tác nhanh trên màn /attendance: điền Có mặt cho mọi học viên chưa chọn trong ca đang mở, hỏi gán Có mặt khi lưu còn thiếu, tự mở ca chưa điểm danh kế tiếp sau khi lưu để hoàn tất ≥ 5 lớp trong ≤ 2 phút."
status: pending
priority: P2
effort: 1d
issue: 441
branch: feat/tos-8-mark-all-present
tags: [feature, frontend]
blockedBy: [261026-1524-tos-7-daily-attendance-inline]
blocks: []
created: 2026-10-26
---

# Plan: TOS-8 — Đánh dấu tất cả Có mặt, lưu hàng loạt

## Overview

Màn `/attendance` (TOS-7) đã cho chọn 1 trong 4 trạng thái cho từng học viên rồi lưu cả ca trong một request. TOS-8 bổ sung thao tác nhanh để giáo viên chỉ phải chỉnh những người vắng hoặc đi muộn:

1. Nút **Đánh dấu tất cả Có mặt** trong ca đang mở: gán `present` cho mọi học viên **chưa chọn** trạng thái. Lựa chọn đã có được giữ nguyên.
2. Bấm **Lưu điểm danh ca học** khi còn học viên trống: hộp xác nhận "Gán Có mặt cho N học viên còn trống và lưu?". Đồng ý thì điền rồi lưu luôn; Huỷ thì quay về hành vi TOS-7 (viền vàng + focus dòng thiếu đầu tiên).
3. Lưu xong một ca: thu gọn ca đó, **tự mở và focus ca chưa điểm danh kế tiếp**. Mục tiêu NFR-008: ngày có ≥ 5 lớp hoàn tất trong ≤ 2 phút.

Nguồn: Jira [TOS-8](https://teacher-os.atlassian.net/browse/TOS-8) (subtask của TOS-5 / US-001), `docs/selfomy-alignment/userstories/us-001.md#AC-003`, wireframe `docs/selfomy-alignment/ascii-wireframe/daily-ops-and-holiday-flow.md` (Screen `daily-attendance`, mục 7, 8 và "Ràng buộc đầy đủ sĩ số"), FR-selfomy-alignment-005, NFR-selfomy-alignment-008 (`docs/selfomy-alignment/srs/selfomy-alignment-spec.md:87`).

## Scope Challenge

- **Code sẽ có từ TOS-7 (chưa code, chưa merge):**
  - Reducer nháp `apps/web/src/lib/attendance-draft.ts` với `set`, `setNote`, `reset`, `missing()`. TOS-7 Phase 3 đã thiết kế để thêm `markAllPresent()` mà không đổi cấu trúc.
  - Component `apps/web/src/components/attendance/attendance-session-row.tsx` và route `apps/web/src/routes/_auth/attendance.tsx`.
  - `PUT /api/classes/:id/sessions/:date/attendance` lưu cả ca trong 1 transaction. Đây đã là "lưu hàng loạt" theo nghĩa của AC-003, **không cần đổi server**.
- **Code đã có trong repo:** `Modal` (`apps/web/src/components/ui/modal.tsx`), `Button`, `Kbd`.
- **Độ phức tạp:** ~6 file, chỉ frontend + e2e. Không migration, không endpoint mới.
- **Mode:** HOLD SCOPE. Plan auto mức fast + scout.

## Quyết định đã chốt (2026-10-26)

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **"Đánh dấu tất cả Có mặt" chỉ điền ô trống.** Không ghi đè lựa chọn đã có, không đụng ghi chú. Nút disabled khi `missing().length === 0`. | Đúng wireframe mục 7. Gherkin AC-003 (bấm nút rồi mới chỉnh Nam) vẫn đúng. Ca đã điểm danh khi mở lại để sửa thì nút tự tắt. |
| D2 | **Lưu khi thiếu → hỏi xác nhận.** `Modal` "Còn N học viên chưa chọn trạng thái. Gán Có mặt cho họ và lưu?" với 2 nút "Gán Có mặt và lưu" (primary) / "Quay lại chỉnh". Huỷ thì giữ hành vi TOS-7. | Wireframe "Ràng buộc đầy đủ sĩ số" cho phép cả hai cách; user chọn gợi ý xác nhận. Server vẫn trả 422 nếu thiếu, nên không có đường lưu thiếu. |
| D3 | **Sau khi lưu, tự mở ca pending kế tiếp** theo thứ tự giờ bắt đầu trong danh sách đang hiển thị (sau lọc chip). Focus vào nút "Đánh dấu tất cả Có mặt" của ca đó. Hết ca pending thì không mở gì và đọc thông báo "Đã điểm danh xong mọi ca trong ngày" qua `aria-live`. | Bớt 1 thao tác mở ca mỗi lớp; kết hợp D1 thì luồng 1 ca chỉ còn: Enter (điền) → chỉnh ngoại lệ → lưu. |
| D4 | **Không đổi server, không đổi contract.** Toàn bộ thay đổi nằm ở reducer nháp + component + e2e. | PUT của TOS-7 đã nhận đủ sĩ số trong 1 request. |

## Non-goals

- Không làm "Đánh dấu tất cả Có mặt cho mọi ca trong ngày" (lưu nhiều ca một lần). AC-003 chỉ nói trong một ca.
- Không thêm phím tắt toàn cục. Luồng bàn phím dựa trên focus tự chuyển (D3).
- Không làm ô tìm kiếm `?q=`, bộ lọc giáo viên, lịch nghỉ chung, phạm vi Trợ giảng (như non-goals của TOS-7).
- Lớp legacy (`date IS NULL`) vẫn chỉ xem; không có nút điền nhanh, D3 bỏ qua chúng khi tìm ca kế tiếp.

## Phases

| # | Phase | Trạng thái | Phụ thuộc |
|---|---|---|---|
| 1 | [phase-01-draft-bulk-actions.md](phase-01-draft-bulk-actions.md): `markAllPresent()` trong reducer nháp + test | pending | TOS-7 Phase 3 |
| 2 | [phase-02-mark-all-ui-and-auto-advance.md](phase-02-mark-all-ui-and-auto-advance.md): nút điền nhanh, hộp xác nhận khi lưu thiếu, tự mở ca kế tiếp | pending | 1 |
| 3 | [phase-03-e2e-ac-003-and-nfr-008.md](phase-03-e2e-ac-003-and-nfr-008.md): E2E AC-003, đo 5 ca ≤ 2 phút, 3 viewport | pending | 2, TOS-7 Phase 5 |

## Acceptance Criteria (map AC-003)

- [ ] Mở một ca chưa điểm danh, bấm "Đánh dấu tất cả Có mặt": mọi học viên chưa chọn chuyển sang Có mặt; học viên đã chọn trước đó giữ nguyên.
- [ ] Sau đó chỉnh "Trần Hoàng Nam" sang Vắng có phép rồi lưu: server lưu Nam là `excused` (`status = absent`), mọi học viên còn lại là `present` (`status = completed`). Kiểm qua reload trang.
- [ ] Nút "Đánh dấu tất cả Có mặt" disabled khi không còn ai trống.
- [ ] Lưu khi còn N học viên trống thì hiện hộp xác nhận ghi đúng N. "Gán Có mặt và lưu" lưu thành công; "Quay lại chỉnh" không gửi request và tô viền vàng dòng thiếu.
- [ ] Lưu xong, ca pending kế tiếp tự mở và nút điền nhanh của nó nhận focus; hết ca thì có thông báo `aria-live`.
- [ ] E2E: 5 lớp có ca hôm nay, điểm danh lần lượt bằng điền nhanh + chỉnh 1 người + lưu, tổng thời gian ≤ 120 giây (NFR-008); mỗi lần lưu ≤ 2 giây (NFR-001).
- [ ] `pnpm check`, `pnpm check-types`, test web và e2e liên quan đều xanh.

## Rủi ro

- **Phụ thuộc TOS-7 chưa code.** Mọi file sửa ở đây do TOS-7 tạo. Bắt đầu khi TOS-7 Phase 3 đã vào `develop`; nếu làm song song thì rebase lên `feat/tos-7-daily-attendance-inline`. Tên hàm trong plan theo TOS-7 Phase 3, cần đối chiếu lại khi code thật xong.
- **Bấm nhầm "Gán Có mặt và lưu"** làm học viên vắng bị ghi Có mặt và trừ buổi. Giảm rủi ro: hộp xác nhận ghi rõ số người, nút huỷ là lựa chọn mặc định khi nhấn Esc; ca vẫn sửa lại được (TOS-7 D5).
- **Tự mở ca kế tiếp gây nhảy cuộn** trên 375px. Dùng `scrollIntoView({ block: "nearest" })` và chỉ cuộn khi ca nằm ngoài khung nhìn.
- **Lọc chip `status=pending`:** ca vừa lưu biến khỏi danh sách sau khi refetch, nên tìm "ca kế tiếp" phải dựa trên danh sách trước refetch, nếu không focus sẽ mất.

## Validation Log

### Session 1 — 2026-10-26

Đã hỏi 3 câu, cả ba chọn phương án đề xuất:
- **Ghi đè:** chỉ điền ô trống (D1).
- **Lưu khi thiếu:** hỏi xác nhận gán Có mặt rồi lưu (D2).
- **Luồng nhanh:** tự mở ca chưa điểm danh kế tiếp (D3).

### Verification Results

- Claims checked: 6.
- Verified: 4 | Unverified (do TOS-7 sẽ tạo): 2.
- Bằng chứng:
  - AC-003 ở `docs/selfomy-alignment/userstories/us-001.md:59-71`.
  - Wireframe mục 7 và "Ràng buộc đầy đủ sĩ số" ở `docs/selfomy-alignment/ascii-wireframe/daily-ops-and-holiday-flow.md:105,113`.
  - NFR-008 ở `docs/selfomy-alignment/srs/selfomy-alignment-spec.md:87`.
  - `Modal` ở `apps/web/src/components/ui/modal.tsx`.
  - Chưa có: `apps/web/src/lib/attendance-draft.ts`, `apps/web/src/components/attendance/` (TOS-7 Phase 3).

### Whole-Plan Consistency Sweep

- Tên `markAllPresent()`, nhãn "Đánh dấu tất cả Có mặt", "Lưu điểm danh ca học", "Gán Có mặt và lưu" thống nhất ở plan.md và phase 1–3.
- Không còn mâu thuẫn chưa giải quyết.
