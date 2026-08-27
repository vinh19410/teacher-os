---
title: "Phase 4: Merge tabs cleanup and QA"
status: todo
priority: P1
effort: "0.5-1d"
dependencies: [3]
---

# Phase 4: Merge tabs cleanup and QA

## Overview

Bước cuối: gộp 2 tab (Giáo trình + Lịch học) thành 1 tab "Buổi học" duy nhất trong Class Detail. Layout dọc — khu Quản lý giáo trình (collapsible, default collapse khi đã có syllabus) + Timeline table đã enhanced ở P2+P3. Xóa code tab cũ, xử lý empty states, verify không có regression trên các tab khác, manual QA cho lớp nhỏ + lớn.

## Requirements

- [ ] Xóa 2 tab cũ `"syllabus"` và `"schedule"` trong `$classId.tsx`.
- [ ] Thêm 1 tab mới id `"sessions"` label "Buổi học" (hoặc "Giáo trình & Lịch") — xác nhận label với user tại kickoff phase này.
- [ ] Nội dung tab: `<CurriculumManagementSection>` (khu trên) + `<ClassScheduleTable>` enhanced (khu dưới).
- [ ] `CurriculumManagementSection` nhận prop `defaultCollapsed?: boolean` — default `syllabus?.modules?.length > 0`.
- [ ] Header khu Quản lý có nút toggle collapse với biểu tượng chevron + text tóm tắt (`{modules.length} chương • {lessonsCompleted}/{lessonsTotal} bài đã dạy`).
- [ ] Khi collapsed, chỉ hiển thị header + progress bar summary.
- [ ] Khi expanded, hiển thị đầy đủ tree modules + lessons + tất cả actions (import/add/edit/remove).
- [ ] Empty state (a): `syllabus === null` → khu Quản lý default **expanded** với CTA "Import từ template" + timeline bên dưới hiển thị Chủ đề = "—".
- [ ] Empty state (b): `syllabus` có nhưng `cls.startDate > today` (chưa bắt đầu) → timeline vẫn hiển thị lịch dự kiến (session status = "upcoming"), banner nhỏ "Lớp bắt đầu ngày {startDate}".
- [ ] Empty state (c): `sessions === null` (legacy fallback) → khu Quản lý bình thường + bảng cũ 4 cột read-only.
- [ ] Default tab active sau merge: verify không phá hành vi hiện tại (nếu route đang default tab đầu tiên, tab "sessions" đặt ở vị trí nào — recommend giữ order để không phá muscle memory user).
- [ ] Grep repo cho `tab=syllabus`, `tab=schedule`, `activeTab` URL params → nếu có, thêm redirect map `syllabus`/`schedule` → `sessions`.
- [ ] Line count `$classId.tsx` sau phase < 500 lines.

## Architecture

**Route change**
- Tabs list giảm từ 4 → 3.
- Order đề xuất: `[Tổng quan | Buổi học | ...các tab khác]` (verify với user vào đầu phase này).

**Collapsible section**
- `<CurriculumManagementSection defaultCollapsed={hasContent}>` — nội bộ dùng `useState` cho `isCollapsed`.
- Header luôn hiển thị; body toggle bằng CSS (`max-height` transition hoặc unmount tùy weight).
- Nếu dùng `<details>` native → không cần state, browser handle.

**QA scenarios**
- Lớp mới, chưa import syllabus → empty state (a).
- Lớp đã import syllabus, chưa dạy buổi nào → collapse default, timeline hiển thị lịch dự kiến.
- Lớp đang chạy giữa chừng (5/12 buổi done) → collapse default, timeline mix upcoming/completed.
- Lớp lớn 72 sessions (3 buổi/tuần × 6 tháng) → verify perf scroll + expand.
- Lớp legacy (sessions === null, ~2020 data cũ) → verify không vỡ.

## Related Code Files

- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx` — xóa tabs cũ, thêm tab mới, delete curriculum inline block đã extract ở P1.
- Modify: `apps/web/src/components/class-detail/curriculum-management-section.tsx` — thêm `defaultCollapsed` prop + header collapse UI.
- Modify (nếu cần redirect): route file có URL param handler.

## Implementation Steps

1. Ask user: label tab mới ("Buổi học" vs "Giáo trình & Lịch") + vị trí trong tab order. Ghi vào phase notes.
2. Grep repo: `grep -rn "tab=syllabus\|tab=schedule\|activeTab" apps/web/src` → xác định deep-link risk.
3. Cập nhật `curriculum-management-section.tsx`: thêm `defaultCollapsed` + header với chevron + summary text.
4. Trong `$classId.tsx`, xóa 2 `<TabsTrigger>` + 2 `<TabsContent>` cũ, thêm mới `<TabsContent value="sessions">` chứa 2 khu.
5. Xóa mọi state/hook liên quan đến curriculum inline đã extract ở P1 nhưng còn sót.
6. Verify progress bar tổng vẫn hiển thị đúng ở collapsed mode.
7. Manual QA 5 scenarios (empty new / imported no sessions / mid-progress / large 72 / legacy).
8. Chạy full test suite + biome + type check.
9. Đo line count `$classId.tsx` sau khi cleanup → assert < 500.
10. Update CLAUDE.md hoặc docs nếu có mention 2 tab cũ.

## Todo

- [ ] Confirm label tab + vị trí order với user
- [ ] Grep deep-link risk (`tab=syllabus/schedule`)
- [ ] Thêm `defaultCollapsed` + header collapse UI vào `curriculum-management-section.tsx`
- [ ] Xóa 2 tab cũ trong `$classId.tsx`, thêm tab "Buổi học" gộp 2 khu
- [ ] Xử lý 3 empty states (no syllabus / future startDate / legacy sessions null)
- [ ] Manual QA 5 scenarios (empty new / imported / mid / large 72 / legacy)
- [ ] Full test suite pass, biome, type check xanh
- [ ] Line count `$classId.tsx` < 500 (assert)
- [ ] Update docs nếu có nhắc 2 tab cũ

## Success Criteria

- [ ] Class Detail hiển thị **3 tab** (giảm từ 4).
- [ ] Tab "Buổi học" mở ra thấy: khu Quản lý (collapsed khi có syllabus) + timeline.
- [ ] Toggle collapse hoạt động mượt (transition hoặc unmount clean).
- [ ] Empty state (a) `syllabus === null`: khu Quản lý default expanded + CTA import.
- [ ] Empty state (b) future startDate: banner + timeline dự kiến.
- [ ] Empty state (c) legacy `sessions === null`: bảng 4 cột không đổi + khu Quản lý bình thường.
- [ ] `$classId.tsx` < 500 lines.
- [ ] Test suite pass, biome/type check xanh.
- [ ] Manual QA 5 scenarios không có regression.
- [ ] Nếu có URL deep-link cũ, redirect hoạt động.

## Risk Assessment

**Risk 1**: Xóa tab id `"syllabus"`/`"schedule"` phá bookmark hoặc URL sharing của user.
- Signal: User báo cáo click link → tab không active.
- Response: Grep + redirect map (đã trong requirements). Nếu grep không thấy usage nào → skip redirect.

**Risk 2**: Collapse animation lag khi khu Quản lý có nhiều modules (10+).
- Signal: Toggle collapse giật giật.
- Response: Chuyển từ `max-height` transition sang mount/unmount; hoặc dùng `<details>` native.

**Risk 3**: Progress bar biến mất khi collapsed → user không thấy tiến độ.
- Signal: User complain "collapse xong không thấy progress".
- Response: Header collapsed vẫn hiển thị progress bar mini + text `5/10 bài`.

**Risk 4**: Line count `$classId.tsx` không giảm đủ (còn > 500) do các tab khác vẫn dài.
- Signal: Assertion fail.
- Response: Extract thêm tab khác nếu > 500 (nhưng ngoài scope) — hoặc chấp nhận < 550 và note trade-off.

**Risk 5**: Regression tab khác (nếu Class Detail có tab Học viên, Thanh toán...) khi xóa tab id.
- Signal: Tab khác không hiển thị hoặc default active sai.
- Response: Verify tab order + defaultValue của `<Tabs>` component sau khi xóa.

## Handoff after phase completion

Sau khi P4 xanh:
- Recommend `/ak:code-review` cho file `$classId.tsx` + 3 component mới trước khi ship.
- Ship qua `/ak:ship` khi đủ tự tin.
- Đóng parent tracking issue + 4 sub-issues.
