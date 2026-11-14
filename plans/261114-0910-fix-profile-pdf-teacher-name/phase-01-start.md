---
title: "Phase 01: TDD RED test, sửa PDF 02 & 04, render lại thumbnail 700x470 và verify POT"
status: pending
---

# Phase 01: Sửa tên giảng viên thành Đỗ Thục Mỹ trong PDF và thumbnail

## Task 1.1: Bổ sung TDD RED regression test cho toàn bộ 5 PDF và 5 thumbnail

- **Goal:** Thêm bài test tự động không dùng thư viện ngoài vào cuối `apps/profile/tests/index.test.mjs` để xác nhận toàn bộ 5 PDF không còn `"Đỗ Thị"` / `"Thị Thục"`, đồng thời xác nhận nội dung kỳ vọng sau khi sửa và kích thước `700x470` của cả 5 thumbnail JPEG. Chạy test trước khi sửa PDF để chứng minh trạng thái RED.
- **Target files and symbols:**
  - `apps/profile/tests/index.test.mjs` — thêm `import { inflateSync } from "node:zlib";` và test mới cuối file kiểm tra 5 PDF + 5 thumbnail bằng các helper `node:zlib` / `node:fs` nội bộ (parse `xref`, `/ToUnicode` `beginbfchar`/`beginbfrange`, `/Contents` `BT..ET`, UTF-16BE `<FEFF...>`, JPEG SOF `700x470`).
- **Steps:**
  1. Cập nhật import đầu file `apps/profile/tests/index.test.mjs` bổ sung `inflateSync` từ `node:zlib`.
  2. Viết helper giải mã PDF chỉ dùng Node built-in tuân thủ rule Biome (`apps/profile/tests/index.test.mjs`):
     - `/ToUnicode` CMap map **riêng theo từng font** trên mỗi trang (hỗ trợ cả `/Contents` dạng stream đơn hoặc mảng stream và `/XObject` `/Subtype /Form`, hỗ trợ 1-byte & 2-byte glyph codes, `beginbfchar` và cả 2 dạng `beginbfrange`: `<lo> <hi> <dst>` và `<lo> <hi> [<d1> ...]`, decode UTF-16BE bằng `Buffer`).
     - Hỗ trợ giải mã text cả toán tử `Tj` lẫn `TJ` (cùng `'`, `"`).
     - `parsePdfXref` kiểm tra nghiêm ngặt bảng `xref` 20 byte và offset từng object trên PDF `02` và `04`; có fallback quét object / XRef stream cho `01`, `03`, `05` nếu cấu trúc khác Skia m156.
     - `readJpegDimensions` walk marker JPEG chuẩn (nhảy qua `APPn`/`DQT`/`DHT`/`COM` bằng 2-byte length, dừng tại `SOS` `FF DA`, đọc kích thước tại `SOF0` `FF C0` và `SOF2` `FF C2`) để không khớp nhầm thumbnail EXIF trong `APP1`.
  3. Viết `test("teacher-profile PDFs and thumbnails use Đỗ Thục Mỹ without Đỗ Thị Thục Mỹ", ...)` kiểm tra:
     - Quét **toàn bộ object** (metadata `/Title`, `/Alt`, `/ActualText`, XMP `/Metadata`, và text giải mã toàn bộ trang) của cả 5 PDF: không chứa `Đỗ Thị` hay `Thị Thục`.
     - PDF `02` có `"Cô Đỗ Thục Mỹ"`, `"Đỗ Thục Mỹ"`, `"(“Ms. Thục Mỹ”)"` (hoặc regex khớp dấu ngoặc cong `\u201C...\u201D`), giữ nguyên `"Trang 01 / 06"` và `"Cảm ơn bạn đã theo dõi hồ sơ!"`.
     - PDF `04` có `"Cô Đỗ Thục Mỹ"`.
     - Toàn bộ 5 thumbnail là JPEG hợp lệ kích thước `700x470`.
  4. Chạy `pnpm --filter profile test` và ghi nhận failure (RED).
- **Success criteria:** `pnpm --filter profile test` thoát mã lỗi khác `0` vì phát hiện `"Đỗ Thị Thục Mỹ"` trong `02-...pdf` và `04-...pdf`, trong khi 33 test hiện có vẫn pass.
- **Verify:**
  - Command: `pnpm --filter profile test`
  - Expected: Exit code `1` (RED), chỉ test mới fail đúng lý do phát hiện `"Đỗ Thị"` / `"Thị Thục"` ở PDF `02` và `04`.

## Task 1.2: Vá PDF 02 & PDF 04 và render lại thumbnail 700x470

- **Goal:** Xóa chính xác token `"Thị "` khỏi Obj `1`, `358`, `107` (`MCID 2`, `15`, `16`), `346` (`MCID 46`, `47`) của PDF `02` và Obj `51` (`MCID 7`) của PDF `04`, dịch chuyển tọa độ `Td`/`Tm` tương ứng để chữ khít đúng bố cục, dựng lại PDF giữ nguyên thứ tự offset gốc và `xref` chuẩn 20 byte/dòng; sau đó render lại 2 thumbnail `700x470` JPEG bằng `pdfjs-dist` v6 + Playwright Chromium.
- **Target files and symbols:**
  - `apps/profile/public/assets/teacher-profile/pdf/02-Ho-So-Giang-Vien-Co-Thuc-My-VN.pdf` (Obj `1`, `358`, `107`, `346`)
  - `apps/profile/public/assets/teacher-profile/pdf/04-Bang-Gioi-Thieu-Fanpage-The-English-Corner.pdf` (Obj `51`)
  - `apps/profile/public/assets/teacher-profile/thumbs/02-Ho-So-Giang-Vien-Co-Thuc-My-VN.jpg`
  - `apps/profile/public/assets/teacher-profile/thumbs/04-Bang-Gioi-Thieu-Fanpage-The-English-Corner.jpg`
- **Steps:**
  1. Tạo script tạm trong scratch (`patch_pdfs.py`):
     - Quét và assert exact pre-patch decoded text & exact `BT..ET` lines cho **tất cả** target (`02` Obj `1`, `358`, `107` `MCID 2, 15, 16`, `346` `MCID 46, 47`; `04` Obj `51` `MCID 7`), đồng thời kiểm tra mọi object khác của `02` và `04` (`/Title`, `/Alt`, `/ActualText`, XMP `/Metadata`) không còn chứa `"Đỗ Thị"`.
     - Kiểm tra các block `BT..ET` sắp xóa không giữ `Tf` / `rg` / `RG` khác với block đứng sau; nếu có đổi font/màu thì bảo toàn Graphics State sang block kế tiếp.
     - Decode `<FEFF...>` sang `str` trước khi xóa `"Thị "` rồi encode lại UTF-16BE hex (tránh lệch nibble hoặc hoa/thường); áp dụng dịch tọa độ `dx = 21.11734` (`MCID 2`), `dx = 70.003968` (`MCID 15`/`16`), `dx = 19.887481` (`MCID 46`/`47`), `dx = 49.664978` (`04 MCID 7`). Assert post-patch text không có khoảng trắng kép `"  "`.
     - Thao tác thuần raw `bytes`, cập nhật `/Length <int>` inline, giữ nguyên thứ tự `sorted(offsets)` gốc, free entries `f` và subsection của `xref`, loại `/Prev` nếu có, xuất `xref` chuẩn 20 byte/dòng (`\n`).
  2. Chạy script scratch `render_thumbs_and_pot.mjs` resolve đường dẫn workspace (`apps/web/node_modules/pdfjs-dist` và `apps/e2e/node_modules/playwright`), phục vụ PDF + `pdf.worker.min.mjs` + `cmaps/` + `standard_fonts/` qua local HTTP server, fail-loud nếu Chromium `console`/`pageerror` có warning/error từ `pdfjs-dist`; render supersample `2x` bảo toàn tỷ lệ trang gốc rồi downscale mượt về `700x470` JPEG ghi đè `thumbs/02-...jpg` và `thumbs/04-...jpg`, đồng thời xác minh `pdfjs-dist` `getMetadata()` + `getTextContent()` cho cả 5 PDF.
  3. Kiểm tra trực quan bằng `read_file` cả 2 PDF (trang 1 & trang 6 của PDF `02`, trang 1 của PDF `04`) và cả 2 thumbnail JPG (chú ý khoảng cách giữa `"Đỗ"` và `"Thục"`, không dính/thưa chữ).
  4. Chạy `pnpm --filter profile test && pnpm --filter profile build` (GREEN).
- **Success criteria:** PDF `02` và `04` đọc mượt trên `pdfjs-dist` không warning/error, text sạch `"Đỗ Thục Mỹ"`, bố cục đẹp không đè/lệch chữ; thumbnail `700x470` sắc nét; toàn bộ `apps/profile` test & build pass.
- **Verify:**
  - Command: `pnpm --filter profile test && pnpm --filter profile build`
  - Expected: Exit code `0`, toàn bộ test pass, build tạo `apps/profile/dist/` thành công.

## Task 1.3: Tạo ảnh bằng chứng POT và chạy toàn bộ local gates

- **Goal:** Chụp ảnh POT sắc nét cho các trang PDF đã sửa, 2 thumbnail mới, và phần `#ho-so-pdf` của `apps/profile` ở 3 viewport (`1440x900`, `768x1024`, `375x812`), kiểm tra trực quan, và vượt qua toàn bộ gate chất lượng local.
- **Target files and symbols:**
  - `plans/reports/<ISSUE_NUM>-pdf02-page1-fixed.png`
  - `plans/reports/<ISSUE_NUM>-pdf02-page6-fixed.png`
  - `plans/reports/<ISSUE_NUM>-pdf04-page1-fixed.png`
  - `plans/reports/<ISSUE_NUM>-profile-1440x900.png`
  - `plans/reports/<ISSUE_NUM>-profile-768x1024.png`
  - `plans/reports/<ISSUE_NUM>-profile-375x812.png`
  - `CHANGELOG.md`
  - `plans/journals/2026-11-14-ship-<ISSUE_NUM>-profile-pdf-teacher-name.md`
- **Steps:**
  1. Render PNG độ phân giải cao từ các PDF đã vá và chụp screenshot `#ho-so-pdf` qua `createProfileServer` (nhớ click mở `<details id="ho-so-pdf">` trước khi chụp) tại 3 viewport, lưu vào `plans/reports/`.
  2. Mở từng ảnh PNG bằng `read_file` xác nhận không trắng/vỡ layout và tên `"Đỗ Thục Mỹ"` hiển thị rõ.
  3. Kiểm tra `node -v` là `v24`, chạy `pnpm check:fix && pnpm exec biome check . && pnpm --filter profile test && pnpm --filter profile build && pnpm check-types && pnpm build && pnpm test`.
- **Success criteria:** Mọi gate local exit code `0`; không có file script tạm rò rỉ trong repo; ảnh POT rõ ràng; sau deploy verify SHA-256 live của 4 asset qua `curl`.
- **Verify:**
  - Command: `pnpm exec biome check . && pnpm --filter profile test && pnpm --filter profile build && pnpm check-types && pnpm build && pnpm test`
  - Expected: Exit code `0` cho toàn bộ chuỗi lệnh.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
