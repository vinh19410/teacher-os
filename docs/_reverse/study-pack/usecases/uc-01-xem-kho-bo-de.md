---
feature: study-pack
type: reverse-usecase
uc: UC-01
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# UC-01 — Xem kho bộ đề

## Mô tả

Giáo viên mở trang kho bộ đề để xem các bộ của trung tâm mình và bộ đề hệ
thống, kèm nhãn trạng thái và số ngày/số mục của từng bộ.

## Actor

- Chính: Giáo viên (nhóm vai "rà chấm" đủ để xem).

## Tiền điều kiện

- Đã đăng nhập; đã vào mục "Bộ đề tự học" từ trang bài tập.

## Hậu điều kiện

- Không đổi dữ liệu.

## Luồng chính

1. Giáo viên bấm nút "Bộ đề tự học" ở trang bài tập. ✅
   apps/web/src/routes/_auth/assignments/index.tsx:276-287
2. Hệ thống lấy danh sách theo hai phạm vi: bộ của trung tâm và thư viện hệ
   thống (chỉ bộ đã sẵn sàng). ✅ apps/server/src/routes/study-pack.ts:75-98, :87
3. Hệ thống kiểm vai xem (nhóm "rà chấm"); thiếu thì 403. ✅
   apps/server/src/routes/study-pack.ts:77-78
4. Mỗi bộ hiển thị nhãn trạng thái "Sẵn sàng"/"Nháp" và số ngày, số mục. ✅
   apps/web/src/routes/_auth/assignments/packs.tsx:439-443; ✅
   apps/server/src/lib/study-pack-clone.ts:812-900
5. Bộ hệ thống hiển thị nút "Nhân bản về trung tâm"; bộ của trung tâm hiển thị
   nút sửa/xoá. ✅ apps/web/src/routes/_auth/assignments/packs.tsx

## Luồng thay thế / lỗi

- Chưa đăng nhập → E-01 (401).
- Không thuộc nhóm vai xem → E-02 (403).
- Mở chi tiết một mã không tồn tại / bộ trung tâm khác / bộ hệ thống chưa sẵn
  sàng → E-07 (404).
- Lỗi mạng/server khi tải → E-34 (toast).

## Quy tắc nghiệp vụ liên quan

- BR-01: bộ hệ thống là tài sản dùng chung, xem được nhưng sửa không được.

## Truy vết

| Loại | Mã |
|---|---|
| FR | FR-01, FR-02, FR-05, FR-06 |
| NFR | NFR-07, NFR-08 |
| BR | BR-01 |
| E | E-01, E-02, E-07, E-34 |
| Luồng | F1 |
| Câu hỏi mở | — |

## Ghi chú

- Màn hình phải dùng được ở ba khổ 1440/768/375 (e2e đo tràn ngang). ✅
  apps/e2e/specs/study-pack.spec.ts:14-40
