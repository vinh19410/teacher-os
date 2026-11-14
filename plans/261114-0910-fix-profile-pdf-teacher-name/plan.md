---
title: "Sửa tên giảng viên Đỗ Thục Mỹ trong PDF và thumbnail hồ sơ (apps/profile)"
description: "Loại bỏ chữ 'Thị ' dư thừa trong 02-Ho-So-Giang-Vien-Co-Thuc-My-VN.pdf và 04-Bang-Gioi-Thieu-Fanpage-The-English-Corner.pdf, tạo lại thumbnail 700x470, và bổ sung TDD regression test không phụ thuộc thư viện ngoài."
status: pending
priority: P1
effort: 2h
branch: fix/profile-pdf-teacher-name
tags: [profile, pdf, tdd, bug, asset]
created: 2026-11-14
---

# Plan: Sửa tên giảng viên thành Đỗ Thục Mỹ trong PDF và thumbnail (`apps/profile`)

## Outcome & Advisor Scope Lock

- **Mục tiêu gốc:** Sửa tên giảng viên từ `"Đỗ Thị Thục Mỹ"` thành `"Đỗ Thục Mỹ"` (và `"Cô Đỗ Thục Mỹ"`) trên bộ tài liệu PDF công khai tại `apps/profile/public/assets/teacher-profile/`.
- **Phạm vi đã khóa với người dùng (`ask_question`):**
  1. Sửa **cả 2 PDF bị sai**:
     - `apps/profile/public/assets/teacher-profile/pdf/02-Ho-So-Giang-Vien-Co-Thuc-My-VN.pdf` (Metadata `/Title` Obj `1`, StructElem `/Alt` Obj `358`, Page 1 `/Contents` Obj `107` `MCID 2`, `MCID 15`, `MCID 16`, và Page 6 `/Contents` Obj `346` `MCID 46`, `MCID 47`).
     - `apps/profile/public/assets/teacher-profile/pdf/04-Bang-Gioi-Thieu-Fanpage-The-English-Corner.pdf` (Page 1 `/Contents` Obj `51` `MCID 7`).
  2. Render lại **cả 2 thumbnail `700x470` JPEG** tương ứng:
     - `apps/profile/public/assets/teacher-profile/thumbs/02-Ho-So-Giang-Vien-Co-Thuc-My-VN.jpg`
     - `apps/profile/public/assets/teacher-profile/thumbs/04-Bang-Gioi-Thieu-Fanpage-The-English-Corner.jpg`
  3. Bổ sung **TDD regression test không phụ thuộc dependency ngoài** trong `apps/profile/tests/index.test.mjs` quét toàn bộ 5 file PDF và 5 file thumbnail `700x470`.
  4. **Chiến lược ship `--both` Stage 2 (`main`):**
     - Trên Stage 1 (`fix/profile-pdf-teacher-name`), tách riêng commit implementation (chỉ gồm 4 file binary PDF/JPEG + phần test mới trong `apps/profile/tests/index.test.mjs`) khỏi commit docs/plan/reports/journal/CHANGELOG.
     - Trên Stage 2 (`release/fix-profile-pdf-teacher-name` tách từ `origin/main`): đối chiếu `git diff origin/main..origin/develop -- apps/profile/`, **chỉ checkout 4 file binary từ `origin/develop`**, còn `apps/profile/tests/index.test.mjs` chỉ merge/cherry-pick đúng block test PDF/thumbnail mới lên nền file của `origin/main` (tránh kéo nhầm test phụ thuộc `#706`/`#699` nếu `main` chưa có).
     - Vì `.github/workflows/deploy.yml` (`Smoke check profile`) chỉ kiểm tra HTML, bước verify live sau Stage 1 (staging) và Stage 2 (prod `https://msmy.io.vn`) bắt buộc `curl` trực tiếp kiểm tra HTTP 200 + SHA-256 khớp file local cho cả 4 asset PDF/JPG.

## Root Cause (Đã chứng minh)

- Commit `99416863` đã sửa HTML/JS của `apps/profile/public/` sang `"Đỗ Thục Mỹ"`, nhưng bỏ sót 2 file PDF dựng từ Skia/PDF m156 (`02-...pdf` và `04-...pdf`) cùng 2 ảnh thumbnail JPEG `700x470` đi kèm.
- Các PDF `01`, `03`, `05`, `apps/profile/public/index.html`, và `apps/profile/public/noi-bo/index.html` đã đúng.

## Phases

| Phase | File | Mô tả | Status |
|---|---|---|---|
| Phase 01 | [phase-01-start.md](./phase-01-start.md) | TDD RED test, vá PDF 02 & 04, render lại thumbs 700x470, chụp POT & verify gates | pending |

## Success Criteria

1. Không còn `"Đỗ Thị"` hoặc `"Thị Thục"` trong metadata (`/Title`), alt text (`/Alt`), hay luồng văn bản giải mã (`/ToUnicode` + `/Contents`) của cả 5 PDF.
2. Page 1 & Page 6 của PDF `02` và Page 1 của PDF `04` hiển thị `"Đỗ Thục Mỹ"` / `"Cô Đỗ Thục Mỹ"` cân chỉnh đúng khoảng cách (`Td` / `Tm`), không đè chữ, giữ nguyên `"Trang 01 / 06"` và `"Cảm ơn bạn đã theo dõi hồ sơ!"`.
3. Cả 5 thumbnail đều là JPEG hợp lệ kích thước `700x470`; `thumbs/02` và `thumbs/04` phản ánh đúng tên mới.
4. `pnpm exec biome check .`, `pnpm check-types`, `pnpm build`, `pnpm test`, `pnpm --filter profile test` và `pnpm --filter profile build` đều pass với exit code `0`.

## Red Team Review

Đánh giá từ `kongming` (Checkpoint 1) — **Conditional GO → Unlocked** sau khi áp dụng toàn bộ 5 hardening points:
1. **[BLOCKER đã vá]** Chuỗi hiển thị thực tế trên Trang 1 PDF `02`: `MCID 2` là `"Cô Đỗ Thị Thục Mỹ • Chuyên Gia Đào Tạo IELTS Học Thuật & Tiếng Anh Doanh Nghiệp"`, `MCID 15` là `"Đỗ Thị Thục Mỹ"` (không có `"MS."`), `MCID 16` dùng ngoặc kép cong `“(Ms. Thục Mỹ)”` (`\u201C...\u201D`). Đã chỉnh assertion Task 1.1 khớp 100% thực tế.
2. **[CRITICAL đã vá]** Stage 2 `--both`: Không dùng `git checkout origin/develop -- apps/profile/tests/index.test.mjs` mù quáng nếu `origin/main` chưa có các thay đổi `index.html` của `#706`; chỉ checkout 4 file binary và merge riêng block test PDF/thumb mới lên `origin/main`.
3. **[HIGH đã vá]** PDF binary patcher: assert pre-patch toàn bộ target (`02` Obj `1`, `358`, `107`, `346`; `04` Obj `51` và quét mọi object khác của `04`), kiểm tra Graphics State (`Tf`, `rg`/`RG`) giữa các `BT..ET`, decode/encode UTF-16BE bằng Python `str` để không lệch biên hex, giữ nguyên thứ tự offset + free entries (`f`) + subsection của `xref` (20 byte/dòng `\n`), cập nhật inline `/Length`, bỏ `/Prev`, thao tác thuần raw `bytes`.
4. **[HIGH đã vá]** Zero-dep test parser: Map `/ToUnicode` **riêng theo từng font trên mỗi trang**, hỗ trợ mảng `/Contents` & Form `/XObject`, hỗ trợ cả `Tj` và `TJ`, cả 2 dạng `beginbfrange` (`<lo> <hi> <dst>` & `[<d1> ...]`), UTF-16BE qua `Buffer`, walk marker JPEG hỗ trợ `SOF0`/`SOF2` tránh `APP1` EXIF, fallback đọc object cho `01`/`03`/`05` nếu khác định dạng `xref` trong khi assert chặt `xref` 20-byte ở `02`/`04`.
5. **[MEDIUM đã vá]** `render_thumbs_and_pot.mjs` resolve module từ `apps/web/node_modules/pdfjs-dist` và `apps/e2e/node_modules/playwright`, phục vụ qua HTTP local, supersample `2x` trước khi xuất `700x470`, fail-loud khi có console warning/error từ `pdfjs-dist`, mở `<details id="ho-so-pdf">` trước khi chụp `#ho-so-pdf` ở 3 viewport, và verify live SHA-256 sau deploy.
