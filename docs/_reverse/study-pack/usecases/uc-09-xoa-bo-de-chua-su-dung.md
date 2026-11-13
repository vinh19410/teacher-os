---
feature: study-pack
type: reverse-usecase
uc: UC-09
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# UC-09 — Xoá bộ đề chưa sử dụng

## Mô tả

Giáo viên xoá một bộ đề của trung tâm. Hệ thống chặn xoá khi bộ đã từng được
gán cho bất kỳ lớp nào.

## Actor

- Chính: Giáo viên (nhóm vai "chốt bài").

## Tiền điều kiện

- Bộ đề thuộc trung tâm của người dùng.

## Hậu điều kiện

- Bộ đề và mục bị xoá, hoặc bị chặn với thông báo rõ lý do.

## Luồng chính

1. Giáo viên bấm xoá trên thẻ bộ đề và xác nhận. ✅
   apps/web/src/routes/_auth/assignments/packs.tsx:216-227
2. Máy chủ kiểm vai ghi. ✅ apps/server/src/routes/study-pack.ts:235-236
3. Máy chủ đếm lượt gán lớp tham chiếu bộ (kể cả lượt đã huỷ); còn tham chiếu
   thì trả 409. ✅ apps/server/src/routes/study-pack.ts:248-258
4. Không còn tham chiếu: xoá bộ và mục. ✅
   apps/server/src/routes/study-pack.ts:233-267
5. UI hiện đúng câu thoại "Không thể xoá bộ đề đã gán cho lớp học." khi gặp
   409. ✅ apps/web/src/routes/_auth/assignments/packs.tsx:220

## Luồng thay thế / lỗi

- Sai vai → E-03; bộ không thấy → E-07; còn lượt gán → E-09 (409); lỗi UI →
  E-34.

## Quy tắc nghiệp vụ liên quan

- BR-09: dữ liệu đang được dùng thì không xoá (chặn cả khi lượt gán đã huỷ, vì
  bài làm cũ vẫn quy chiếu).

## Truy vết

| Loại | Mã |
|---|---|
| FR | FR-01, FR-03, FR-13 |
| NFR | NFR-03 |
| BR | BR-09 |
| E | E-01, E-03, E-07, E-09, E-34 |
| Luồng | F9 |
| Câu hỏi mở | — |

## Ghi chú

- Phía thư viện hệ thống, admin xoá đề trung tâm cũng đếm lượt tham chiếu
  tương tự (tính năng khác, cùng nguyên tắc BR-09). ✅
  apps/server/src/routes/admin-library.ts:1214-1241
