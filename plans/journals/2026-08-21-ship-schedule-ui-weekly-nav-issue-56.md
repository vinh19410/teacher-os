# Ship journal — issue #56: Schedule UI buổi học thật + nav tuần

Ngày: 2026-08-21 · Branch: `feat/56-schedule-ui-weekly-nav` · Mode: beta → develop · Plan: `plans/260821-1845-schedule-ui-real-weekly-sessions-and-nav`

## Bối cảnh

/schedule sau PR #74 là grid weekday sạch nhưng chết: mọi tuần trông giống
hệt nhau, không nav, không ngày thật. Lesson row không có cột ngày (`packages/db/src/schema/lesson.ts`
— chỉ `day` 1-7 Mon-first), nên "buổi trong tuần" phải đi theo ngữ nghĩa
weekly-recurring slot — cùng semantics dashboard đang dùng.

## What changed

- **week-grid.ts** (mới): pure lib 9 hàm — toán tuần ISO anchor UTC-midnight
  (CI-UTC safe), "hôm nay" qua `Intl` Asia/Ho_Chi_Minh (formatToParts, injectable
  clock), bound năm 1970–2099, guard expanded-year, composition `resolveWeek`
  là điểm vào duy nhất của route. 26 unit tests.
- **schedule.tsx**: tuần là URL state `?week=` (validateSearch passthrough theo
  precedent login); nav ← Tuần trước / Tuần này / Tuần sau → (Link, "Tuần này"
  disabled + keyboard-guard ở tuần hiện tại); scrub param rác bằng replace
  navigate (không loop — đã trace router-core); lead "Tuần {range} · N buổi"
  với N = distinct slot chưa hủy (1:2 = 1 slot); sub-label ngày dd/MM thật mỗi
  cột; today-highlight chỉ khi tuần đang xem chứa hôm nay.
- **lesson-modal**: prop `dateIso` → "{thứ}, {dd/MM} · {time}" theo cell;
  nút "Sửa buổi" (upcoming-only) mở form; check-in/cancel giữ nguyên act().
- **lesson-edit-form** (mới): echo đủ 5 field (API full-replace — thiếu field
  là wipe), state string DOM → `Number()` coercion → `lessonEditSchema.safeParse`
  (import từ contracts, không regex thứ hai); validation reactive (useMemo) —
  không sticky flag (review bắt được bug brick nút Lưu); role=alert.
- **lesson-modal edit flow**: qua shared `useKernelFormSubmit` — await, close
  CHỈ khi `refreshed`, failure giữ form + input (doctrine write-modal repo);
  useEffect reset editing + hook reset() chống leak state qua lesson khác
  (mirror grade-modal); toast success khi refreshed.
- **sessionsDone derive fix** (hand-off #55 mục a): distinct-(day,time)-pairs →
  max completed rows per enrollment. Weekly recurrence 12 buổi/2 slot check-in
  đủ giờ ra 12/12 (trước đây 2/12); lớp 1:2 không double-count. Pin test đỏ
  của #55 được flip xanh + case interleaved pin lower-bound + describe Wave-4
  đổi title theo semantics mới.
- **Tripwire locks** (`kernel-runtime.contract.test.ts`): cập nhật CÙNG feature
  đúng chỉ dẫn "update together" — bỏ 3 negative nav-labels, giữ negative fakes
  (GCal/dayDates/todayIdx/19–25//08), thêm positive wiring (validateSearch,
  useSearch, resolveWeek, todayISOVietnam, dateIso, formatDayMonth, lesson-edit
  name, useEffect reset, useKernelFormSubmit, "refreshed").

## The tricky bit

Ba cái bẫy lớn nhất đều bị bắt ở gate đúng chỗ:

1. **Red-team bắt claim sai về 409**: endpoint edit pre-read values trong cùng
   request, client không gửi old-values → edit-vs-edit là last-writer-wins im
   lặng, KHÔNG optimistic-concurrency 409 như plan đầu tiên viết. Sửa claim +
   ghi nhận hạn chế lên issue thay vì viết code quanh một cơ chế không tồn tại.
2. **Red-team bắt fire-and-close mất input**: form sửa theo act() ban đầu sẽ
   đóng modal trước khi POST resolve — mất toàn bộ input khi fail, trái doctrine
   "close only on refreshed". Đổi sang shared form-submit hook.
3. **Code-review bắt sticky validation brick form**: sau 1 lần validation fail,
   nút Lưu khóa vĩnh viễn vì error flag không clear theo onChange. Đổi sang
   reactive useMemo validation.

## Evidence

4 gates mirror CI xanh: `pnpm test` exit 0 (web 233/233), `pnpm check-types`
exit 0, `pnpm exec biome check .` exit 0, `pnpm build` exit 0. Grep gates
negative 0 match / positive per-file match. Chi tiết: `plans/260821-1845-schedule-ui-real-weekly-sessions-and-nav/reports/evidence-56.md`.
Manual UI walkthrough staging: BLOCKED bởi #41 (operator secrets) — automated
substitutes đã ghi; follow-up khi unblock.

## Hạn chế đã pin trên issue #56

Weekly-recurring slot semantics (lớp xong series vẫn hiện slot mọi tuần);
sessionsDone lower-bound khi 1:2 check-in lệch; edit-vs-edit last-writer-wins;
lead N = số slot.

## Next

#59 (E2E class operations) được unblock — dependence trên #56 đã giải.
Staging D1 smoke chờ #41.
