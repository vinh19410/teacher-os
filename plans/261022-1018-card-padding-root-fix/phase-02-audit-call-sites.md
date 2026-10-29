---
phase: 2
title: "Rà call site phụ thuộc layout v2"
status: done
---

# Phase 2 — Rà call site

Mục tiêu: tìm call site nào đã **dựa vào** `flex flex-col gap-6` của Card v2 (con không có margin, xếp sát
nhau khi Card về block flow) và thêm `flex flex-col gap-*` tại chỗ.

## Phạm vi: TOÀN BỘ consumer, không chỉ file ưu tiên

Audit **tất cả 73 chỗ `<Card` trong 30 file** (nguồn sự thật: `grep -rEn '<Card' --include='*.tsx'
apps/web/src | grep -v '\.test\.'`). 8 file dưới đây là ưu tiên cao (sửa sau #378), nhưng không loại trừ
file khác:

- `apps/web/src/components/class-detail/class-roster-tab.tsx`
- `apps/web/src/components/classes/class-assignments-tab.tsx`
- `apps/web/src/routes/_auth/classes/$classId.tsx`
- `apps/web/src/routes/_auth/classes/index.tsx`
- `apps/web/src/routes/_auth/grading/$attemptId.tsx`
- `apps/web/src/routes/_auth/grading/index.tsx`
- `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx`
- `apps/web/src/routes/_auth/syllabus/index.tsx`

Các cụm call site đã biết phụ thuộc `gap-6` và nằm NGOÀI danh sách ưu tiên (phải rà kỹ):
`routes/_auth/profile.tsx:125`, `routes/_auth/tuition/$invoiceId.tsx:236,266`,
`components/payments/bank-link-panel.tsx:35`, `components/profile/google-link-card.tsx:46`,
`components/profile/avatar-section.tsx:58`, `routes/_auth/reports.tsx:167`,
`routes/_auth/assignments/$assignmentId.tsx:109,126`, `routes/_auth/students/$studentId.tsx:213,248`,
`routes/_auth/classes/$classId.tsx:368`.

## Steps

1. Với mỗi call site, phân loại theo rules (mở rộng sau red-team):
   - Card trần + ≥2 con trực tiếp, có con không có `mt-*`/`mb-*`/`space-y-*` → thêm `flex flex-col gap-4`
     (hoặc gap theo design) vào className.
   - Margin nằm LÔNG wrapper div (depth-2, ví dụ `bank-link-panel.tsx`): `mb-3` trong div bọc không tạo
     khoảng cách giữa các con của Card → vẫn cần gap ở Card.
   - Call site truyền `flex` mà KHÔNG truyền `flex-col`/`flex-row` tường minh (ví dụ
     `assignments/$assignmentId.tsx:61` `mb-5 flex flex-wrap items-center gap-4`): hôm nay render CỘT nhờ
     `flex-col` của Card v2, sau phase 1 sẽ render HÀNG → phải thêm `flex-col` tường minh nếu layout cột
     là chủ ý.
   - Con nối nhau bằng divider `border-b pb-*` hoặc spacing `pt-*`/`pb-*`: mất `gap-6` làm hai khối dính
     nhau → cân nhắc thêm gap.
   - Text node trần / 1 con duy nhất / khối căn giữa ngắn → ghi nhận, không sửa.
2. Call site truyền `py-4` để "giảm padding" trong v2 (`test-builder-shell.tsx`, `test-part-slot.tsx`):
   giữ nguyên — sau phase 1 chúng có lại padding ngang 24px; bắt buộc chụp trước/sau màn test builder ở
   phase 3 (route `/assignments/tests/*`) vì visual thay đổi thật.
3. Không đụng call site đã có `p-*` tường minh.

## Output bắt buộc

Bảng audit đầy đủ 73 call site (file:line → override sẵn có / cần thêm gap / cần đổi hướng flex / chỉ ghi
nhân) đính kèm PR; mọi call site được sửa đều chụp/verify trước–sau ngay trong phase (không dồn hết sang
phase 3).

## Guards (kongming checkpoint sau plan gates)

1. Chỉ thêm class **layout** (`flex flex-col gap-*`, `flex-col`) — cấm sửa style khác (màu, spacing con,
   text) dù trông "sai design"; đó là issue riêng.
2. Mỗi edit phải ghi 1 dòng căn cứ trong bảng audit (rule nào trong steps ở trên).
3. Nếu audit kết luận >20 call site "cần thêm gap" → DỪNG, báo cáo trước khi sửa: con số đó cho thấy Card
   v2 từng bị dùng làm layout container quy mô lớn — cân nhắc giữ hợp đồng v2 (giữ `flex flex-col gap-6`)
   thay vì vá 20+ chỗ. Dưới ngưỡng đó: fix-at-call-site là đúng.

## Validation

```bash
pnpm --filter web test
pnpm check-types
```
