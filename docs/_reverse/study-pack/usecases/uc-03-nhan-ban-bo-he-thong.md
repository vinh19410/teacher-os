---
feature: study-pack
type: reverse-usecase
uc: UC-03
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# UC-03 — Nhân bản bộ đề hệ thống về tổ chức

## Mô tả

Giáo viên lấy một bộ đề hệ thống về thành bộ của trung tâm để tuỳ biến và gán
sau. Phép nhân bản lặp lại không tạo thêm bản sao.

## Actor

- Chính: Giáo viên (nhóm vai "chốt bài").

## Tiền điều kiện

- Bộ đề hệ thống đích đang "Sẵn sàng"; trung tâm chưa có bản sao (hoặc đã có —
  xem nhánh idempotent).

## Hậu điều kiện

- Trung tâm có tối đa một bản sao mỗi bộ hệ thống; mục của bản sao giữ con trỏ
  nguồn thư viện (chưa vật hoá đề).

## Luồng chính

1. Giáo viên bấm "Nhân bản về trung tâm" trên thẻ bộ hệ thống. ✅
   apps/web/src/routes/_auth/assignments/packs.tsx:196-208
2. Máy chủ kiểm vai ghi và xác nhận bộ hệ thống đã sẵn sàng. ✅
   apps/server/src/routes/study-pack.ts:271-282
3. Máy chủ tạo bản sao thuộc trung tâm với `source_pack_id` trỏ về bản gốc;
   chèn bộ + mục trong các lô nhỏ theo trần D1. ✅
   apps/server/src/routes/study-pack.ts:269-376; ✅
   apps/server/src/lib/study-pack-clone.ts:30-35, :910-940
4. Nếu trung tâm đã có bản sao (khoá duy nhất org+source chặn trùng), trả lại
   bản sao cũ kèm cờ idempotent, mã 201. ✅
   apps/server/src/routes/study-pack.ts:290-302

## Luồng thay thế / lỗi

- Sai vai → E-03; bộ không thấy → E-07; ghi hụt → E-30 (500); lỗi UI → E-34.
- Hai người nhân bản cùng lúc: một bên vào nhánh idempotent. ✅
  apps/server/src/routes/study-pack.ts:348-365

## Quy tắc nghiệp vụ liên quan

- BR-01: mỗi trung tâm tối đa một bản sao mỗi bộ hệ thống.

## Truy vết

| Loại | Mã |
|---|---|
| FR | FR-01, FR-03, FR-14 |
| NFR | NFR-02, NFR-03, NFR-04 |
| BR | BR-01 |
| E | E-01, E-03, E-07, E-30, E-34 |
| Luồng | F3 |
| Câu hỏi mở | OQ-11 (201 không phân biệt mới/cũ) |

## Ghi chú

- Bản sao chưa vật hoá đề; đề thư viện chỉ sinh thành bài làm lúc gán vào lớp
  (UC-04). ✅
  plans/261101-1357-533-study-pack-scheduled-release/phase-03-pack-library-and-org-api.md:71
