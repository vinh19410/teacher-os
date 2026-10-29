---
phase: 3
title: "Harness: guard non-mutating + appSteps mở modal + verify end-to-end (1 run duy nhất)"
goal: "capture.mjs đo lường zero-POST cho màn non-mutating; t-attendance appSteps click modal qua data-testid; MỘT lần chạy harness regenerate toàn bộ composite chịu ảnh hưởng; verdict ghim ghi chú mới."
---

# Phase 03 — Harness: guard + appSteps + verify end-to-end

> Red-team note (VN ≥ UTC): index 3 luôn là buổi đã tới ngày vì `daysFromToday` dùng ngày
> UTC (design-seed.ts:225-226) còn app dùng `todayISOVietnam()` = UTC+7
> (apps/web/src/lib/week-grid.ts:23-34) — VN-today ≥ UTC-today mọi thời điểm, nên
> `dateArrived` của buổi 0d luôn true. KHÔNG "sửa" `daysFromToday` sang ngày VN: sẽ đổi
> semantics seed so với các cặp ảnh khác.

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

## Files to Create or Modify

- `scripts/design-compare/screens.json` (modify) — `t-attendance.appSteps` + `nonMutating: true`.
- `scripts/design-compare/capture.mjs` (modify) — guard đo POST `/check-in` cho màn
  `nonMutating` + unlink `errors.log` khi run sạch (red-team: file stale gây FAIL ảo).
- `scripts/design-compare/.state/**` + `plans/261020-1446-378-redesign-design-v2/screenshots/**`
  (artifact, regenerate).
- `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md` (modify) — 6 dòng
  `t-attendance` + các màn regenerate nếu cần ghi chú.

## Tasks & Steps

### Task 3.0 — Guard non-mutating trong capture.mjs
- Goal: màn khai báo `nonMutating: true` bị FAIL ngay nếu có POST `*/check-in` trong lúc
  chụp (kể cả POST vô ý) — ràng buộc cốt lõi của issue được đo bằng máy, không tự tin.
- Target files: `scripts/design-compare/capture.mjs` (vòng app capture, quanh `runSteps`
  tại :489-498; nhánh ghi `errors.log` tại :665-667).
- Steps:
  1. Trong vòng `for (const sc of screens)` phía app, khi `sc.nonMutating` truthy: gắn
     listener `page.on("request")` đếm POST có URL chứa `/check-in` TRƯỚC `runSteps`,
     tháo listener trong `finally`.
  2. Sau `runSteps`, nếu đếm > 0 → `throw` với message
     `non-mutating screen bị POST /check-in ×N` — rơi vào catch hiện có → ghi failure +
     debug screenshot, exit code 1.
  3. Ở cuối run: khi `failures.length === 0`, unlink `.state/errors.log` nếu tồn tại
     (file stale của run fail trước không được FAIL run sạch sau này).
- Success criteria: harness không đổi hành vi với các màn không khai báo `nonMutating`.
- Verify: `pnpm check` exit 0 (file nằm trong lint scope) — verify runtime là Task 3.2.

### Task 3.1 — appSteps + flag nonMutating cho t-attendance
- Goal: app mở modal điểm danh buổi hôm nay (index 3) trước khi chụp; screen được bảo vệ
  bởi guard Task 3.0.
- Target files: `scripts/design-compare/screens.json` (entry `t-attendance`, dòng ~75).
- Steps:
  1. Thay `"appSteps": []` bằng
     `"appSteps": [{ "clickFirst": "[data-testid='session-attendance-open-3']" }, { "wait": 400 }]`.
     (`clickFirst` = `.first()` + force-click; `wait: 400` chờ modal render sau click trên
     chunk lạnh phone/tablet — red-team finding race; index 3 = buổi `daysFromToday(0)`,
     ổn định theo bất đẳng thức VN ≥ UTC nêu đầu phase.)
  2. Thêm `"nonMutating": true` vào entry `t-attendance`.
- Success criteria: JSON parse OK.
- Verify: `node -e "const c=JSON.parse(require('fs').readFileSync('scripts/design-compare/screens.json','utf8')); const t=c.screens.find(s=>s.id==='t-attendance'); if(!t.nonMutating||t.appSteps.length!==2) process.exit(1); console.log('ok')"`,
  kỳ vọng in `ok`, exit 0.

### Task 3.2 — MỘT lần chạy harness cho toàn bộ màn chịu ảnh hưởng
- Goal: 1 boot + 1 seed duy nhất; mọi composite chịu ảnh hưởng dữ liệu được chụp lại và
  ghép từ CÙNG seed run.
- Steps:
  1. Lưu bằng chứng pre-fix trước khi xoá:
     `mkdir -p scripts/design-compare/.state/debug/t-attendance-prefix && cp scripts/design-compare/.state/raw/new/t-attendance/*.png scripts/design-compare/.state/debug/t-attendance-prefix/`
     (6 PNG repro pre-fix; .state git-ignored).
  2. Xoá cache của TẤT TẢ màn chạy lại (harness skip theo `existsSync` ở cả raw :456 lẫn
     composite :608) — raw `new` + raw `design` + composite + `errors.log`:
     `rm -rf scripts/design-compare/.state/raw/new/t-attendance scripts/design-compare/.state/raw/design/t-attendance scripts/design-compare/.state/raw/new/t-dashboard scripts/design-compare/.state/raw/design/t-dashboard …` (lặp cho từng id trong danh sách dưới) và
     `rm -f plans/261020-1446-378-redesign-design-v2/screenshots/<id>/*.png` cho từng id +
     `rm -f scripts/design-compare/.state/errors.log`.
     Danh sách id (từ Side-effect scan phase 02):
     `t-attendance,t-dashboard,t-class-detail,t-students,t-student-detail,t-schedule,t-reports,s-dashboard,s-classes,s-class-detail`.
  3. Chạy MỘT lệnh duy nhất:
     `node scripts/design-compare/capture.mjs --side both --screens <danh-sách-10-màn>`.
     KHÔNG chạy chuỗi `--side app` rồi `--side both`: mỗi lần chạy đều boot:api (xoá
     local.db) + re-seed → composite ghép từ 2 seed run khác nhau (red-team finding).
- Success criteria: exit 0; log `0 lỗi`; composite `t-attendance` mới có cột App hiển thị
  modal (overlay + tiêu đề `Điểm danh — …` + 2 hàng roster + nút `Điểm danh` từng học
  viên + footer `Đóng`); run không có failure `non-mutating screen bị POST`.
- Verify: lệnh ở step 3 exit 0 **và**
  `ls plans/261020-1446-378-redesign-design-v2/screenshots/t-attendance/*.png | wc -l` in `6`
  **và** `test ! -f scripts/design-compare/.state/errors.log` exit 0
  **và** ảnh composite đọc được hiển thị modal (bằng chứng gắn PR).

### Task 3.3 — Rà mắt composite + cập nhật verdict
- Goal: verdict phản ánh đúng trạng thái mới, ghim nội dung mới chứ không ghim PASS cũ.
- Target files: `plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md`.
- Steps:
  1. Xem từng composite mới của 10 màn: không cặp nào vỡ cấu trúc. Chênh lệch số liệu đã
     tồn tại từ trước (vd "2 học viên" app vs "8 Students" design) không phải regression
     cấu trúc — ghi chú nếu mới phát sinh.
  2. Sửa 6 dòng `t-attendance` thành PASS với ghi chú:
     `#403: app mở modal điểm danh qua data-testid (non-mutating, guard zero-POST); seed roster nhóm 2 HV`.
     Ghi chú PHẢI chứa chuỗi `#403` (cờ để verify phân biệt dòng mới/cũ).
  3. Nếu có màn khác cần đổi ghi chú sau rà mắt → sửa, giữ format bảng.
- Success criteria: 6 dòng t-attendance mang `#403`; không còn ghi chú cũ
  `Modal restyle v2; giữ model check-in` ở các dòng đó.
- Verify:
  `grep -c 't-attendance.*#403' plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md` in `6`
  **và** `grep 't-attendance' plans/261020-1446-378-redesign-design-v2/screenshots/verdict.md | grep -c 'Modal restyle v2'` in `0`.

## Verification matrix (tổng phase)

| Bước | Lệnh | Kỳ vọng |
|---|---|---|
| Lint | `pnpm check` | exit 0 |
| JSON | node one-liner Task 3.1 | `ok`, exit 0 |
| Harness | `capture.mjs --side both --screens <10 màn>` | exit 0, `0 lỗi`, không failure non-mutating |
| Composite | `ls …/t-attendance/*.png \| wc -l` | `6` |
| Sạch | `test ! -f .state/errors.log` | exit 0 |
| Verdict | `grep -c 't-attendance.*#403' …` / `grep … \| grep -c 'Modal restyle v2'` | `6` / `0` |
