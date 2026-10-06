---
title: "Popup buổi học /schedule hiện sai trạng thái điểm danh (lớp legacy không có ngày)"
description: "Popup /schedule chọn ngẫu nhiên 1 row trong 13 tuần của lớp legacy undated nên hiện 'Hoàn thành' cho buổi chưa tới. Sửa popup dùng model buổi học của tab chi tiết lớp, chặn điểm danh buổi tương lai ở UI + server, sửa backfill xếp theo trạng thái rồi gắn ngày cho dữ liệu cũ."
status: completed
priority: P1
effort: "1.5d"
branch: fix/schedule-session-modal-legacy-status
tags: [bug, frontend, backend, data]
blockedBy: []
blocks: []
created: 2026-10-05
issue: 326
---

# Popup buổi học /schedule hiện sai trạng thái điểm danh

## Triệu chứng

Popup "Lớp Test 1 — Thứ Ba, 06/10" (hôm nay 05/10) hiển thị Học viên 2 **Hoàn thành**, Học Viên 1 **Sắp tới** kèm nút Điểm danh, dù buổi 06/10 chưa diễn ra.

## Nguyên nhân (đã chứng minh trên D1 local)

Không phải hardcode — badge đọc `row.status` ([class-session-modal.tsx:214](../../apps/web/src/components/schedule/class-session-modal.tsx)). Lỗi nằm ở việc **chọn row nào**:

1. **Dữ liệu legacy undated.** Lớp `6e7622e1-…` tạo 24/08, trước khi generator gắn `date` (#98, 27/08) → 52 row đều `date = NULL`. Backfill (`apps/server/scripts/backfill-date.ts`) chưa chạy cho DB này.
2. **Popup gộp cả khoá.** `findSessionRows` nhóm undated theo `l:{classId}:{day}:{time}` → popup Thứ Ba chứa 26 row (2 HV × 13 tuần).
3. **Dedupe chọn row theo UUID.** `distinctStudentsBySid` (fix #204) giữ row có `id` nhỏ nhất mỗi HV. Mỗi HV có đúng 1 row Thứ Ba `completed` + 12 `upcoming`:
   - Học viên 2: completed `23380cf2…` < upcoming nhỏ nhất `27057486…` → hiện **Hoàn thành**.
   - Học Viên 1: upcoming `21e455b7…` < completed `a120c595…` → hiện **Sắp tới**.
   → Trạng thái hiển thị **ngẫu nhiên theo UUID**, và nút Điểm danh/Hủy/Sửa ghi vào một row tuỳ ý.
4. **Không chặn điểm danh tương lai.** Popup /schedule và cả 2 endpoint check-in (`/lessons/:id/check-in`, `/classes/:id/sessions/:date/check-in`) không kiểm tra ngày. Tab chi tiết lớp đã chặn trên UI qua `sessionIsEligibleDate`.
5. **Backfill bỏ qua trạng thái.** `buildBackfillPlan` gán ngày theo `(createdAt, seq)`. Dry-run: row completed của Học viên 2 bị gắn **2026-11-03** (tương lai), trong khi UI legacy (`sidStateAt`) luôn coi các buổi completed là prefix đầu → backfill nguyên trạng làm hỏng dữ liệu.

Tab chi tiết lớp đã có model đúng cho cả 2 đường (legacy prefix + v2 dated) ở `apps/web/src/lib/class-sessions.ts` (`buildClassSessions`, `sessionAttendanceState`, `sidStateAt`, `isSequentialHead`). Popup /schedule không tái dùng nó.

## Quyết định đã chốt (user, 2026-10-05)

1. **Chặn điểm danh buổi tương lai ở cả UI + server** (ngày buổi > hôm nay giờ VN). Hủy/Sửa buổi tương lai vẫn cho phép.
2. **Sửa backfill xếp theo trạng thái rồi chạy**: completed → cancelled → còn lại, sau đó `(createdAt, seq)`; chạy cho DB local (có backup), cập nhật runbook dry-run cho staging/prod.

## Scope Challenge

- **Tái dùng:** model `class-sessions.ts` của tab chi tiết lớp; `todayISOVietnam` (web) và `vietnamTodayISO` (server); `buildBackfillPlan` + test `skeleton-parity.test.ts`.
- **Ngoài phạm vi:** đổi cách grid nhóm legacy theo tuần (đã đúng sau backfill); sửa row legacy của lớp không conform (giữ NULL vĩnh viễn — UI legacy xử lý); chạy backfill trên staging/prod (thao tác operator, plan chỉ cung cấp lệnh + dry-run).
- **Độ phức tạp:** ~10 file, 3 phase, phase 1 và 3 độc lập; phase 2 độc lập về file. Mode: fast (đã scout + chứng minh nguyên nhân trực tiếp).

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Popup /schedule đọc trạng thái theo đúng buổi + chặn điểm danh tương lai (UI) | completed | [phase-01-schedule-modal-occurrence-state.md](phase-01-schedule-modal-occurrence-state.md) |
| 2 | Server chặn check-in buổi tương lai | completed | [phase-02-server-future-check-in-guard.md](phase-02-server-future-check-in-guard.md) |
| 3 | Backfill xếp theo trạng thái + gắn ngày dữ liệu legacy | completed | [phase-03-status-aware-backfill.md](phase-03-status-aware-backfill.md) |

Thứ tự đề xuất: 1 → 2 → 3. Phase 3 chạy SQL trên DB local chỉ sau khi phase 1 đã merge (để UI legacy + v2 đều đúng trước/sau backfill).

## Acceptance Criteria

- [ ] Popup "Lớp Test 1 — Thứ Ba, 06/10" (trước backfill, dữ liệu legacy hiện tại): cả 2 HV hiện **Sắp tới**, không có nút Điểm danh (buổi tương lai).
- [ ] Popup buổi 25/08 của cùng lớp (legacy): cả 2 HV **Hoàn thành** (prefix completed = 1).
- [ ] Legacy: chỉ HV ở *sequential head* có nút Hủy/Sửa; nút Điểm danh thêm điều kiện buổi ≤ hôm nay; nút ghi vào đúng row head (`firstUpcomingLessonId`), không phải row UUID nhỏ nhất. Lớp trộn (row undated + row có ngày): popup của entry có ngày vẫn đọc đúng bucket v2.
- [ ] Dated (v2): nút Điểm danh ẩn khi `dateISO > todayISOVietnam()`; Hủy/Sửa vẫn hiện.
- [ ] Card grid legacy hiển thị trạng thái của đúng buổi trong tuần đang xem, không phải rollup cả khoá.
- [ ] `POST /lessons/:id/check-in` và `POST /classes/:id/sessions/:date/check-in` trả **422 với `error` và `reason` đều = `"future-session"`** khi ngày buổi > hôm nay VN (row undated không có ngày → chỉ UI chặn, giới hạn đã biết); toast tiếng Việt "Chưa tới ngày học — chưa thể điểm danh."
- [ ] `buildBackfillPlan` gán ngày theo thứ tự completed → cancelled → còn lại; dry-run trên D1 local: row completed của cả 2 HV Lớp Test 1 nhận `2026-08-25`.
- [ ] D1 local đã backup + chạy backfill: `SELECT COUNT(*) FROM lesson WHERE date IS NULL` = 0 cho lớp conform; popup 06/10 vẫn đúng sau backfill.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test`, `pnpm --filter server test`, `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` xanh.

## Rủi ro

- **Prod/staging có thể đã chạy backfill cũ** (runbook #98 Step B) → row completed có thể đã bị gắn ngày sai. Giảm thiểu: phase 3 thêm hai truy vấn read-only (completed ở tương lai; completed đứng sau row chưa completed cùng enrollment+thứ) làm điều kiện chặn Step C; không tự sửa prod. Backfill chỉ gắn row `date IS NULL`.
- **Test server dùng ngày cố định 2026-08/09:** đã ở quá khứ nên qua guard; test mới dùng ngày tương đối `vietnamTodayISO() ± n` (không inject clock vào `kernelRoutes`).
- **E2E:** `class-operations.spec.ts` check-in buổi "ngày mai" sẽ vỡ → phase 1 đổi seed `startDate = today` (đã thêm vào Files); `schedule-session-modal.spec.ts` đã seed `today`.
- **Giới hạn đã biết:** row undated không có guard server (chỉ UI) cho tới khi backfill; `moveDate` đưa bucket đã chốt sang tương lai không bị chặn (ngoài phạm vi).
- **Khôi phục:** revert commit; DB local có file backup trước khi chạy SQL.

## Validation Log

### Session 1 — 2026-10-06 (chạy tự động trong pipeline vibe, không phỏng vấn thêm)

Hai quyết định của user (plan.md "Quyết định đã chốt") giữ nguyên; không có câu hỏi mới cần user quyết. Verification pass (tier Standard) đối chiếu plan với code:

- Claims checked: ~24 | Verified: 18 | Failed: 6 | Unverified: 0
- Failures (đã sửa trong phase files, không đổi quyết định user):
  - `kernel.ts:1141-1190` / `:1429` / import `:33` → thực tế `:1016-1056` / `:1303-1321` / `:35`.
  - `sidStateAt`/`isSequentialHead`/`slotStatsBySid` là private (`class-sessions.ts:356,368,552`) → helper mới đặt cùng file.
  - `kernelRoutes(deps)` (`kernel.ts:80-85`) không có clock → bỏ inject, test dùng ngày tương đối.
  - Plan nói e2e seed `startDate = today` nhưng `class-operations.spec.ts:38-39` tạo lớp "ngày mai".
  - `lesson-modal.tsx:149,182` là caller check-in thứ hai, thiếu trong Files.
  - Mapping toast chỉ nêu một hàm; thực tế có `planDirectOutcome` + `occurrenceSummary`.

### Whole-Plan Consistency Sweep
- Đã quét `plan.md` + 3 phase: không còn nhắc "clock inject / `deps.todayISO`", "không có nút thao tác" cho fallback, hay `{reason: "future-session"}` đơn lẻ; AC, Rủi ro và phase khớp nhau. Không còn mâu thuẫn.

## Red Team Review

3 reviewer (Assumption Destroyer, Failure Mode Analyst, Scope & Security Critic). Bộ lọc bằng chứng `file:line`: tất cả finding đều có citation. Tổng hợp sau khử trùng:

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | High | Lớp trộn undated + dated: `buildClassSessions` rơi legacy làm sai popup entry có ngày (`class-sessions.ts:215`) | Accept — phase 1 R2: ref có ngày dựng v2 từ bucket |
| 2 | High | 422 `{error, reason}`: `error` thắng `reason` (`repos/kernel.ts:392`) nên toast không khớp | Accept — phase 2 R4: cả hai = `future-session` |
| 3 | High | e2e `class-operations` vỡ (check-in buổi ngày mai) | Accept — phase 1 Step 6 + Files |
| 4 | High | Fallback divergent bỏ hết nút → mất đường điểm danh duy nhất | Accept — fallback row-based |
| 5 | High | Backfill không sửa row đã gắn sai; detector yếu | Accept (modified) — thêm detector (b) + chặn Step C; re-stamp prod ngoài phạm vi |
| 6 | High | Race dump→apply theo status | Accept — `AND status = <dump>` trong UPDATE |
| 7 | High | Row undated không có guard server | Accept (modified) — giữ carve-out, ghi giới hạn đã biết; suy ngày phía server là over-scope |
| 8 | High | Backfill sort lossy / completed tương lai | Accept (modified) — cảnh báo `FUTURE_COMPLETED` ở dry-run + ghi ngữ nghĩa lossy vào runbook |
| 9 | High | `lesson-modal.tsx` thiếu khỏi phạm vi | Reject — verify: component không được mount (`grep` chỉ còn contract test đọc source); server guard vẫn bao phủ |
| 10 | Medium | Hủy/Sửa legacy bị khoá khi không phải head, mâu thuẫn quyết định #1 | Accept — tách `canCancelEdit` / `canCheckIn` |
| 11 | Medium | `absent` v2 có nút nhưng server từ chối | Accept — target strict `upcoming` |
| 12 | Medium | Card legacy phantom ngoài lịch | Accept — ẩn card khi model dựng được nhưng ngoài lịch |
| 13 | Medium | Clock inject over-build | Accept — bỏ, dùng ngày tương đối |
| 14 | Medium | Guard server: thứ tự sau status check + `date <= today` trong WHERE | Accept |
| 15 | Medium | Backfill CLI không fail-fast thiếu `status` | Accept |
| 16 | Medium | Citation dòng sai | Accept — đã sửa |
| 17 | Medium | `moveDate` đưa bucket đã chốt sang tương lai | Reject — ngoài phạm vi quyết định đã chốt; ghi vào Rủi ro |
| 18 | Medium | Tạo hàm song song `occurrenceSidStates` thay vì mở rộng `sessionAttendanceState` | Reject một phần — giữ helper mới nhưng `sessionAttendanceState` phải gọi chung, test cũ xanh không sửa (đã có trong phase 1 R1) |

### Whole-Plan Consistency Sweep
- Delta list áp lên cả 4 file; đối chiếu lại AC/Rủi ro/Files/Steps: nhất quán. Không có mâu thuẫn còn lại.
