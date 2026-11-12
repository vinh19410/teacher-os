---
type: reverse-source-map
feature: student-classes
status: draft
updated: "2026-11-12"
---

# student-classes — Danh mục nguồn (provenance)

## 1. Bảng nguồn

| ID | Nguồn (file/folder) | Loại | Ngày | Confidence | Encoding OK? | Phần feature suy ra từ đây |
|----|---------------------|------|------|------------|--------------|----------------------------|
| S1 | `apps/server/src/routes/student-class.ts` | code TS (server helper) | 2026-11 (develop @ d6c0f6b5) | high | OK | FR-sc-005/006/007/016, BR-sc-004/005/009/014, ERD, F3 |
| S2 | `apps/server/src/routes/student.ts` | code TS (server route) | 2026-11 | high | OK | FR-sc-001/002/003/004, guard, E-sc-001..005, F1 |
| S3 | `apps/server/src/routes/student-classmates.ts` | code TS (server route) | 2026-11 | high | OK | FR-sc-014/015, NFR-sc-001/003, F2 |
| S4 | `apps/server/src/routes/student-class.test.ts` | test vitest (active) | 2026-11 | high | OK | R1: helper mapping lớp |
| S5 | `apps/server/src/routes/student-classmates.test.ts` | test vitest (active) | 2026-11 | high | OK | FR-sc-014/015, BR-sc-003/010, NFR-sc-001/003, E-sc-006 |
| S6 | `apps/server/src/student.test.ts` | test vitest (active) | 2026-11 | high | OK | FR-sc-001/003/004/005/006/007, BR-sc-003/005/006/012, E-sc-001/005 |
| S7 | `apps/server/src/role-gates.test.ts` | test vitest (active) | 2026-11 | high | OK | NFR-sc-002, E-sc-002/004 |
| S8 | `apps/e2e/specs/student-class-detail.spec.ts` | test Playwright | 2026-11 | high | OK | Screens, FR-sc-002/008/009/017, NFR-sc-008, E-sc-005 |
| S9 | `apps/e2e/specs/student-classmates.spec.ts` | test Playwright | 2026-11 | high | OK | FR-sc-014, E-sc-009 |
| S10 | `apps/student/src/routes/_auth/classes/index.tsx`, `$classId.tsx` + `apps/student/src/routes/_auth/route.tsx` + `apps/student/src/components/layout/student-page-gate.tsx` | code TSX (SPA routes) | 2026-11 | high | OK | FR-sc-018, Screens, E-sc-001/003/008, F1 |
| S11 | `apps/student/src/components/class/class-detail-view.tsx`, `class-info-card.tsx`, `class-lesson-list.tsx`, `classmates-tab.tsx`, `class-assignment-table.tsx` + `class-lesson-list.test.tsx`, `classmates-tab.test.tsx` | code TSX + test | 2026-11 | high | OK | FR-sc-008..017, Screens, chuỗi hiển thị R2 |
| S12 | `apps/student/src/components/overview/class-card.tsx`, `student-error-view.tsx` | code TSX | 2026-11 | high | OK | FR-sc-002, E-sc-002/003/004/007, ranh giới enrollment-lifecycle |
| S13 | `apps/student/src/lib/repos/student.ts`, `assignment-status.ts`, `vietnam-display-date.ts` | code TS (read model client) | 2026-11 | high | OK | NFR-sc-005/006, FR-sc-016, E-sc-007 |
| S14 | `packages/api/src/contracts.ts` | code TS (hợp đồng API) | 2026-11 | high | OK | BR-sc-002, FR-sc-014/016, NFR-sc-003/004, E-sc-004 |
| S15 | `packages/db/src/schema/class.ts`, `enrollment.ts`, `lesson.ts`, `membership.ts` + `packages/db/src/migrations/0001_opposite_loki.sql`, `0002_flippant_speed.sql`, `0010_fantastic_karma.sql`, `0022_neat_quicksilver.sql`, `0045_aspiring_thena.sql` | code (schema + migration) | 2026-11 | high | OK | BR-sc-001/002, Mục 8, ERD |
| S16 | `packages/api/src/vietnam-date.ts`, `packages/api/src/format-schedule.ts` + `apps/server/src/lib/assignment-visibility.ts` | code TS (hạ tầng chung) | 2026-11 | high | OK | NFR-sc-005, BR-sc-007/009, FR-sc-006 |
| S17 | `apps/server/src/app.ts` | code TS (mount API) | 2026-11 | high | OK | NFR-sc-007 |
| S18 | `docs/_reverse/classes/classes-reverse-spec.md` | doc md (bộ đặc tả admin) | 2026-11 | high | OK | Chỉ dùng cho Mục 0.3 đối chiếu ranh giới; KHÔNG là nguồn hành vi học viên |

## 2. Định nghĩa nguồn & range dòng

- **S1** `apps/server/src/routes/student-class.ts` (EOF 278): cột chọn chung :31-42; nạp giáo viên tổ chức :57-75 (bình luận giả định 1 GV/org :57-62); Buổi tới :77-117 (dự phòng giờ lệch :110-112); chuyển đổi bản ghi lớp :119-139; truy vấn bài tập :145-207; ánh xạ bài tập (safeParse điểm :213-215, nguồn :219, thời điểm nộp :224-227, cờ Writing :231); bậc trạng thái legacy :236-250; sắp thứ tự buổi legacy :246-278.
- **S2** `apps/server/src/routes/student.ts` (EOF 2410): khối phụ thuộc :92-116; guard học viên :124-210 (401 :127-129; chưa xác thực :130-138; auto-provision :148-175; chưa liên kết :191-199; phân giải tổ chức :177-189); chắn phiên/vai trò :500-545 (401 :502-504; chặn giáo viên :506-516; chưa xác thực :529-537); gắn route :718-720; tổng quan (danh sách lớp) :978-1041; chi tiết lớp :1043-1107 (guard :1048-1063; buổi theo ghi danh :1069-1094; trả về :1098-1106); trang lịch #584 :1116-1239 (ranh giới); kích hoạt ghi danh :1300-1324 (ranh giới).
- **S3** `apps/server/src/routes/student-classmates.ts` (EOF 82): ký hiệu 2 chữ cái :17-22; bình luận riêng tư/IDOR :24-30; router + guard :31-36; guard bản thân :42-57 (404 tại :57); truy vấn roster :59-70; ánh xạ :72-78.
- **S4** `apps/server/src/routes/student-class.test.ts` (EOF 47): 4 test :17-19, :21-27, :29-37, :39-46.
- **S5** `apps/server/src/routes/student-classmates.test.ts` (EOF 233): hình dạng roster + ký hiệu + "(bạn)" :174-205; khóa 4 trường :196-204; chờ kích hoạt → 404 :207-211; tổ chức khác → 404 :213-216; lớp lạ → 404 :218-221; 401 :223-226; bộ ký hiệu :228-232.
- **S6** `apps/server/src/student.test.ts` (EOF 2015): giáo viên gắn mọi lớp :767-781; không có giáo viên :783-791; payload chi tiết :793-838; chờ kích hoạt 404 :840-846; tổ chức khác/không ghi danh/lớp lạ :848-856; xen kẽ legacy :858-907; 401 :909-914; nhóm Buổi tới #395 :1487-1732 (:1658-1670, :1672-1683, :1685-1697, :1699-1707, ranh giới đúng phút :1709-1717, chưa qua giờ :1719-1731).
- **S7** `apps/server/src/role-gates.test.ts` (EOF 415): giáo viên → 403 ACCOUNT_TEACHER_ROLE :190-217; vai trò trống → 403 :219-235.
- **S8** `apps/e2e/specs/student-class-detail.spec.ts` (EOF 348): test chính :120-186 (giáo viên :126-129; card chờ kích hoạt :133-139; bàn phím :143-147; thư giáo viên :148-153; badge trạng thái + aria-current :155-166; tab Bài tập :169-175; về trang chủ :181-185); click mọi vùng card :188-207; chờ kích hoạt → "Không tìm thấy lớp" :209-217; điều hướng "Lớp học" :219-257; tiêu điểm :320-324.
- **S9** `apps/e2e/specs/student-classmates.spec.ts` (EOF 137): kịch bản roster :106-136 (đếm thẻ :121; "(bạn)" :124-130; người chờ kích hoạt không có :132-133; không email :134-135).
- **S10** `apps/student/src/routes/_auth/classes/index.tsx` (EOF 98): route + truy vấn :14-22; render :59-92; trống :69-74. `$classId.tsx` (EOF 84): route :14-23; nhánh chưa liên kết → màn lỗi :29-40; nhánh chưa hoàn tất onboarding → Navigate :42-44; 404 → màn không tìm thấy + bình luận đổi tổ chức :49-66 (:51-53); render 1 nguồn thời gian :72-83. `_auth/route.tsx` (EOF 20): chắn phiên :4-13. `student-page-gate.tsx` :27-50.
- **S11** `apps/student/src/components/class/class-detail-view.tsx` (EOF 379): tab :50-55; nhãn trạng thái lớp :59-64; vòng tiến độ :66-105; banner :107-162; tab Giáo trình :164-228; khối chính :230-363 (thư giáo viên :273-281); màn không tìm thấy :365-379. `class-info-card.tsx` (EOF 191): tháng kho :39-56; khối chính :83-191 (:150-154 câu thay thế; :166-188 footer). `class-lesson-list.tsx` (EOF 219): nhãn trạng thái :13-49; đã kết thúc :57-67; mốc tiếp theo :69-85; trống :98-106; render :108-215. `classmates-tab.tsx` (EOF 74): thẻ "(bạn)" :6-25; tải :35-41; lỗi :43-51; trống :54-62; lưới :64-73. `class-assignment-table.tsx` (EOF 124): sắp :22-29; trống :31-39; cột :44-58; thao tác :61-68; huy hiệu :79-96; điều kiện liên kết :99-115. Tests: `class-lesson-list.test.tsx` (EOF 84) :29-46, :48-64, :66-83; `classmates-tab.test.tsx` (EOF 75) :25-42, :44-53, :55-63, :65-74; `lesson-materials.test.tsx` (thành phần tài liệu buổi — ranh giới student-materials).
- **S12** `apps/student/src/components/overview/class-card.tsx` (EOF 265): nhận biết chờ kích hoạt :33; liên kết tràn card :55-68; nút tham gia :99-123; nhãn "Chờ kích hoạt" :207-215; thanh tiến độ :244-265. `student-error-view.tsx` (EOF 243): mặc định :82-86; giáo viên :99-104; chưa liên kết :105-108; chưa xác thực :109-114; mơ hồ :115-118.
- **S13** `apps/student/src/lib/repos/student.ts` (EOF 867): nạp chi tiết lớp :187-218 (phân tích :217); hook chi tiết + cache :396-402; nạp roster :404-435; hook roster có điều kiện :438-445; kích hoạt ghi danh (ranh giới) :819+ . `assignment-status.ts` (EOF 298): suy nhãn :119+ ("Đã chấm · Nộp trễ"/"Đã chấm" :161, "Quá hạn" :205, "Sắp đến hạn" :217, "Chưa nộp" :227/:243/:256). `vietnam-display-date.ts`: tên thứ :2, định dạng ngày :29, ngày đủ :42.
- **S14** `packages/api/src/contracts.ts` (EOF 4799): vòng đời ghi danh :1615-1616; mã lỗi học viên :1967-1971; mã lỗi tài khoản :1979-1998; schema Buổi tới :2106-2111; schema giáo viên :2113-2119; schema lớp + tự cứu :2121-2142; schema điểm bài tập :2144-2152; schema bài tập :2154-2175; schema buổi :2187-2199; schema chi tiết lớp :2215-2220; schema roster :2222-2232.
- **S15** `packages/db/src/schema/class.ts` (EOF 41): :10-41. `enrollment.ts` (EOF 47): :11-47; ràng buộc duy nhất :40-43; bình luận vòng đời :30-33. `lesson.ts` (EOF 80): ngày :46; trạng thái :49-57; điểm danh :66; ghi chú :68; chỉ mục :77. `membership.ts`: :11-24. Migrations: `0001_opposite_loki.sql` lớp :1-19, ghi danh :21-34; `0002_flippant_speed.sql` buổi :1-20; `0010_fantastic_karma.sql` cột ngày; `0022_neat_quicksilver.sql` trạng thái ghi danh; `0045_aspiring_thena.sql` điểm danh.
- **S16** `packages/api/src/vietnam-date.ts` (EOF 316): hôm nay VN (:27); mốc kết thúc buổi :69-76 (NaN→null :75). `format-schedule.ts` (EOF 56): tên thứ :9-17; phân tích :25-47; dựng :49-55. `apps/server/src/lib/assignment-visibility.ts` (EOF 16): :8-16.
- **S17** `apps/server/src/app.ts` (EOF 481): cho qua nhóm học viên khỏi bootstrap chung :206-218; gắn sub-app :433-437.
- **S18** `docs/_reverse/classes/classes-reverse-spec.md`: dòng 31 (mô hình giáo viên tổ chức) dùng cho Mục 0.3/BR-sc-004.

## Ghi chú nguồn

- **Confidence:** toàn bộ là source code + test đang active trên `develop` (d6c0f6b5) → high. Không nguồn mojibake, không Encoding ⚠.
- **R1 — test hạng nhất:** mọi nhãn ✅ có test đều ghi dòng test cụ thể trong _evidence.md. Quét âm tính: KHÔNG có skip/todo/.only/test.fails trong các file test thuộc phạm vi (chi tiết reverse-gaps.md §3).
- **Nguồn mâu thuẫn:** không phát hiện mâu thuẫn giữa code, test và E2E trong phạm vi feature này.
