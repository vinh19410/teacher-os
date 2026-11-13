# UC-02 — Tạo template từ file Excel/CSV

## a. Tổng quan

| Hạng mục | Giá trị |
|----------|---------|
| ID | UC-02 |
| Tên | Nhập nhanh nội dung từ Excel/CSV ngay lúc tạo template |
| Mục tiêu | Tạo giáo trình nhiều buổi trong một lần nộp file, không gõ tay |
| Mức | User-goal |
| Kích hoạt | Nút "Chọn file" trong modal "Tạo syllabus mới" |
| Nguồn chính | apps/web/src/lib/syllabus-import.ts; apps/web/src/components/modals/add-syllabus-modal.tsx:58-70, 185-236; apps/e2e/specs/syllabus-excel-csv-import.spec.ts:12-69 |

## b. Actors

- **Chính:** Giáo viên — ✅
- **Phụ:** papaparse (CSV), read-excel-file (XLSX) — thư viện client — ✅ [S9:240-258]

## c. Điều kiện tiên quyết

- Modal tạo đang mở; file .csv/.xlsx ≤ 2 MB.

## d. Luồng chính

1. GV bấm "Chọn file" (hoặc tải "Tải file mẫu" để lấy format chuẩn: CSV UTF-8 BOM + CRLF, 5 cột). ✅ [S14:185-211][S9:276-310]
2. Browser parse 100% client-side; file không upload. ✅ [S9:1-8]
3. Parser chuẩn hoá từng dòng về 5 cột (pad thiếu, cắt thừa, trim); ô Date → lỗi dòng. ✅ [S9:29-45]
4. Parser nhận diện header: file v2 (ô 5 "Trạng thái") / v3 (cột 3 "Buổi học") → chặn với đúng 1 lỗi tường minh; header mới "Module" → bỏ dòng đầu. ✅ [S9:81-108]
5. Dòng dữ liệu nhóm theo module (tên rỗng kế thừa module trước; trùng tên liền kề gộp nhóm). ✅ [S9:140-171]
6. Buổi tạo khi có Mục tiêu/Tài liệu khác rỗng HOẶC Loại ≠ buổi thường; tên tự sinh `Buổi {n}` đánh số xuyên file; Loại map: giữa kỳ→midterm, cuối kỳ→final. ✅ [S9:61-67, 173-204]
7. Preview bảng 5 cột (#, Module, Mục tiêu, Tài liệu, Loại) kèm "N module · M buổi học"; ô "Số buổi dự kiến" tự fill và khóa. ✅ [S19:7-19, 78-79][S14:222-236][S36:51]
8. GV điền metadata còn lại và bấm "Tạo" → chạy UC-01 bước 5-8 với `modules` kèm payload. ✅ [S14:102-116]

## e. Luồng thay thế

- **A1 — File legacy 4 cột (v3):** vẫn import như cũ (tương thích ngược, có test regression). ✅ [S9:194-196][S36:72-96][S45:570]
- **A2 — Nhiều lỗi dòng:** gom tất cả lỗi, preview hiển thị tối đa 100 + dòng "...và N lỗi khác". ✅ [S19:53-60]
- **A3 — Gỡ file (X):** ở cả nhánh ok và lỗi; gỡ không hoàn tác giá trị "Số buổi dự kiến" user đã thấy (giữ input). ✅ [S19:20-31][S14:213-215][S36:146-185]
- **A4 — CSV phân tách `;` (Excel locale VN) và BOM:** papaparse tự xử lý; BOM strip khỏi ô đầu. ✅ [S45:641, 667][S9:251-254]

## f. Ngoại lệ

| Tình huống | Phản hồi hệ thống | Nguồn | Nhãn |
|-----------|-------------------|-------|------|
| Sai đuôi file | "Chỉ nhận file .csv hoặc .xlsx." | apps/web/src/lib/syllabus-import.ts:233-234 | ✅ |
| > 2 MB | "File vượt giới hạn 2 MB." | apps/web/src/lib/syllabus-import.ts:236-237 | ✅ |
| CSV quote lỗi | "Dòng {n}: cú pháp CSV không hợp lệ" | apps/web/src/lib/syllabus-import.ts:242-249 | ✅ |
| Exception parse | "Không đọc được file. Kiểm tra file Excel/CSV hợp lệ." | apps/web/src/lib/syllabus-import.ts:260-265 | ✅ |
| File template cũ | 'File dùng template cũ (cột "Trạng thái"/"Buổi học" đã bỏ)...' | apps/web/src/lib/syllabus-import.ts:86-104 | ✅ |
| Loại lạ / từ vựng v2 | "Dòng {n}: loại buổi không hợp lệ..." / "có thể bạn đang dùng template cũ..." | apps/web/src/lib/syllabus-import.ts:125-137 | ✅ |
| Thiếu module đầu | "Dòng {n}: thiếu tên module" | apps/web/src/lib/syllabus-import.ts:143-145 | ✅ |
| Vượt giới hạn ký tự | "tên module vượt 500 / mô tả/mục tiêu/tài liệu vượt 10.000" | apps/web/src/lib/syllabus-import.ts:153-193 | ✅ |
| Không có dòng dữ liệu | "Không có dòng dữ liệu." | apps/web/src/lib/syllabus-import.ts:208 | ✅ |
| Trên 500 mục | "File có {n} mục (module + buổi học), vượt giới hạn 500." | apps/web/src/lib/syllabus-import.ts:212-219 | ✅ |
| Server vẫn từ chối (caller trực tiếp bỏ qua client) | 400 opaque + zod messages | packages/api/src/contracts.ts:185-246 | ✅ |

## g. Hậu điều kiện

- Template có cây nội dung đúng thứ tự file; status mọi bài = "upcoming" từ parser. ✅ [S9:196-203]
- `totalLessons` = lessonCount từ file; ô số buổi khóa. ✅ [S14:111-113][S36:160-162]

## h. Quy tắc nghiệp vụ & kiểm chứng

- BR-016 (mirror 500/10.000), BR-017 (all-or-nothing file), BR-018 (ô Date lỗi). ✅
- Test: apps/web/src/lib/syllabus-import.test.ts (28 test: header, numbering, nhóm module, v2/v3, cap biên 500/501, delimiter `;`, BOM, .xls chặn, 2MB, quote lỗi); e2e apps/e2e/specs/syllabus-excel-csv-import.spec.ts:12-69 (CSV + XLSX cùng fixture), :72-96 (legacy), :146-185 (gỡ file). ✅
- Ghi chú: file fixture v4 do script `apps/e2e/scripts/regen-syllabus-v4-fixture.mjs` mirror 1:1 SAMPLE_ROWS (apps/web/src/lib/syllabus-import.ts:268-275 comment). 🔵
