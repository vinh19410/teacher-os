# UC-4: Hủy lời mời enrollment (chỉ invited)

> Reverse draft — truy vết: S3 `kernel.ts:1472-1505`; S7 `class-roster-tab.tsx:204-218,231-278`; S15 e2e `:302-374`; S19 `kernel.test.ts:7271-7324`.

## a. Mục tiêu & phạm vi

- Giáo viên rút lại lời mời tham gia lớp khi học viên CHƯA xác nhận; enrollment bị xóa hẳn (không có trạng thái "cancelled"); có thể mời lại sau. ✅ [S3 `kernel.ts:1472-1479` comment D5; S19 `kernel.test.ts:7296-7303`]

## b. Actor chính & stakeholder

- **Chính:** Giáo viên. ✅ [S7]
- **Stakeholder:** Học viên (thẻ "Chờ kích hoạt" biến mất khỏi portal sau refetch). 🔵 (suy từ overview đọc enrollment — xóa row → không còn thẻ)

## c. Tiền điều kiện

- Enrollment `invited` trong org (nút "Hủy lời mời" chỉ render cho invited). ✅ [S7 `class-roster-tab.tsx:188-218`]

## d. Trigger

- Nút "Hủy lời mời" → modal xác nhận "Hủy lời mời tham gia lớp?" → bấm "Hủy lời mời". ✅ [S7 `class-roster-tab.tsx:231-278`]

## e. Kịch bản chính

1. GV bấm "Hủy lời mời"; modal mô tả "sẽ bị xóa khỏi danh sách mời của lớp này. Bạn có thể mời lại sau." ✅ [S7 `class-roster-tab.tsx:237-243`]
2. Web DELETE `/api/enrollments/{id}`. ✅ [S7 `:268-274`; S10 `:268-272`]
3. Server lookup org-scoped; không thấy → 404 `enrollment not found`. ✅ [S3 `kernel.ts:1486-1494`]
4. Server kiểm `status !== 'invited'` → 409 `cannot delete active enrollment` (chặn nhánh active). ✅ [S3 `kernel.ts:1495-1497`]
5. Xóa row; trả 200 `{ok:true}`; roster mất dòng; mời lại cùng học viên thành công (201). ✅ [S3 `kernel.ts:1499-1504`; S19 `kernel.test.ts:7282-7303`; S15 `:347-374`]

## f. Luồng thay thế / mở rộng

- **f1 Hủy enrollment active:** 409 (server chặn); UI không bấm được vì nút chỉ có ở invited — phòng thủ 2 lớp. ✅ [S3; S7; S19 `kernel.test.ts:7305-7324`]
- **f2 Id lạ / khác org:** 404, không lộ. ✅ [S19 `kernel.test.ts:7326-7349`]
- **f3 Không có audit/notification rollback:** thông báo "Được mời vào lớp" cũ còn lại; mời lại tạo enrollment mới + key idempotency mới (không va chạm). ✅ [S26 `templates.ts:66-71`] 🟡 OQ-7

## g. Business rules & ràng buộc

BR-EL-005 (chỉ invited; xóa hẳn; mời lại được); org-scoped; không cascade hóa đơn (invoice giữ enrollmentId text). ✅ [S3; S23]

## h. Lỗi & phục hồi

E-EL-005 (404), E-EL-006 (409 active). Recovery: với 409 — không có đường hủy active (OQ-3); với 404 — refresh roster. ✅
