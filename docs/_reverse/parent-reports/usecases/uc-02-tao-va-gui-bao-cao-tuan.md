---
feature: parent-reports
type: reverse-usecase
uc: UC-02
status: draft
updated: "2026-11-12"
---

# UC-02 — Tạo và gửi báo cáo tuần từ trang báo cáo

a. **Mục tiêu:** Giáo viên soạn nội dung tuần của một học viên và đánh dấu đã gửi
   cho phụ huynh qua kênh dự định (Zalo OA/Email); hoặc lưu nháp để soạn tiếp. 🟡
   (định vị "sổ ghi + đánh dấu" thay vì "gửi thật" — kênh chưa nối; xem OQ-01, OQ-02)
b. **Actor:** Giáo viên (web, đã đăng nhập).
c. **Tiền điều kiện:** Cụm bật; đang ở trang /reports; (khuyến nghị) tổ chức có ít
   nhất một học viên.
d. **Luồng chính (truy vấn F3):**
   1. Bấm "+ Tạo báo cáo tuần" → modal "Tạo báo cáo tuần" mở với form rỗng (FR-07,
      FR-08).
   2. Chọn "Học viên", nhập "Chu kỳ" (gợi ý "VD: 01–07/09"), nhập "Nội dung báo
      cáo", chọn "Gửi qua" (mặc định "Zalo OA (Chưa kết nối)") (FR-08).
   3. Bấm "Gửi báo cáo" → kiểm tra nội dung bắt buộc (FR-09) → ghi xuống máy chủ với
      trạng thái đã gửi; máy chủ đóng mốc "Gửi lúc" theo giờ Việt Nam (FR-12, BR-03).
   4. Thành công → form xóa trắng, modal đóng; bảng và nhật ký cập nhật từ dữ liệu
      mới (FR-10).
e. **Luồng thay thế:**
   - 3a. Bấm "Lưu nháp": nội dung được phép rỗng; trạng thái nháp, không mốc gửi,
     KHÔNG vào nhật ký (BR-03).
   - 2a. Thiếu học viên/chu kỳ → câu lỗi tại chỗ "Chọn học viên trước khi lưu." /
     "Nhập chu kỳ báo cáo (VD: 01–07/09)." (E-09, E-10).
   - 3b. Gửi khi nội dung rỗng → "Nhập nội dung báo cáo trước khi gửi." (E-11); máy
     chủ cũng từ chối độc lập (BR-04).
   - 4a. Máy chủ từ chối → modal GIỮ nguyên chữ đã gõ + "Không gửi được báo cáo — thử
     lại." / "Không lưu được nháp — thử lại." (E-12, E-13).
   - 4b. Mất mạng/không rõ kết quả → "Không chắc báo cáo đã lưu — kiểm tra danh sách
     trước khi thử lại.", không đóng modal (E-14).
   - 4c. Học viên không tồn tại/khác tổ chức → máy chủ từ chối 400 (E-07).
f. **Hậu điều kiện:** Một dòng báo cáo mới thuộc tổ chức; gửi → có mốc gửi và vào
   nhật ký; nháp → không mốc gửi, không vào nhật ký.
g. **Quy tắc liên quan:** FR-07..FR-13, FR-15; BR-01..BR-04, BR-06..BR-08.
h. **Truy vết:** apps/web/src/components/modals/create-report-modal.tsx:1-142;
apps/web/src/lib/repos/kernel.ts:181-186, 393-421;
apps/server/src/routes/reporting/index.ts:42-101;
packages/api/src/contracts.ts:1298-1315;
apps/web/src/components/modals/create-report-modal.test.tsx:59-149;
apps/server/src/kernel.test.ts:2660-2756.
