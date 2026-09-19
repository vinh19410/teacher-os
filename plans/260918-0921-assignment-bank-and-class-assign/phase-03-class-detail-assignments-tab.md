---
phase: 3
title: "Tab Bài tập trên trang chi tiết lớp"
status: complete
priority: P1
effort: "6h"
dependencies: ["phase 1", "phase 2"]
---

# Phase 3: Tab "Bài tập" trên trang chi tiết lớp (giao bài)

## Goal

Thêm tab **Bài tập** vào `/classes/$classId` với 3 view `list → assign → success` đúng design v2 (`class-detail-assign-2.html`): danh sách bài đã giao dạng thẻ với rollup + trạng thái nộp per học viên (derived), form giao bài (chọn đề ready từ ngân hàng, hạn nộp ≥ hôm nay, lời nhắn, chọn học viên, preview, sticky action bar), success state. Submit qua command bus `"assign-class-prompt"` (phase 1).

## Context Links

- Design chuẩn v2: `class-detail-assign-2.html` — phân tích mục 2 + bảng so sánh v1/v2 mục 4 của [../research/design-analysis-report.md](../research/design-analysis-report.md); copy chuẩn mục 6.
- Trang đích: `apps/web/src/routes/_auth/classes/$classId.tsx` (tabs dòng 170-178 `roster`/`sessions`/`notes`; hero dòng 130-155; `AddStudentModal` dòng 279-284).
- Submit pattern: `useKernelFormSubmit` (`apps/web/src/lib/use-kernel-form-submit.ts:18-92`) + `KernelSubmitNotice` — precedent trang `apps/web/src/routes/_auth/assignments/new.tsx:104-145`.
- Preview: `apps/web/src/components/assignments/student-preview-paper.tsx`; tag màu: `Tag` + biến thể ok/warn/danger (xem `statusBadge` `assignments/index.tsx:24-28` precedent Badge).

## Key Insights

- **View mặc định = `list`** (v2; v1 mở thẳng assign — bị thay). Nút hero `Giao bài tập` (primary, thêm cạnh `+ Thêm học viên`) chuyển tab + view `assign`, và **ẩn khi `tab === "assignments" && view !== "list"`** (v2 setView + red-team F12: không ẩn khi đứng tab khác).
- **Cơ chế reset view state** (red-team F12): render `<ClassAssignmentsTab key={classId}>` (đổi lớp → remount sạch state, theo pattern `AddStudentModal` key `$classId.tsx:280`) + wrap `setTab` để reset `assignmentsView` về `list` khi rời tab `assignments` (tab state là `useState` tại `$classId.tsx:108`, route component không remount khi đổi classId).
- **Rollup cấp bài giao**: nộp đủ → `Đã nộp hết` (xanh); chưa đủ && `due < hôm nay` → `Quá hạn` (đỏ); còn lại → `Đang mở` (trung tính); **guard `targets.length === 0` → `Đang mở`** (red-team F2 — batch phase 1 đảm bảo không xảy ra, phòng thủ hiển thị).
- **Trạng thái per học viên**: `submittedAt != null && date(submittedAt) > due` → `Đã nộp · trễ hạn` (vàng) + timestamp `dd/mm/yyyy · HH:mm`; `submittedAt != null` → `Đã nộp` (xanh) + timestamp; `submittedAt == null && due < hôm nay` → `Chưa nộp · quá hạn` (đỏ); còn lại → `Chưa nộp`. Kèm meta `Chưa có bài nộp` khi chưa nộp. Toàn bộ derived — so chuỗi ISO `yyyy-mm-dd`; "hôm nay" lấy theo **ngày VN (UTC+7)** qua helper dùng chung của phase 1 (red-team F6 — không dùng browser local, tránh 2 thiết bị khác TZ thấy 2 trạng thái khác nhau).
- **Summary trong tab**: header `{done}/{total} đã nộp` (dồn mọi item) hoặc `Chưa giao bài` khi trống.
- **2 stat động mới trên header lớp** (red-team F5 — KD6 plan): thêm 2 StatCard `bài đang mở` (số item chưa nộp đủ) + `đã nộp trên bài mở` (`{done}/{total}`) vào hàng StatCard hiện có → 6 card, grid tự xuống hàng (lệch layout 4-ô của design — recorded deviation); 4 stat cũ (buổi đã học/tiến độ/bài trong syllabus) giữ nguyên.
- **Primitive tag màu** (red-team F4): `Tag` hiện không có tone (`apps/web/src/components/ui/tag.tsx:1-7`) — tạo `StatusTag` (extend `ui/tag.tsx` nhận prop `tone: "ok"|"warn"|"danger"|neutral` hoặc component riêng trong `components/assignments/`), dùng chung cho rollup + student status + tag `Sẵn sàng`; `Badge` (nền đặc) không đúng visual `.tag.ok/.warn/.danger` của design.
- **Picker**: chỉ hiện `status === "ready"`; chips `Tất cả`/`Task 2`/`Task 1`; tag `Đã giao lớp này` khi tồn tại `classAssignments` của (classId, promptId); help `Bản nháp không hiện ở đây. Sửa trong ngân hàng rồi mới giao.`; link ghost `Thêm đề mới` → `/assignments/new`; prompt card là button `aria-pressed` (red-team F14, không dùng role radio của mock).
- **Warn reassign** (đề đã giao lớp này): `Đề này đã giao lớp này, hạn {dd/mm/yyyy}. Giao lại sẽ thêm lượt mới cho học viên đã chọn.`
- **Form phải**: due = `<input type="date">` required, `min` = hôm nay theo **ngày VN** (helper phase 1), mặc định +7 ngày; note textarea optional placeholder `Ví dụ: nộp trước buổi T5, lập dàn ý 4 đoạn.`; học viên = checkbox list (avatar + tên + band) **mặc định chọn hết** + nút toggle `Bỏ chọn tất cả` ⇄ `Chọn tất cả`; client guard số học viên chọn ≤ 100 (red-team F11).
- **Action bar sticky đáy** 4 trạng thái copy theo ưu tiên: `Chưa chọn đề` / `Chưa chọn học viên` / `Thiếu hạn nộp` / `Giao cho {N} học viên` (mỗi cái 1 dòng phụ); nút `Hủy` + `Giao bài tập` disabled (opacity) tới khi hợp lệ. Dùng `KernelSubmitNotice` cho trạng thái submit (precedent new.tsx:220-232).
- **Preview trong form**: title đề + spec `Academic · {words} từ · {minutes} phút · hạn {dd/mm/yyyy}` + body + tags (genre · Band · source · `Có lời nhắn` khi note có nội dung) — extend `StudentPreviewPaper` props (phase 2 đã mở).
- **Submit + verify** (red-team F3): `submit.run({ type: "assign-class-prompt", ... })`; `result?.kind === "refreshed"` → **kiểm tra snapshot refresh có chứa assignment khớp `(classId, promptId, due)`** rồi mới sang success — không khớp thì hiện notice `Chưa xác nhận được lượt giao — kiểm tra danh sách bài đã giao.` (đọc snapshot mới qua data/queryClient sau khi run resolve; reconcile path cũng verify tương tự trước khi vào success — khác precedent new.tsx vốn tin reconcile mù).
- **Success**: lead `“{title}” đã giao cho lớp {tên lớp}. Học viên thấy đề và hạn nộp. Chưa có bài nộp.`; saved-meta `Lớp`/`Đề`/`Hạn nộp`/`Đã nộp 0/{N}`; recipient list (avatar + tên + tag `Chưa nộp`); nút `Giao đề khác` (reset form, chọn hết, due +7, xóa note, về view assign) + `Xem bài đã giao` (view list).
- Field errors: `Chọn một đề sẵn sàng trước khi giao.` / `Chọn hạn nộp từ hôm nay trở đi.` / `Chọn ít nhất một học viên.`
- Search topnav lọc picker của mock **không làm** (gắn topnav toàn cục — recorded deviation KD8; picker chỉ cần chips vì số đề ready ít). Empty-filter picker copy: theo design (`Không có đề Task 1 sẵn sàng…` là ví dụ cứng — hiện thực: `Không có đề {Task} sẵn sàng.` + dòng phụ nếu org có draft khớp filter thì gợi ý ngân hàng).

## Requirements

- Tab mới id `assignments`, label `Bài tập`, đặt giữa `Buổi học` và `Ghi chú` (`$classId.tsx` tabs).
- Hero: thêm Button primary `Giao bài tập` (bên phải, cạnh `+ Thêm học viên` giữ secondary); ẩn theo điều kiện Key Insights.
- 2 StatCard động mới (bài đang mở / đã nộp trên bài mở) thêm vào hàng stat hiện có (6 card).
- View `list`: header section-label `Bài đã giao lớp này` + summary + nút ghost `Giao thêm đề`; item = `classAssignments` filter `classId` (snapshot đã desc theo createdAt); thẻ: title + meta `Hạn {dd/mm/yyyy} · {n}/{m} đã nộp` + rollup tag; sub-row từng target (avatar + tên + timestamp nộp hoặc `Chưa có bài nộp` + student status tag); aria-label thẻ `{n} trên {m} đã nộp`; empty `Chưa giao bài nào cho lớp này.` + CTA `Giao bài tập`.
- View `assign`: 2 cột `lg:grid-cols-[1.2fr_1fr]` như Key Insights + sticky action bar.
- Submit: verify-then-success như Key Insights; snapshot refetch tự động (command bus).
- Tách component: `apps/web/src/components/classes/class-assignments-tab.tsx` (+ sub-components `AssignPickerCard`, `AssignTargetCard`, `AssignedListCard`, `AssignSuccessCard` nếu vượt ~300 dòng) — giữ `$classId.tsx` chỉ thêm tab + state view + hero + 2 stat.
- Status helper + StatusTag: `apps/web/src/components/assignments/assignment-status.ts` (pure: `rollupStatus(assignment, today)`, `studentSubmissionStatus(target, due, today)`, `fmtWhen`, `fmtDue`) + `StatusTag` component có tone.

## Related Code Files

- Create: `apps/web/src/components/classes/class-assignments-tab.tsx` (+ sub-files nếu tách), `apps/web/src/components/assignments/assignment-status.ts`, `StatusTag` (component mới hoặc trong file status)
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` (tab + hero + view state + 2 stat), `apps/web/src/components/ui/tag.tsx` (nếu chọn hướng extend tone), `apps/web/src/components/assignments/student-preview-paper.tsx` (nếu phase 2 chưa extend)
- Delete: không

## Implementation Steps

1. Viết `assignment-status.ts` + `StatusTag` (pure helpers + component tone) — `fmtWhen(iso)` → `dd/mm/yyyy · HH:mm`; `fmtDue(iso)` → `dd/mm/yyyy`; "hôm nay" nhận tham số từ helper ngày VN.
2. Tab skeleton trong `$classId.tsx`: state `assignmentsView`, `key={classId}` remount, wrap `setTab` reset view, nút hero wiring + điều kiện ẩn, 2 StatCard động.
3. View list: `AssignedListCard` + sub-rows theo Requirements (dùng `assignment-status.ts`, guard 0-target).
4. View assign: picker card (filter chips + prompt cards ready-only + tag đã giao + errors + empty) + target card (due min VN-today/note/students/toggle-all/warn reassign/guard ≤100) + preview + sticky action bar (validation `useMemo`, disabled submit).
5. Submit + verify-then-success + reconcile verify (Key Insights).
6. Tự kiểm tay `pnpm dev`: tạo lớp + 2 học viên + enrollment, tạo 1 đề ready + 1 draft, giao bài cho 1 học viên, kiểm list/rollup/reload; thử giao lại cùng đề (warn + item thứ 2); thử due quá khứ (bị chặn client + server nếu force).

## Todo

- [ ] Helper assignment-status.ts + StatusTag (rollup + student status + fmt + tone)
- [ ] Tab + hero + view state (key remount + setTab wrap) + 2 stat động trong $classId.tsx
- [ ] View list (thẻ + sub-row + summary + empty)
- [ ] View assign (picker + targets + preview + action bar + validation)
- [ ] Submit verify-then-success + reconcile verify
- [ ] Tự kiểm tay end-to-end

## Success Criteria

- Đủ 3 view đúng copy v2; giao bài tạo row thật, target `submittedAt` null; item mới đứng đầu list sau refetch, sống qua reload.
- Validation đủ: thiếu đề/học viên/due quá khứ → submit disabled + copy đúng; server từ chối (phase 1) — E2E chốt phase 4.
- Rollup + student status đúng bảng thật (derived từ fixture có submittedAt trong unit test phase 4); 0-target guard.
- 2 stat động đúng giá trị; hero ẩn/đúng điều kiện; đổi lớp/tab reset view state.
- Không regression: 3 tab cũ, `AddStudentModal`, occurrence handlers, notes vẫn chạy (`pnpm check` + test hiện có xanh).

## Verification

```bash
pnpm check-types
cd apps/web && npx vitest run
pnpm dev  # tự kiểm tay bước 6
```

## Risk Assessment

- **R1: `$classId.tsx` phình to** — logic tab tách hết sang `class-assignments-tab.tsx`; file route chỉ giữ tab registration + view state + hero button + 2 stat.
- **R2: View state lệch khi đổi tab/lớp** — cơ chế duy nhất đã chốt (red-team F12): `<ClassAssignmentsTab key={classId}>` remount khi đổi lớp + wrap `setTab` reset view khi rời tab `assignments`; hero ẩn iff `tab === "assignments" && view !== "list"`.
- **R3: Double-submit** — command bus serialize + `submitBlocked` của `useKernelFormSubmit` (scout mục 4.2); nút disabled khi pending.
- **R4: Due "hôm nay" lệch múi giờ** — client `min` + validation và server min-today cùng dùng helper ngày VN (UTC+7) của phase 1 (red-team F6); không còn cửa sổ "client cho phép, server từ chối" do múi giờ trình duyệt.

## Security Considerations

- Mutation qua kernel router (CSRF + org guard); `classId` lấy từ route param, server xác nhận ownership; không render HTML thô từ note/nội dung đề (JSX text node).

## Next Steps

- Phase 4 khoá chặt toàn bộ bằng component tests + E2E.
