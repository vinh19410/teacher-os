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

- **Code sẽ có từ TOS-7 (đã implement trên branch `ai-handle-issue-440`, chờ merge develop — đối chiếu lại 2026-10-26):**
  - Reducer nháp `apps/web/src/lib/attendance-draft.ts` đã có sẵn action `{ type: "markAllPresent" }` trong union và case xử lý (chỉ điền ô `attendance === null`) — **nhưng chưa có test và chưa có caller UI nào**; case hiện luôn trả state mới kể cả khi không đổi dòng nào (cần sửa thành early-return cùng tham chiếu). Tên hàm thật: `missingAttendanceLessonIds()` (không có `missing()`).
  - Component `apps/web/src/components/attendance/attendance-session-row.tsx` và route `apps/web/src/routes/_auth/attendance.tsx`. Route lưu qua hàm async `handleSaveSession` + state mở ca là `expandedKeys: Set<string>` với key `sessionKey()` (`dated:${classId}` / `legacy:${classId}:${time}`) — không dùng useMutation, không có `openClassKey`.
  - `PUT /api/classes/:id/sessions/:date/attendance` lưu cả ca trong 1 transaction. Đây đã là "lưu hàng loạt" theo nghĩa của AC-003, **không cần đổi server**.
- **Code đã có trong repo:** `Modal` (`apps/web/src/components/ui/modal.tsx`), `Button`, `Kbd`.
- **Độ phức tạp:** ~6 file, chỉ frontend + e2e. Không migration, không endpoint mới.
- **Mode:** HOLD SCOPE. Plan auto mức fast + scout.

## Quyết định đã chốt (2026-10-26)

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **"Đánh dấu tất cả Có mặt" chỉ điền ô trống.** Không ghi đè lựa chọn đã có, không đụng ghi chú. Nút disabled khi `missingAttendanceLessonIds().length === 0` **hoặc ca đã `recorded`** (kể cả khi còn dòng "Chưa rõ (điểm danh cũ)" — không bulk-fill đè lịch sử, `coerceDisplayAttendance` giữ `null` là chủ ý của TOS-7) **hoặc** ngày tương lai / lớp legacy. | Đúng wireframe mục 7. Gherkin AC-003 (bấm nút rồi mới chỉnh Nam) vẫn đúng. Ca đã điểm danh khi mở lại để sửa thì nút tự tắt — đúng với mọi ca recorded, không chỉ ca đủ trạng thái. |
| D2 | **Lưu khi thiếu → hỏi xác nhận.** `Modal` "Còn N học viên chưa chọn trạng thái. Gán Có mặt cho họ và lưu?" với 2 nút "Gán Có mặt và lưu" (primary) / "Quay lại chỉnh". Huỷ thì giữ hành vi TOS-7. Xác nhận **chỉ áp dụng cho ca chưa `recorded`** (ca recorded có dòng thiếu vẫn đi đường TOS-7: viền vàng + focus). "Gán Có mặt và lưu" tính entries bằng pure helper `markAllPresentState(draft)` **trước** khi lưu (cấm pattern dispatch-then-read — `toSaveEntries` sẽ throw trên state stale), rồi mới dispatch để sync UI; cả 2 nút modal disabled khi `saving`, route chặn `onSave` khi đang lưu một ca khác. | Wireframe "Ràng buộc đầy đủ sĩ số" cho phép cả hai cách; user chọn gợi ý xác nhận. Server vẫn trả 422 nếu thiếu, nên không có đường lưu thiếu. |
| D3 | **Sau khi lưu thành công, tự mở ca pending kế tiếp** tính **từ dữ liệu sau refetch** (`queryClient.getQueryData` sau `await invalidateQueries`, kèm guard `getQueryState` không lỗi và `dataUpdatedAt > thời điểm lưu`; danh sách stale trước refetch không dùng được): quét từ index ca vừa lưu **trong `fresh.sessions` đầy đủ** (thứ tự sort server) về phía sau rồi vòng lại, chỉ nhận ca khớp chip đang lọc + `!recorded && mode !== "legacy" && key !== keyCaVừaLưu`. Key là `sessionKey()` = `${mode}:${classId}:${time}` (không chứa ngày) — nên chặn stale closure: nếu `date`/`status` đổi giữa lúc lưu (so `latestSearchRef`) thì bỏ auto-advance. **Focus vào picker trạng thái đầu tiên** của ca mới mở (không phải nút điền nhanh — tránh Enter mặc định đậu trên thao tác ghi hàng loạt; nút điền nhanh cách 1 lần Shift+Tab, giữa chúng không có focusable xen). Không tự động mở khi lưu thất bại (409/422/500). Hết ca: dùng `actionablePending = sessions.filter(s => !s.recorded && s.mode !== "legacy").length` (không dùng `counts.pending` vì số này tính cả ca legacy chỉ xem): `actionablePending === 0` → đọc "Đã điểm danh xong mọi ca trong ngày" qua vùng `aria-live="polite"` `role="status"` persistent (nếu còn legacy pending thì nối thêm ghi chú số ca lớp cũ) + focus về ô chọn ngày; còn `actionablePending > 0` nhưng không khớp chip → "Còn N ca chưa điểm danh trong ngày". Không đụng `autoExpandedForKey` của TOS-7. | Bớt 1 thao tác mở ca mỗi lớp; post-refetch tránh tái mở ca vừa lưu (red-team Critical); thông báo không nói dối khi còn ca legacy chỉ xem. |
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

- [ ] Mở một ca **chưa điểm danh**, bấm "Đánh dấu tất cả Có mặt": mọi học viên chưa chọn chuyển sang Có mặt; học viên đã chọn trước đó giữ nguyên. Nút **disabled khi ca đã `recorded`** (kể cả khi còn dòng "Chưa rõ"), khi ngày tương lai, khi lớp legacy, và khi không còn ai trống.
- [ ] Sau đó chỉnh "Trần Hoàng Nam" sang Vắng có phép rồi lưu: server lưu Nam là `excused` (`status = absent`), mọi học viên còn lại là `present` (`status = completed`). Kiểm qua reload trang.
- [ ] Lưu khi còn N học viên trống (ca chưa recorded) thì hiện hộp xác nhận ghi đúng N. "Gán Có mặt và lưu" lưu thành công (entries tính từ pure helper, không crash stale state); "Quay lại chỉnh"/Esc không gửi request và tô viền vàng dòng thiếu. Cả 2 nút modal disabled khi đang lưu; double-submit không sinh 2 PUT.
- [ ] Lưu **thành công** xong, ca pending kế tiếp tự mở (tính từ dữ liệu sau refetch, không tái mở ca vừa lưu) và **picker đầu tiên** của nó nhận focus; lưu thất bại thì không tự mở. Hết ca pending trong ngày thì có thông báo `aria-live` "Đã điểm danh xong mọi ca trong ngày" và focus về ô chọn ngày; còn pending ngoài danh sách lọc thì thông báo "Còn N ca chưa điểm danh trong ngày". Chip `pending` khi `counts.pending === 0` hiển thị empty-state riêng, không dùng dòng "Không có ca học nào trong ngày này."
- [ ] Responsive `<lg`: nút điền nhanh và nút lưu xếp chồng full-width, ô bấm ≥ 44px; không tràn ở 375px.
- [ ] E2E: 5 lớp có ca hôm nay, điểm danh lần lượt bằng điền nhanh + chỉnh 1 người + lưu, tổng thời gian ≤ 120 giây (NFR-008 — assert tổng 1 lần, làm proxy; NFR-001 là p95 tải/lọc ở quy mô 50 lớp/1000 HV, ngoài scope e2e này); mỗi lần lưu chỉ assert chức năng (toast/aria-live xuất hiện), không assert wall-clock từng bước.
- [ ] `pnpm check`, `pnpm check-types`, test web và e2e liên quan đều xanh.

## Rủi ro

- **Phụ thuộc TOS-7 chưa merge develop.** Code thật đã đối chiếu trên branch `ai-handle-issue-440` (2026-10-26); bắt đầu implement từ head của branch đó, rebase `--onto origin/develop` sau khi TOS-7 merge. Nếu review TOS-7 xoá case `markAllPresent` (đang không có caller/test), TOS-8 tái thêm trong commit Phase 1 của mình.
- **Bấm nhầm "Gán Có mặt và lưu"** làm học viên vắng bị ghi Có mặt và trừ buổi. Giảm rủi ro: hộp xác nhận ghi rõ số người, nút huỷ là lựa chọn mặc định khi nhấn Esc; ca vẫn sửa lại được (TOS-7 D5).
- **Tự mở ca kế tiếp gây nhảy cuộn** trên 375px. Dùng `scrollIntoView({ block: "nearest" })` và chỉ cuộn khi ca nằm ngoài khung nhìn.
- [Đã xử lý 2026-10-26] ~~Lọc chip `status=pending`: tìm "ca kế tiếp" dựa trên danh sách trước refetch~~ → tính từ dữ liệu **sau** refetch (`getQueryData`), loại key ca vừa lưu; danh sách stale không còn dùng.

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

## Red Team Review

### Session — 2026-10-26 (pipeline `ak-vibe --ship --beta --advice`, issue #441)

3 reviewer song song (Security Adversary / Assumption Destroyer / Failure Mode Analyst, tier Standard: Fact Checker + Contract Verifier), đối chiếu plan với code thật TOS-7 tại worktree `ai-handle-issue-440` (head `55585e96`). 24 findings thô → sau dedupe còn 14 cụm; **12 accepted (2 ở biến thể/thu hẹp phạm vi), 2 rejected**.

| # | Cụm finding (nguồn) | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | Phase 1 tiền đề lỗi thời: `markAllPresent` đã ship trong TOS-7, luôn trả state mới, 0 test; `missing()` không tồn tại (SEC-7, ASM-1, FAIL-5) | High | Accept | plan.md Scope Challenge, phase-01 |
| 2 | Confirm modal dispatch-then-read → `toSaveEntries` throw trên state stale (SEC-1, ASM-4, FAIL-2) | High | Accept — thêm pure helper `markAllPresentState()` | plan.md D2, phase-01, phase-02 |
| 3 | Wrap-around pre-refetch tái mở ca vừa lưu, thông báo hoàn tất không bao giờ hiện (FAIL-1 Critical, ASM-2) | Critical | Accept — tính ca kế tiếp từ dữ liệu sau refetch, loại key vừa lưu | plan.md D3 + Rủi ro, phase-02 |
| 4 | Neo tích hợp sai: không có `onSuccess` mutation, `openClassKey` trái `sessionKey`/`expandedKeys` (ASM-3, FAIL-6) | High | Accept — tái dụng `sessionKey`/`expandedKeys`/`handleSaveSession` | phase-02 |
| 5 | Bulk-fill đè lịch sử trên ca recorded còn dòng "Chưa rõ" (SEC-3, FAIL-4) | High | Accept — nút disable khi `recorded`; confirm modal chỉ cho ca chưa recorded | plan.md D1/D2, phase-02, phase-03 |
| 6 | Modal bypass guard `saving` → double PUT + double auto-advance (FAIL-3) | High | Accept — disable nút khi `saving`, route chặn re-entry | plan.md D2, phase-02 |
| 7 | `autoFocusBulk` mặc định focus nút ghi hàng loạt (SEC-4) | Medium | Accept (biến thể) — focus **picker đầu tiên** | plan.md D3, phase-02, phase-03 |
| 8 | aria-live "xong mọi ca" sai trên chip completed và khi còn legacy (SEC-5, FAIL-7, ASM-8) | Medium | Accept — message theo `counts.pending`, empty-state riêng cho pending | plan.md D3 + AC, phase-02 |
| 9 | Responsive 375px + touch target ≥44px không có phase nào implement (ASM-5) | High | Accept — thêm task vào phase-02 | phase-02, phase-03 |
| 10 | E2E NFR: assert per-save ≤2s là overclaim NFR-001, Enter đầu không có focus anchor, `TODAY` module-scope qua nửa đêm (ASM-6, ASM-7, FAIL-9) | Medium | Accept — assert chức năng + tổng ≤120s một lần; `toBeFocused`; `TODAY` tính trong test | plan.md AC, phase-03 |
| 11 | Focus rơi về `body` khi hết ca (FAIL-8) | Medium | Accept — anchor ô chọn ngày, aria-live persistent | plan.md D3, phase-02 |
| 12 | 409 refetch xoá nháp im lặng, không có AC error-path (SEC-6) | Medium | Accept (thu hẹp) — thêm quy tắc "không auto-advance khi lưu thất bại" + test; việc cải thiện giữ nháp 409 thuộc TOS-7 | phase-02 |
| 13 | Bulk-then-save không qua confirmation nào (SEC-2) | High | **Reject** — trái quyết định D1/D2 đã chốt với user (2026-10-26) và mục tiêu NFR-008; rủi ro giảm bằng #7 (focus picker) + ca vẫn sửa lại được sau lưu (TOS-7 D5) | — |
| 14 | Rework giữ nguyên nháp khi 409 (SEC-6) | Medium | **Reject** — hành vi re-sync là thiết kế TOS-7; đổi ở đây là scope creep xuyên issue | — |

Server-side PUT (scope check, org, incomplete-roster, roster-count guard, note cap) đã được reviewer xác nhận tốt sẵn — không đổi contract (D4 giữ nguyên).

### Whole-Plan Consistency Sweep (sau red-team)

- `missing()` → `missingAttendanceLessonIds()` thay ở D1; phase-01 đổi khung "thêm action" → "pin test + sửa case early-return + helper `markAllPresentState`".
- D1/D2/D3 đã đồng bộ điều kiện recorded, cơ chế post-refetch, focus picker, guard saving ở plan.md, phase-02 và phase-03; AC mục 1/3/4 khớp D1/D2/D3.
- Không còn mâu thuẫn chưa giải quyết.
