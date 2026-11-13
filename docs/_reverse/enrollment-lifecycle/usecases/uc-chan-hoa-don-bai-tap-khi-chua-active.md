# UC-5: Chặn hóa đơn / bài tập khi enrollment chưa active

> Reverse draft — truy vết: S3 `kernel.ts:1564-1577,3069-3071`; S16 e2e `:219-248`; S19 `kernel.test.ts:1516-1538,7351-7399`.

## a. Mục tiêu & phạm vi

- Đảm bảo không sinh nghĩa vụ tài chính (hóa đơn) hay nhiệm vụ học (bài tập) cho học viên chưa đồng ý tham gia lớp: server chặn cứng; UI ẩn luôn lựa chọn. ✅ [S3; S16 `:243-248`]

## b. Actor chính & stakeholder

- **Chính:** Giáo viên (người bị chặn/không thấy lựa chọn). ✅
- **Hệ thống:** requireFinanceRole bảo vệ `/invoices*`. ✅ [S3 `kernel.ts:209-211`]

## c. Tiền điều kiện

- Có enrollment `invited` (học viên đã được mời nhưng chưa kích hoạt). ✅ [S16 `:224-240`]

## d. Trigger

- Mở "Tạo hóa đơn" (web /tuition) hoặc "Giao bài tập" (web lớp) khi lớp còn học viên invited. ✅

## e. Kịch bản chính (hạnh phúc — chỉ active đi qua)

1. Picker "Học viên *" của modal hóa đơn chỉ liệt kê enrollment `active` — học viên invited không xuất hiện. ✅ [S16 `create-invoice.spec.ts:243-248`]
2. Danh sách chọn người nhận bài chỉ hợp lệ với roster `active` (server WHERE status='active'). ✅ [S3 `kernel.ts:1564-1573`]
3. Active đi qua: hóa đơn 201 / bài tập 201. ✅ [S20 `student.test.ts:1785-1869` — activateNow=true "unlocking invoice and assignment creation"]

## f. Luồng thay thế / mở rộng

- **f1 Gọi API trực tiếp với invited (hóa đơn):** 409 `{error:"Học viên chưa đồng ý tham gia lớp"}`. ✅ [S3 `kernel.ts:3069-3071`; S19 `kernel.test.ts:1516-1538` — wording assert đúng nguyên văn]
- **f2 Giao bài chứa invited:** 400 `{error:"student not enrolled"}`. ✅ [S3 `kernel.ts:1574-1577`; S19 `kernel.test.ts:7351-7399`]
- **f3 enrollmentId lạ/khác org (hóa đơn):** 404 `enrollment not found` — không phân biệt lạ vs foreign. ✅ [S19 `kernel.test.ts:1453-1514`]
- **f4 Hóa đơn của enrollment đã bị xóa:** vẫn tạo được nếu enrollmentId lookup… không — lookup thất bại → 404; record hóa đơn CŨ sống sót nhờ không FK. ✅ [S23 `invoice.ts:15-17`] 🔵 (hành vi create-sau-khi-xóa suy từ FK-less + lookup)

## g. Business rules & ràng buộc

BR-EL-006 (hóa đơn chỉ active; enrollmentId không FK), BR-EL-007 (giao bài chỉ roster active), BR-EL-011 (ô học phí invited hiển thị "—"). ✅

## h. Lỗi & phục hồi

E-EL-007 (409 hóa đơn — recovery: kích hoạt trước), E-EL-008 (400 giao bài — recovery: bỏ học viên hoặc kích hoạt). UI phòng thủ trước: picker ẩn invited. ✅
