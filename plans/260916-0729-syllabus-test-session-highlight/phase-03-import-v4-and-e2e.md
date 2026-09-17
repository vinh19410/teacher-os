---
phase: 3
title: "Import v4 cột Loại + fixtures + e2e"
status: completed
priority: P1
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Import v4 cột Loại + fixtures + e2e

## Goal

File import Excel/CSV nhận cột 5 "Loại" (tùy chọn) để khai báo buổi thi ngay
lúc import; preview hiển thị cột Loại; fixtures + unit + e2e khóa toàn bộ
hành vi (bao gồm 2 phase trước).

## Context Links

- **Hợp đồng format v4 + 7 luật delta**: [plan.md](./plan.md#đặc-tả-format-import-v4-hợp-đồng-forensic--mọi-thay-đổi-parser-theo-đúng-mục-này) — nguồn sự
  thật duy nhất, phase này không diễn đạt lại luật.
- `apps/web/src/lib/syllabus-import.ts` (v3: normalizeRow 4 cột ~28, header
  checks ~58-85, per-row col-5 block ~91-96, hasLessonContent ~144,
  buildSampleCsv ~238);
  `apps/web/src/components/syllabus/import-preview.tsx` (bảng preview);
  tests `apps/web/src/lib/syllabus-import.test.ts` (22 case v3 — anchor theo
  symbol, không tin line number: đã drift so với scout, red-team #12);
  e2e `apps/e2e/specs/syllabus-excel-csv-import.spec.ts` (hard-pin "2 module ·
  3 buổi học" ×6, `Số buổi dự kiến` "3", ordinal "buổi 3" — red-team #4) +
  `syllabus-detail-import-overwrite.spec.ts` (totalCard "3" :73);
  fixtures `apps/e2e/fixtures/syllabus-import.sample.{csv,xlsx}` (xlsx binary
  commit sẵn — regenerate bằng `exceljs`, dep sẵn của apps/e2e).

## Requirements

- [x] Parser v4 đúng 7 luật delta trong plan.md — đặc biệt: bãi bỏ block
      "cột thứ 5 thừa"; old-v2 status vocab ở ô 5 → lỗi old-template đúng
      nguyên nhân; dòng chỉ điền Loại vẫn tạo buổi thi.
- [x] File v3 4 cột import không đổi hành vi (regression bắt buộc).
- [x] Preview thêm cột "Loại": trống cho lesson thường, nhãn đầy đủ
      "Thi giữa kỳ"/"Thi cuối kỳ" (qua `lessonKindLabel` — khớp nhãn syllabus
      detail, red-team #9).
- [x] `buildSampleCsv()` 5 cột có buổi thi mẫu (2 dòng cuối mỗi module — luật 7
      plan.md), khớp fixture e2e; dữ liệu dòng đặt trong constant export
      `SAMPLE_ROWS` mà cả `buildSampleCsv` lẫn script regenerate fixture cùng
      tiêu thụ (red-team #8).
- [x] Fixture v4 mới KHÔNG đè fixture cũ: `syllabus-import.sample.*` giữ làm
      legacy 4 cột v3 (regression e2e — red-team #10); fixture v4 mới
      `syllabus-import.v4.{csv,xlsx}`.
- [x] E2E pin cập nhật đủ (red-team #4): "2 module · 5 buổi học",
      `Số buổi dự kiến` "5", StatCard tổng buổi, ordinal mới (giữa kỳ = buổi 2
      cuối Module 1, cuối kỳ = buổi cuối Module 2), totalCard — cả 2 spec.
- [x] E2E: import file có buổi thi → preview + detail hiển thị highlight;
      đánh dấu manual qua modal → badge hiện; file 4 cột v3 legacy vẫn import;
      **guard kind** (red-team #6): sửa 1 buổi thi từ màn hình Chi tiết lớp
      (không showKind) → refresh → badge vẫn còn ở màn hình Syllabus.
- [x] E2E assert nhãn bằng text đầy đủ/exact match — không dùng substring
      "Giữa kỳ" (mask mâu thuẫn nhãn — red-team #9).

## Implementation Steps

1. `syllabus-import.ts`: áp 7 luật delta (đổi `normalizeRow` → 5 cột; đập bỏ
   per-row col-5 block; thêm old-v2 vocab check + mapping Loại; mở rộng
   `hasLessonContent`; cập nhật docblock đầu file v3→v4).
2. `SAMPLE_ROWS` constant + `buildSampleCsv()`: 5 cột —
   `Module,Mô tả module,Mục tiêu,Tài liệu,Loại`, 5 buổi (giữa kỳ cuối Module 1,
   cuối kỳ cuối Module 2), BOM + CRLF giữ nguyên.
3. `import-preview.tsx`: header + cell "Loại" (dùng `lessonKindLabel` của
   phase 2 để tránh lệch nhãn).
4. Unit `syllabus-import.test.ts`: cập nhật case v3 bị đổi ngữ nghĩa (col-5
   block cũ — rà đủ 22 case hiện có, không chỉ vài case), thêm case: mapping
   6 giá trị Loại + lạ → lỗi đúng câu; old-v2 vocab (`đã dạy`…) → lỗi
   old-template; dòng Loại-only tạo buổi; file 4 cột v3 vẫn OK; cap 500 đếm
   loại-only row.
5. Fixtures e2e: tạo `syllabus-import.v4.csv` (5 cột, sinh từ `SAMPLE_ROWS`);
   giữ nguyên `syllabus-import.sample.{csv,xlsx}` làm legacy v3; regenerate
   `syllabus-import.v4.xlsx` bằng script `apps/e2e/scripts/regen-syllabus-fixture.ts`
   (exceljs, tiêu thụ `SAMPLE_ROWS`, GIỮ script trong repo làm nguồn sự thật —
   red-team #8); e2e green chính là round-trip verify (read-excel-file đọc lại
   trong parser).
6. E2E `syllabus-excel-csv-import.spec.ts`: đổi fixture sang bản v4 cho case
   import mới; cập nhật toàn bộ pin số lượng/ordinal/totalCard (checklist
   Requirement); assert badge "Thi giữa kỳ"/"Thi cuối kỳ" ở preview; sau ghi
   đè, detail có badge + row tint `bg-warn-soft/50`; thêm 1 case import fixture
   legacy v3 4 cột vẫn OK (red-team #10).
7. E2E `syllabus-test-session-mark.spec.ts` (hoặc mở rộng
   `syllabus-detail-import-overwrite.spec.ts`): thêm buổi mới chọn "Thi giữa
   kỳ" → badge hiện; sửa thành "Thi cuối kỳ" → label đổi; màn hình lớp không
   có select Loại; guard kind — sửa buổi thi từ màn hình lớp → badge syllabus
   vẫn còn (red-team #6).
8. Full gate: `pnpm --filter web test` → `pnpm check-types` → `pnpm --filter e2e e2e`.

## Verification

- `pnpm --filter web test` xanh (unit v4 đủ case Requirement).
- `pnpm --filter e2e e2e` xanh trên cả 3 spec syllabus.

## Risk Assessment

- Fixture xlsx regenerate lệch nội dung csv → e2e fail giả — sinh từ
  `SAMPLE_ROWS` export của `syllabus-import.ts` qua script regen giữ trong
  repo, không gõ tay 2 lần (red-team #8).
- File v2 (Trạng thái) đã xoá header: các dòng `đã dạy` giờ rơi vào luật
  old-v2 vocab (không còn lỗi "cột thừa") — message phải vẫn dẫn về
  "tải file mẫu mới" như cũ, test case phủ.

## Security Considerations

- Parser vẫn 100% client-side, file không rời máy; cap 500 nodes + 2MB giữ
  nguyên; không deps mới (exceljs chỉ trong apps/e2e, đã có).
