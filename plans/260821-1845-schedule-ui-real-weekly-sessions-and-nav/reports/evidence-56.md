# Evidence — issue #56: Schedule UI buổi học thật + nav tuần (DOD M1)

Base: develop @ ea8301f (sau merge PR #74). Branch: `feat/56-schedule-ui-weekly-nav`.
Ngày: 2026-08-21 (giờ VN).

## 1. Bốn gate mirror CI (`.github/workflows/ci.yml:31-35`)

| Gate | Command | Kết quả |
|------|---------|---------|
| Biome (read-only) | `pnpm exec biome check .` (scope `apps/web/src`) | **exit 0** |
| Test toàn repo | `pnpm test` (turbo test tất cả packages + `test:ci-workflow` + `test:topology-drift`) | **exit 0** — web 21 files / **232 tests passed**, fail 0 |
| Type-check | `pnpm check-types` | **exit 0** — 5/5 tasks |
| Build | `pnpm build` | **exit 0** |

## 2. Grep gates (scoped per-file — red-team #11/#12)

**NEGATIVE (0 match):**
- `grep -n "dayDates\|todayIdx\|GCal\|19–25"` trên `schedule.tsx`, `lesson-modal.tsx`, `lesson-edit-form.tsx`, `mock-data.ts` → **0 kết quả** (exit 1)
- `grep -n "/08"` trên `lesson-modal.tsx`, `lesson-edit-form.tsx` → **0 kết quả** (chống fake-date concat)

**POSITIVE (per-file, match đủ):**
- `schedule.tsx`: `week-grid` import ✓; `validateSearch` + `useSearch` + `resolveWeek` + `formatWeekRange` ✓ (8 match)
- `lesson-modal.tsx`: `dateIso` + `formatDayMonth` ✓ (5 match)
- `lesson-edit-form.tsx`: `lessonEditSchema` + `Number(` ✓ (6 match)

## 3. Mapping DOD M1 (`docs/project-roadmap.md:41-45`)

| DOD item | Evidence |
|----------|----------|
| Dòng 41: "tạo lớp có lịch → sinh buổi tương ứng, hiển thị đúng trên /schedule, nav tuần hoạt động" | Sinh buổi: generator #55 đã merge (PR #71, server tests `kernel.test.ts:1672-1739`). Hiển thị + nav: phase 2 — tuần là URL state `?week=<iso>` qua `validateSearch` (reload giữ đúng tuần by construction — `resolveWeek` unit tests pin param hợp lệ/rác/undefined + clock VN vắt midnight); sub-label ngày thật + today-highlight chỉ khi tuần chứa hôm nay (`week-grid.test.ts` 25 test); tripwire locks mới `kernel-runtime.contract.test.ts` (positive wiring `useSearch`/`resolveWeek` + negative fakes). **Manual UI walkthrough trên staging: pending blocker #41** (operator secrets/alchemy — PM report 2026-08-21 18:34) |
| Dòng 42: "Sửa/hủy buổi không làm hỏng buổi khác; check-in đúng trạng thái sau hard reload" | API "không làm hỏng buổi khác": full-replace WHERE-guard đã test server-side (#55/PR #71). UI sửa buổi: phase 4 — form echo đủ 5 field (mapping test `kernelCommand("lesson-edit")` body đủ 5 key), close chỉ khi `refreshed` (doctrine write-modal), state reset anti-leak. Check-in sau reload: status persist server-side qua snapshot `['kernel']` — UI đọc `lesson.status` trực tiếp (opacity/line-through/badge), không còn nguồn nào khác. **Edit-vs-edit 2 tab là last-writer-wins (server pre-read trong cùng request) — đã ghi nhận hạn chế** |
| Dòng 45: "0 CTA no-op trong luồng classes/schedule" | Mọi CTA trên /schedule có handler thật: nav 3 nút (Link đổi URL), block buổi (mở modal), Sửa buổi (form submit), Hủy buổi/Điểm danh (direct action). Grep NEGATIVE 0 match + contract locks |

## 4. Manual verify checklist (6 mục — phase 5 plan)

**TRẠNG THÁI: BLOCKED bởi môi trường** — `apps/server/.env` không tồn tại trên máy này (operator
secrets, issue #41; staging alchemy chưa unblock). PM report đã ghi: "Staging deploy secrets /
alchemy stage — không chặn code #56". Không stack local → không walkthrough UI được.

Thay thế bằng automated evidence (đủ bao phủ logic, thiếu xác thực visual):
- Nav ±1 tuần / reload giữ tuần: `resolveWeek` + `startOfWeekMonday`/`addWeeks` unit tests (25);
  URL state qua `validateSearch` (contract lock pin hop đọc `useSearch` + hop ghi `validateSearch`).
- Param rác fallback + URL dọn sạch: `parseWeekParam` tests (bound 1970–2099, roundtrip) + effect
  replace-trong `schedule.tsx` (locked bằng positive assertion `resolveWeek`).
- Today-highlight chỉ tuần hiện tại: `resolveWeek(...).isCurrentWeek` tests (clock VN vắt midnight).
- Sửa buổi đổi cột/giờ: mapping test body đủ 5 field + grid filter theo `l.day` (existing) — sau
  refetch lesson tự chuyển cột.
- Check-in + F5 giữ trạng thái: status từ server snapshot (không state cục bộ) — kiến trúc đảm
  bảo; opacity/badge logic không đổi từ #74.
- Buổi không-upcoming không có nút sửa: render condition `lesson.status === "upcoming"` (modal)
  + server guard 409 (defense in depth, #55).

**Follow-up khi #41 unblock:** walkthrough 6 mục trên staging, bổ sung comment vào issue #56.

## 5. Files changed (scoped đúng plan)

Modify (8): `schedule.tsx`, `lesson-modal.tsx`, `data-actions.ts` (+1 variant union),
`repos/kernel.ts` (+1 case), `repos/classes.ts` (derive fix), `repos/classes.test.ts` (flip pin +
Wave-4 title), `repos/kernel.test.ts` (+1 mapping test), `kernel-runtime.contract.test.ts` (lock update).
Create (3): `week-grid.ts`, `week-grid.test.ts`, `lesson-edit-form.tsx`.
KHÔNG đụng: `apps/server`, `packages/api`, `packages/db` (git diff scoped apps/web).
KHÔNG thêm: npm dependency, query key/fetch mới.

## 6. Semantics pinned cho owner (đã comment issue #56 — 2026-08-21)

1. Weekly-recurring slot: lesson không cột ngày → slot lặp theo weekday; status là status series.
2. sessionsDone = max-per-enrollment (lower-bound khi 1:2 check-in lệch — test interleaved pin).
3. Edit-vs-edit last-writer-wins (409 chỉ status-race).
4. Lead "N buổi" = số slot distinct chưa hủy.
