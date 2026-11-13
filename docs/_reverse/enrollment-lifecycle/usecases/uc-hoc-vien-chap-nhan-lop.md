# UC-3: Học viên chấp nhận tham gia lớp (portal)

> Reverse draft — truy vết: S5 `student.ts:1291-1324`; S12 `class-card.tsx`; S13; S14 `student.ts:819-827`; S20 `student.test.ts:1292-1484`.

## a. Mục tiêu & phạm vi

- Học viên tự xác nhận tham gia lớp đang "Chờ kích hoạt" từ portal; kết cục GIỐNG UC-2 (active + gói + buổi) vì cùng gọi `activateEnrollment`. ✅ [S5 `student.ts:1291-1299`; S4 `enrollment-activation.ts:656-663`]

## b. Actor chính & stakeholder

- **Chính:** Học viên đã đăng nhập portal (student role). ✅ [S5 `student.ts:722` requireStudent; S20 `student.test.ts:1471-1484` — teacher 403]
- **Stakeholder:** Giáo viên (roster chuyển "Đang học" sau refetch). 🔵

## c. Tiền điều kiện

- Học viên có enrollment `invited` trong org đang chọn; portal hiển thị thẻ "Chờ kích hoạt" + nút "Tham gia lớp". ✅ [S12 `class-card.tsx:33,99-113,212`; S5 overview `:983-1001`]
- Request đi từ portal đúng Origin + JSON (CSRF). ✅ [S5 `student.ts:454-466`]

## d. Trigger

- Bấm nút "Tham gia lớp" trên thẻ lớp (trang chủ hoặc danh sách lớp). ✅ [S13 `index.tsx:38-42`; `classes/index.tsx:22-25`]

## e. Kịch bản chính

1. HV bấm "Tham gia lớp" (nút disabled khi đang xử lý). ✅ [S12 `class-card.tsx:105-112`]
2. Portal POST `/api/student/enrollments/{id}/accept`. ✅ [S14 `student.ts:819-827`]
3. CSRF: Origin sai → 403 "origin not allowed"; content-type sai → 415. ✅ [S5 `student.ts:454-466`; S20 `:1441-1469`]
4. Ownership: enrollment phải thuộc đúng học viên này trong org; khác → 404 `enrollment not found`, status giữ nguyên `invited`. ✅ [S5 `student.ts:1305-1311`; S20 `:1406-1424`]
5. `activateEnrollment` chạy như UC-2 (CAS + materialize + study-pack). ✅ [S5 `student.ts:1313`]
6. Trả 200 `{ok:true}`; portal invalidate overview; thẻ chuyển sang tiến độ + buổi tới. ✅ [S14 `student.ts:823-826`; S20 `:1350-1381`]

## f. Luồng thay thế / mở rộng

- **f1 Accept lại (idempotent):** 200, không nhân đôi package/lesson (1 gói, đủ N buổi). ✅ [S20 `:1383-1404`]
- **f2 Accept enrollment của người khác:** 404, không đổi trạng thái. ✅ [S20 `:1406-1424`]
- **f3 Id không tồn tại:** 404. ✅ [S20 `:1426-1439`]
- **f4 Chi tiết lớp khi vẫn invited:** GET `/api/student/classes/:classId` → 404 (phải accept trước). ✅ [S5 `student.ts:1048-1063`; S20 `:840`]

## g. Business rules & ràng buộc

BR-EL-009 (chỉ enrollment của chính mình), BR-EL-010 (portal chi tiết/lịch chỉ active), BR-EL-013 (cùng hàm kích hoạt), BR-EL-003 (CAS). ✅

## h. Lỗi & phục hồi

E-EL-005 (404 — gộp cả không-sở-hữu để không lộ), E-EL-009 (403 origin), E-EL-010 (415 content-type); role không phải student → 403 role gate. ✅
