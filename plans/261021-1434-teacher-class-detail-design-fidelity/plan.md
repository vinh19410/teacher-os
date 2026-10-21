---
title: "Teacher: kéo trang chi tiết lớp (/classes/$classId) về đúng design v2"
description: "Trang chi tiết lớp của giáo viên đã dùng primitive v2 nhưng bố cục, tab, danh sách buổi học, bài đã giao và bảng học viên còn lệch design v2, kèm vài class chết (token không tồn tại) ở bảng lịch học. Plan liệt kê từng điểm lệch và sửa theo dữ liệu thật, không bịa dữ liệu."
status: pending
priority: P2
effort: "9h"
issue: 391
branch: feat/teacher-class-detail-design-fidelity
tags: [frontend, web, teacher, design-v2, fidelity]
blockedBy: []
blocks: []
created: 2026-10-21
---

# Trang chi tiết lớp (teacher) lệch design v2

Nguồn design: `vinh19410/teacheros-design-v2@7a53fc0`, file `src/pages/TeacherClass.tsx`
(harness `scripts/design-compare/fetch-design.sh` tự clone đúng SHA). Ảnh đối chiếu hiện tại:
`plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/desktop-light.png`.
Plan chị em của trang học viên: `plans/261021-1401-student-class-detail-design-fidelity/` (#389).

Verdict cũ của #378 ghi `t-class-detail` PASS chỉ ở mức "khung shell + token + primitive"; bố cục vùng
thì chưa khớp (xem bảng dưới). Plan này nâng tiêu chí lên cấu trúc từng khối.

## Outcome / Non-goals / Acceptance

- **Outcome:** màn `t-class-detail` khớp cấu trúc + token design v2 ở 3 viewport × 2 theme.
- **Non-goals:** không đổi API/contract/DB/kernel action; không thêm dữ liệu design có mà server chưa trả;
  không đổi luồng modal (điểm danh, sửa buổi, sắp xếp buổi, thêm học viên, sửa học phí) ngoài việc đổi vỏ/token;
  không đụng `/classes` (danh sách) và trang chấm bài.
- **Acceptance:** (1) `pnpm design:compare --screens t-class-detail --side app --label fidelity` PASS ở
  1440/768/375, light + dark; (2) `pnpm check`, `pnpm check-types`, `pnpm --filter web test` xanh;
  (3) các spec `class-operations`, `class-assign`, `class-sessions-manage-modal`, `class-tuition-fee`,
  `class-roster-tuition-debt` xanh; (4) grep `foreground-2|muted/40/30` trong các file đụng tới rỗng.

## Bảng điểm lệch (design v2 vs app hiện tại)

| # | Khối | Design v2 | App hiện tại | Dữ liệu |
|---|---|---|---|---|
| 1 | Back link | Nút ghost `← Classes` (`BackLink`) | Link chữ gạch chân `← Lớp học` | — |
| 2 | Header | `kicker` = loại · thứ giờ · phòng; chỉ **2 action**: "Assign practice" (outline) + "Add session" (primary) | `kicker` + thêm `lead` dài (lịch/bắt đầu/học phí); **3 action** (Giao bài tập, Thêm học viên, Sửa học phí) | Có |
| 3 | Hàng stat | **4 thẻ**: Students (sub: khoảng ngày), Sessions held `x/y` (sub: % syllabus), Attendance rate (đỏ nếu còn buổi chưa điểm danh), Pending submissions | **6 thẻ** (`grid-cols-6`): học viên, bài đang mở, đã nộp, buổi đã học, tiến độ, bài trong syllabus — 2 thẻ cuối trùng ý | Thiếu **Attendance rate** (xem "Không có dữ liệu") |
| 4 | Tab | 3 tab: **Sessions & practice** (mặc định) · Students · Syllabus | 5 tab: Học viên (mặc định) · Buổi học · Bài tập · Từ vựng · Ghi chú | Giữ Từ vựng/Ghi chú (xem câu hỏi mở) |
| 5 | Tab Sessions & practice | Lưới 2 cột `xl:grid-cols-2`: `Section` "Sessions" + `Section` "Assigned practice" | Tab "Buổi học" = bảng lịch + khối giáo trình; "Bài tập" là tab khác, dạng form giao bài | Có |
| 6 | Hàng buổi học | `li` card: ô số `size-9` (đã học = `bg-primary`), ngày · giờ · phút, chủ đề, link "Take/Edit attendance →", thanh điểm danh 3 màu, nút Edit; buổi quá khứ chưa điểm danh viền/nền amber | `<table>` 3 cột Ngày & Giờ / Chủ đề / Trạng thái, hàng mở rộng | Có (số lượt có mặt/đi muộn/vắng — xem phase 2) |
| 7 | Bài đã giao | Accordion: icon kỹ năng, "n/N students done" (xanh khi đủ, amber khi 0), thanh tiến độ, mở ra từng học viên + badge "Last activity"/"Not started" + nút Grade | Danh sách trong tab Bài tập, có form giao bài nặng ~800 dòng | Có (không có thanh kỹ năng Flashcard/Quiz) |
| 8 | Bảng Students | `Table` 5 cột (Student kèm `Avatar`, Enrollment, Current band, Attendance, Tuition) | `Card p-0` + bảng riêng; có `Badge variant="warn/success"` | Có một phần (xem "Không có dữ liệu") |
| 9 | Tab Syllabus | `SyllabusTree` dùng chung với `/syllabus` | `CurriculumManagementSection` nằm trong tab Buổi học | Có |
| 10 | Class chết | — | `class-schedule-table.tsx:333` `bg-muted/40/30` (class không hợp lệ), `:342,:350` và `session-actions-modal.tsx:173` `text-foreground-2` (token không tồn tại — grep `globals.css` = 0) | — |
| 11 | Nút "Chấm bài" | Nút `Btn size=sm variant=outline` "Grade" | `GRADE_LINK_BUTTON_CLASS` chép tay `rounded-full`, `bg-accent` hover (kiểu v1) | — |

### Không có dữ liệu → bỏ khối hoặc dùng số thật, KHÔNG bịa (ghi vào `DESIGN.md` mục lệch có chủ đích)

- **Attendance rate:** cần xác nhận server đã trả điểm danh theo buổi/học viên cho giáo viên (modal `session-attendance-modal` đang ghi/đọc được). Phase 1 kiểm tra; nếu tổng hợp được từ dữ liệu có sẵn thì dùng, nếu không thì thay thẻ bằng "Bài trong syllabus" như hiện nay (không bịa 89%).
- Thanh Flashcard/Quiz/Writing theo học viên trong bài từ vựng; cột "Current band" nếu `Student` chưa có band; "Meeting link" theo buổi (kiểm tra `ClassSession` có trường link chưa).
- Học viên "filler" trong roster design (tên giả) — app chỉ hiển thị học viên thật.

## Phases

| # | Phase | Status | Effort | Phụ thuộc |
|---|---|---|---|---|
| 1 | [Header, hàng stat, tabs + dọn token chết](./phase-01-header-stats-tabs.md) | Pending | 2h | — |
| 2 | [Tab Sessions & practice: danh sách buổi + bài đã giao](./phase-02-sessions-and-practice.md) | Pending | 3.5h | 1 |
| 3 | [Tab Students + Syllabus + nút Grade](./phase-03-students-syllabus-grade.md) | Pending | 2h | 1 |
| 4 | [Test, e2e, so ảnh, DESIGN.md](./phase-04-verify-and-docs.md) | Pending | 1.5h | 2, 3 |

Phase 2 và 3 sửa file khác nhau nên làm song song được sau phase 1; `$classId.tsx` chỉ phase 1 và 2 đụng
→ gộp vào PR tuần tự để tránh xung đột.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Gộp tab "Buổi học" + "Bài tập" làm mất thao tác: hoàn thành/huỷ/dời buổi, sắp xếp buổi, giao bài, chấm bài | Giữ nguyên toàn bộ modal và handler `runOccurrence*`; chỉ đổi phần hiển thị. Form giao bài chuyển sang nút "Assign practice" mở view `assign` như hiện tại |
| e2e bám tên tab (`Học viên`, `Buổi học`, `Bài tập`), `?tab=assignments` từ trang chấm (#319), `data-testid` trong bảng lịch | Phase 4 liệt kê hook phải giữ; `validateClassDetailSearch` giữ nguyên các giá trị cũ và ánh xạ sang tab mới |
| `ClassScheduleTable` hỗ trợ nhóm theo buổi legacy + curriculum, hàng mở rộng chi tiết | Không bỏ hàng mở rộng; card buổi học dùng lại cùng dữ liệu `occurrence` |
| `SyllabusTree` của `/syllabus` có thể gắn chặt với route đó | Phase 3 kiểm tra; nếu gắn chặt thì tách phần thuần hiển thị, không copy |
| PR phình to (nhiều file lớn: 813 dòng assignments tab) | Không sửa logic assignments tab, chỉ bọc vào `Section`/đổi class; tách file nếu vượt 800 dòng |

## Câu hỏi mở

1. **Giữ hay bỏ tab Từ vựng và Ghi chú?** Design chỉ có 3 tab. Mặc định plan **giữ cả hai** (thêm vào sau Syllabus) vì là tính năng thật, không có chỗ khác trong design; bỏ đi là đổi phạm vi sản phẩm.
2. **Tab mặc định:** design mở "Sessions & practice", app mở "Học viên". Mặc định plan **đổi sang Sessions & practice**; e2e đang giả định tab roster mở sẵn sẽ phải sửa.
3. **Ba action ở header → hai:** "Thêm học viên" và "Sửa học phí" chuyển đi đâu? Mặc định: "Thêm học viên" thành nút trong tab Students, "Sửa học phí" thành nút trong header của thẻ thông tin ở tab Students. Đồng ý?
4. **Back link:** đích `/classes` đã khớp design, chỉ đổi kiểu thành nút ghost — không có tranh cãi.
