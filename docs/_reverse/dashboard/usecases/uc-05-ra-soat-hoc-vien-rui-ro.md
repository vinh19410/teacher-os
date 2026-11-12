# UC-05 — Rà soát học viên rủi ro

| Trường | Nội dung |
|--------|----------|
| **a. Mô tả** | Giáo viên xem bảng "Cần kiểm tra": học viên có tín hiệu vắng không phép trong 14 ngày và/hoặc miss check-in, kèm số buổi gói còn lại. |
| **b. Actor** | Chính: Giáo viên. |
| **c. Điều kiện tiên quyết** | Kernel snapshot có lessons + students. |
| **d. Trigger** | Render trang dashboard (tính client-side mỗi lần render với `now` hiện tại). |
| **e. Luồng chính** | 1. Duyệt lessons: gán `absent` nếu vắng hợp lệ trong cửa sổ 14 ngày — chỉ buổi có ngày, bỏ excused, nhận unexcused hoặc dòng absent cũ attendance NULL (dashboard-from-kernel.ts:124-136). 2. Gán `missed-check-in` nếu upcoming có day < hôm nay (Mon=1, không wrap — thứ Hai 0 miss) (159-166). 3. Gom theo học viên, thứ tự absent trước (168-177). 4. Render bảng: avatar + tên, badge "Vắng"/"Miss check-in", số buổi còn `pkg.remaining` (dashboard.tsx:270-290). |
| **f. Luồng thay thế** | f1. Không có học viên rủi ro → "Không có học viên rủi ro." (dashboard.tsx:265-268). |
| **g. Ngoại lệ** | Không có riêng — tính thuần client, không gọi API. |
| **h. Hậu điều kiện** | Bảng phản ánh kernel lessons; KHÔNG dùng cờ `student.atRisk`/tuition tags (BR-012). FR: FR-010. BR: BR-006, BR-007, BR-012. |
