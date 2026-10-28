---
type: test-strategy
feature: selfomy-alignment
status: draft
updated: 2026-10-27
links:
  - docs/selfomy-alignment/srs/selfomy-alignment-spec.md
  - docs/selfomy-alignment/userstories/us-001.md
---

# Test Strategy — selfomy-alignment

## Durable

| Hạng mục | Giá trị | Cập nhật |
|---|---|---|
| Ngôn ngữ checklist / test case | Tiếng Việt (giữ nguyên label nút, tên field gốc) | 2026-10-27 |
| Đối tượng bàn giao | QC nội bộ (chạy tay + chọn case tự động hoá) | 2026-10-27 |
| Môi trường | `apps/web` (Teacher / Center Workspace) | 2026-10-27 |
| Device / viewport | `1440×900`, `768×1024`, `375×812` + điều hướng bàn phím (`NFR-selfomy-alignment-008`) | 2026-10-27 |
| Ngưỡng NFR | `NFR-selfomy-alignment-001`: 95% thao tác tải/lọc `≤ 2 giây` với `50 lớp` và `1.000 học viên`; `NFR-selfomy-alignment-008`: điểm danh ngày `≥ 5 lớp` trong `≤ 2 phút` | 2026-10-27 |
| Xử lý nguồn thiếu | Không giả định kết quả mong đợi, wording hay side-effect; chỗ thiếu ghi thành câu hỏi mở và chặn obligation tương ứng | 2026-10-27 |

## Per-run

| Lượt | Scope | Mục đích | Profile | Baseline |
|---|---|---|---|---|
| 2026-10-27 | `us-001` | Kiểm thử chức năng mới | Core-functional + Performance | Toàn bộ US-001 (AC-001..003) |
