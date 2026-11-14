# Plan Journal — Sửa tên giảng viên Đỗ Thục Mỹ trong PDF & thumbnail (`apps/profile`)

- **Ngày:** 2026-11-14
- **Nhánh:** `fix/profile-pdf-teacher-name` (từ `origin/develop`)
- **Plan:** [plan.md](../261114-0910-fix-profile-pdf-teacher-name/plan.md)

## Quyết định chốt phạm vi & Kiến trúc
1. Sửa triệt để cả **2 file PDF** chứa `"Đỗ Thị Thục Mỹ"` (`02-Ho-So-Giang-Vien-Co-Thuc-My-VN.pdf` và `04-Bang-Gioi-Thieu-Fanpage-The-English-Corner.pdf`) cùng **2 thumbnail `700x470`** tương ứng (`thumbs/02-...jpg`, `thumbs/04-...jpg`), đồng thời bổ sung TDD regression test zero-dependency trong `apps/profile/tests/index.test.mjs` quét đủ 5 PDF và 5 thumbnail.
2. Trong Checkpoint 1 Red-Team với `kongming`, phát hiện và xử lý kịp 5 điểm quan trọng trước khi code:
   - Khớp chính xác chuỗi thực tế Trang 1 PDF `02` (`"Cô Đỗ Thị Thục Mỹ • Chuyên Gia..."`, `"Đỗ Thị Thục Mỹ"`, `"(“Ms. Thục Mỹ”)"` với ngoặc kép cong).
   - Stage 2 `--both` tách nhánh `release/fix-profile-pdf-teacher-name` từ `origin/main` chỉ nhận 4 binary + riêng block test mới (không kéo mù quáng diff từ `develop` nếu `main` chưa có `#706`).
   - Giữ nguyên Graphics State (`Tf`, `rg`/`RG`), thứ tự offset/sub-section/free entry của `xref` 20-byte, thao tác raw `bytes` trong `patch_pdfs.py`.
   - Zero-dep parser tách `/ToUnicode` CMap riêng theo từng font trên mỗi trang, hỗ trợ `Tj` + `TJ` + 2 dạng `beginbfrange` + marker JPEG `SOF0`/`SOF2`.
   - Kiểm tra SHA-256 live trực tiếp sau deploy vì `Smoke check profile` trong `deploy.yml` chỉ check HTML.
