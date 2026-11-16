# Ship Journal — Issue #710: Sửa tên giảng viên Đỗ Thục Mỹ trong PDF & thumbnail (`apps/profile`)

- **Ngày:** 2026-11-14
- **Issue:** [#710](https://github.com/vinh19410/teacher-os/issues/710)
- **Nhánh Stage 1 (`develop`):** `fix/profile-pdf-teacher-name`
- **Nhánh Stage 2 (`main`):** `release/fix-profile-pdf-teacher-name`
- **Plan:** [plan.md](../261114-0910-fix-profile-pdf-teacher-name/plan.md)

## Tóm tắt thực thi TDD & Kiểm chứng
1. **TDD RED:** Bổ sung zero-dependency PDF/CMap/xref/JPEG regression test vào cuối [index.test.mjs](../../apps/profile/tests/index.test.mjs), chạy `pnpm --filter profile test` ghi nhận `33 pass / 1 fail` đúng lỗi `"Đỗ Thị Thục Mỹ"` trong metadata PDF `02`. Phát hiện thêm `05-Ms-Thuc-My-CV-1Page-Pure-EN.jpg` là portrait `495x700` nên khóa kích thước từng thumbnail riêng trong map kỳ vọng.
2. **TDD GREEN (PDF & Thumbnails):**
   - Vá trực tiếp nhị phân `02-Ho-So-Giang-Vien-Co-Thuc-My-VN.pdf` (Obj `1`, `358`, `107` `MCID 2, 15, 16`, `346` `MCID 46, 47`) và `04-Bang-Gioi-Thieu-Fanpage-The-English-Corner.pdf` (Obj `51` `MCID 7`), bảo toàn thứ tự offset gốc, `xref` 20B và `/Length` inline.
   - Render lại 2 thumbnail `700x470` (`thumbs/02-...jpg`, `thumbs/04-...jpg`) qua Playwright Chromium + `pdfjs-dist` v6 (`2x` supersampled, `0` console error/warning) cùng 6 ảnh POT (`plans/reports/710-*.png`).
3. **Review & Hardening:**
   - Local `code-reviewer`: `0 Critical, 4 Important, 4 Minor`. Đã xử lý triệt để cả 8 điểm trong `apps/profile/tests/index.test.mjs` (`.normalize("NFC")`, negative lookahead `/Length` + check `endstream` + `trailer /Size` khi `strictXref`, duyệt cây `/Pages /Kids`, tên font/XObject tổng quát, `TJ` literal & Form XObject, tách check hero Trang 1, pad hex lẻ theo chuẩn PDF, `parenDepth`, guard `SOF0`/`SOF2`).
   - `kongming` Checkpoint 2: **GO** cho Stage 1 Pre-Ship sau khi rà soát code & 8 ảnh render.
4. **Gates local đã pass:**
   - `pnpm exec biome check apps/profile/tests/index.test.mjs` (`0` error, `0` warning)
   - `pnpm exec biome check .` (exit `0`, `1416 files`)
   - `pnpm --filter profile test` (`34/34 pass`)
   - `pnpm --filter profile build` (exit `0`)
   - `pnpm check-types && pnpm build && pnpm test` (exit `0`)
