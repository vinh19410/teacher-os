# reverse-sources.md — Nguồn truy vết (feature `schedule`)

Repo: `/root/projects/teacher-os`, branch `develop`, HEAD `d6c0f6b5`. Mọi cite theo working tree hiện tại.

| ID | File (repo-relative) | Vai trò trong chứng cứ | Ghi chú |
|----|----------------------|------------------------|---------|
| S1 | `apps/web/src/routes/_auth/schedule.tsx` | Route shell `/schedule`: validateSearch, scrub URL, cụm nút, 3 view, trạng thái rỗng, gắn 3 hộp thoại | 259 dòng |
| S2 | `apps/web/src/lib/schedule-view.ts` | View-model URL: `?view=&date=`, legacy `?week=`, `shiftAnchor` | 83 dòng |
| S3 | `apps/web/src/lib/week-grid.ts` | Toán ngày UTC, giờ VN, biên 1970–2099, nhãn tuần/tháng/ngày | 210 dòng |
| S4 | `apps/web/src/lib/schedule-week.ts` | View-model tuần: cột, ca dự kiến, đếm slot | 395 dòng |
| S5 | `apps/web/src/lib/schedule-month.ts` | View-model tháng: 42 ô, cap 3 mục, overflow, index holiday | 276 dòng |
| S6 | `apps/web/src/lib/schedule-day.ts` | View-model ngày: agenda 3 loại mục | 169 dòng |
| S7 | `apps/web/src/components/schedule/schedule-month-view.tsx` | UI view Tháng | 174 dòng |
| S8 | `apps/web/src/components/schedule/schedule-week-view.tsx` | UI view Tuần (+ hộp thoại hoàn tác kỳ nghỉ) | 274 dòng |
| S9 | `apps/web/src/components/schedule/schedule-day-view.tsx` | UI view Ngày | 149 dòng |
| S10 | `apps/web/src/components/schedule/org-event-modal.tsx` | Hộp thoại tạo sự kiện; thông báo lỗi tiếng Việt theo path schema | 231 dòng |
| S11 | `apps/web/src/components/schedule/org-event-chip.tsx` | Chip sự kiện 3 view + chi tiết + xóa 2 bước | 159 dòng |
| S12 | `apps/web/src/lib/repos/events.ts` | Client repo POST/DELETE + vá cache `['kernel']` tại chỗ (D6) | 121 dòng |
| S13 | `apps/web/src/lib/class-color.ts` | Hash FNV-1a id lớp → 8 slot màu | 22 dòng |
| S14 | `apps/server/src/routes/events.ts` | Server route POST /api/events, DELETE /api/events/:id | 81 dòng |
| S15 | `apps/server/src/routes/kernel.ts` | Mount router sự kiện dưới kernel tree (dòng 3513–3514; import 129) | — |
| S16 | `apps/server/src/routes/snapshot.ts` | `loadEvents` + gắn `events` vào snapshot kernel | — |
| S17 | `apps/server/src/app.ts` | `kernelCtx` (orgId/userId/role) từ phiên + bootstrap org mặc định | — |
| S18 | `packages/db/src/schema/org-event.ts` | Bảng `org_event` + chú thích TOS-14/#447 | 27 dòng |
| S19 | `packages/db/src/migrations/0046_faithful_punisher.sql` | Migration tạo `org_event` + index `org_event_org_date_idx` | 14 dòng |
| S20 | `packages/api/src/event-contracts.ts` | `orgEventDraftSchema`, `KernelEventRow`, hằng 2/100/500 | 46 dòng |
| S21 | `packages/api/src/contracts.ts` | `KernelSnapshot.events` tùy chọn (1934–1937); hằng + mã lỗi kỳ nghỉ 3620–3645 (điểm chạm) | — |
| S22 | `apps/web/src/lib/repos/kernel.ts` | Mapping `KernelSlice.events`, danh sách mảng tùy chọn chịu deploy skew | — |
| S23 | `apps/server/src/routes/events.test.ts` | Test API: 8 test active (5 POST + 3 DELETE) | — |
| S24 | `packages/api/src/event-contracts.test.ts` | Test schema: 7 test active | — |
| S25 | `apps/web/src/routes/_auth/schedule.test.tsx` | Test route/UI: 19 test active (5 test nhóm TOS-14 dòng 604–741) | 741 dòng |
| S26 | `apps/web/src/components/schedule/org-event-modal.test.tsx` | Test hộp thoại sự kiện: 2 test active | 118 dòng |
| S27 | `apps/web/src/lib/schedule-month.test.ts` (13), `schedule-week.test.ts` (27), `schedule-day.test.ts` (11), `schedule-view.test.ts` (11) | Test view-model thuần (62 test active) | — |
| S28 | `apps/e2e/specs/schedule-views-and-events.spec.ts` | E2E AC-004: đổi view ≤2s, màu lớp, tạo sự kiện ≤2s, 3 viewport; + 2 test kỳ nghỉ (#453, điểm chạm) | 269 dòng |
| S29 | `apps/web/src/components/schedule/holiday-modal.tsx` (+ `holiday-calendar-card.tsx`, `holiday-undo-dialog.tsx`, `apps/web/src/lib/repos/holidays.ts`) | Điểm chạm feature holidays trên lịch | — |
| S30 | `apps/web/src/components/schedule/class-session-modal.tsx` (+ `apps/e2e/specs/schedule-session-modal.spec.ts`) | Điểm chạm feature classes: hộp thoại ca học mở từ lịch | — |
| S31 | `apps/web/src/routes/_auth/route.tsx`, `apps/web/src/components/layout/sidebar.tsx`, `apps/web/src/routes/_auth/dashboard.tsx` | Điểm vào: guard đăng nhập, điều hướng sidebar, link Dashboard | — |
| S32 | `plans/261026-2018-tos-14-schedule-views-and-events/plan.md` | Ý định thiết kế D1–D7, non-goals, AC — **tham chiếu thiết kế, không phải proof code** (plans là bản ghi trạng thái) | — |
| S33 | `docs/project-overview-pdr.md` | Doc chính hiện có — dùng cho Mục 0.3 (không có mục Lịch dạy) | 50 dòng |

**Âm bản (negative search) đã chạy** — chi tiết lệnh + kết quả ở `_evidence.md` §7: không có `PUT/PATCH` sự kiện; không có `GET /api/events`; không tham chiếu `orgEvent` trong `apps/student/src`/`apps/admin/src`; không có consumer `data.events` ngoài nhóm file lịch; không có `.skip/.only/.todo` trong các test nêu trên.
