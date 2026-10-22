# Audit 73 call site `<Card` — phase 2 (issue #412)

Nguồn sự thật: `grep -rEn '<Card' --include='*.tsx' apps/web/src | grep -v '\.test\.'` → 73 chỗ / 30 file.
Audit bởi 3 agent song song (routes A: 28 chỗ, routes B: 24 chỗ, components C: 19 chỗ + kiểm chéo 30 file
consumer), adjudicate lại tập trung (đặc biệt: card mở đầu bằng `<SectionLabel>` có sẵn 12px nhờ
`SectionTitle mb-3` → KHÔNG thêm gap để tránh đè đôi).

## Kết luận

- **6 call site được sửa** (8 thao tác edit) tại 5 file — tất cả là class layout (guard kongming: chỉ layout, mỗi edit ghi căn cứ):
  1. `routes/_auth/assignments/$assignmentId.tsx:61` — thêm `flex-row` (rule ADD_FLEXCOL: truyền `flex`
     không có hướng tường minh; chủ ý header ngang `items-center flex-wrap`, `flex-1` của title chỉ có
     nghĩa trong hàng; pin hướng sau khi Card bỏ `flex-col` mặc định).
  2. `components/assignment-tests/test-part-slot.tsx:44` — thêm `flex-row` (cùng rule: 2 con
     info/actions + `justify-between` = chủ ý hàng ngang).
  3. `components/payments/bank-link-panel.tsx:35` — thêm `flex flex-col gap-4` (rule ADD_GAP + DEPTH2:
     con 1 là wrapper div không margin — `mb-3` nằm LÔNG wrapper, không tạo khoảng cách giữa các con;
     sau fix wrapper→khối trạng thái = 0px).
  4. `routes/_auth/tuition/$invoiceId.tsx:181` — thêm `flex flex-col gap-4` (ADD_GAP: `h2.leading-none`
     + `<dl>` đều không margin → dính nhau sau fix).
  5. `routes/_auth/tuition/$invoiceId.tsx:236` — thêm `flex flex-col gap-4` (ADD_GAP: `h2` + div wrap
     không margin).
  6. `routes/_auth/tuition/$invoiceId.tsx:266` — thêm `flex flex-col gap-4` + bỏ `mt-4` (div
     InvoicePaymentActions) và `mt-3` (p payLink) (ADD_GAP + anti-stacking: hôm nay 24+16=40px và
     24+12=36px là chính bug "phình" của issue; gap-4 đồng nhất 16px).
- **Không sửa** (phân loại NOTE_ONLY/HAS_OVERRIDE/DIVIDER — separation tự cấp hoặc override tường minh):
  66 chỗ còn lại, gồm mọi card mở đầu bằng `SectionLabel` (12px từ `mb-3` của SectionTitle — khớp đúng
  AC "khoảng dọc khớp `mt-*` khai báo"), empty state `p-8 text-center`, card DataTable `p-0`, test
  builder `py-4` (có lại padding ngang 24px — chụp trước/sau ở phase 3), `reports.tsx:167` (divider
  `border-t py-3` tự quản).

## Bảng chi tiết

### Nhóm A — routes (28 chỗ)

| file:line | className | Phân loại | Action |
|---|---|---|---|
| profile.tsx:125 | (white, trần) | NOTE_ONLY | SectionTitle `mb-3` tự cấp 12px; thêm gap → đè đôi. Không sửa |
| dashboard.tsx:195 | `mb-10 self-start p-6 lg:mb-0` | HAS_OVERRIDE | Không sửa |
| reports.tsx:115 | `white p-0` | NOTE_ONLY | 1 con DataTable. Không sửa |
| reports.tsx:167 | (trần) | DIVIDER | Con nối bằng `border-t py-3 first:*` tự quản. Không sửa |
| schedule.tsx:127 | `p-8 text-center` | HAS_OVERRIDE | Không sửa |
| students/index.tsx:112,125 | `p-8 text-center` | HAS_OVERRIDE | Không sửa |
| students/index.tsx:131 | `p-0` | NOTE_ONLY | Không sửa |
| students/$studentId.tsx:43 | not-found center | NOTE_ONLY | Không sửa |
| students/$studentId.tsx:213,248 | (white, trần) | NOTE_ONLY | margin tường minh ở con (`mb-3`, `gap-4`, `mt-5`). Không sửa |
| students/$studentId.tsx:275,303,338 | `p-0` | NOTE_ONLY | DataTable. Không sửa |
| tuition/index.tsx:128 | `p-6 …` | HAS_OVERRIDE | 1 con chart. Không sửa |
| tuition/index.tsx:146,232 | `p-8 text-center` | HAS_OVERRIDE | Không sửa |
| tuition/$invoiceId.tsx:45 | not-found center | NOTE_ONLY | Không sửa |
| tuition/$invoiceId.tsx:181 | (trần) | ADD_GAP | **SỬA**: + `flex flex-col gap-4` |
| tuition/$invoiceId.tsx:236 | (trần) | ADD_GAP | **SỬA**: + `flex flex-col gap-4` |
| tuition/$invoiceId.tsx:266 | `self-start` | ADD_GAP + anti-stacking | **SỬA**: + gap-4, bỏ `mt-4`/`mt-3` |
| tuition/$invoiceId.tsx:299 | `mt-6 p-0` | NOTE_ONLY | Tự quản `px-6 pt-6`. Không sửa |
| syllabus/index.tsx:55,67 | `p-8 text-center` | HAS_OVERRIDE | Không sửa |
| syllabus/index.tsx:77 | grid item | NOTE_ONLY | h3.mt-3/p.mt-2 tự quản — card "phình" của issue hết phình sau fix primitive. Không sửa |
| syllabus/$syllabusId.tsx:46 | not-found | NOTE_ONLY | Không sửa |
| syllabus/$syllabusId.tsx:231 | `p-8 …` | HAS_OVERRIDE | Không sửa |
| syllabus/$syllabusId.tsx:349 | `p-0` | NOTE_ONLY | Không sửa |

### Nhóm B — routes (24 chỗ)

| file:line | className | Phân loại | Action |
|---|---|---|---|
| assignments/index.tsx:281,434 | `p-8/p-10 text-center` | HAS_OVERRIDE | Không sửa |
| assignments/index.tsx:299 | `flex flex-col gap-4 p-5` | HAS_OVERRIDE | Đã đủ. Không sửa |
| assignments/$assignmentId.tsx:14 | not-found | NOTE_ONLY | Không sửa |
| assignments/$assignmentId.tsx:61 | `mb-5 flex flex-wrap items-center gap-4` | ADD_FLEXCOL | **SỬA**: + `flex-row` |
| assignments/$assignmentId.tsx:95 | `px-4 py-3` | HAS_OVERRIDE | Không sửa |
| assignments/$assignmentId.tsx:109 | (trần) | tự cấp | Textarea + `div.mt-3` — mt-3 tự cấp 12px (v1). Không thêm gap (đè đôi). Không sửa |
| assignments/$assignmentId.tsx:126 | (trần) | NOTE_ONLY | 1 wrapper duy nhất. Không sửa |
| assignments/preview.tsx:87,113 | `p-8 text-center` | HAS_OVERRIDE | Không sửa |
| assignments/preview.tsx:230 | `flex flex-col gap-3` | đã đủ | Không sửa |
| grading/index.tsx:270,278 | `mt-10`/center | NOTE_ONLY | Text node / 1 con. Không sửa |
| grading/index.tsx:295,457 | `p-8 text-center` | HAS_OVERRIDE | Không sửa |
| grading/index.tsx:311 | `flex flex-col gap-4 p-5` | HAS_OVERRIDE | Không sửa |
| grading/$attemptId.tsx:123,140 | `mt-10`/center | NOTE_ONLY | Không sửa |
| grading/$attemptId.tsx:222,248 | `p-6`/`self-start p-6` | HAS_OVERRIDE | Không sửa |
| classes/index.tsx:58,72 | `p-8 text-center` | HAS_OVERRIDE | Không sửa |
| classes/$classId.tsx:73 | not-found | NOTE_ONLY | Không sửa |
| classes/$classId.tsx:368 | (white, trần) | tự cấp | SectionLabel mb-3 + Button mt-3 tự cấp. Không sửa |

### Nhóm C — components (19 chỗ)

| file:line | className | Phân loại | Action |
|---|---|---|---|
| test-builder-shell.tsx:549,619,632,652,664 | `…flex-col gap-* py-4` | HAS_OVERRIDE | Đã đủ gap; py-4 có lại padding ngang 24px (chụp phase 3). Không sửa |
| test-part-slot.tsx:44 | `flex flex-wrap … py-4` | ADD_FLEXCOL | **SỬA**: + `flex-row` |
| test-part-slot.tsx:81 | `flex flex-col gap-2 py-4` | HAS_OVERRIDE | Không sửa |
| bank-link-panel.tsx:35 | (white, trần) | ADD_GAP + DEPTH2 | **SỬA**: + `flex flex-col gap-4` |
| google-link-card.tsx:46 | (white, trần) | tự cấp | SectionLabel mb-3 tự cấp. Không sửa |
| avatar-section.tsx:58 | (white, trần) | tự cấp | SectionLabel mb-3 tự cấp. Không sửa |
| prompt-composer.tsx:67 | `flex flex-col gap-4` | đã đủ | Không sửa |
| student-tuition-summary.tsx:99 | `mt-5 p-0` | NOTE_ONLY | Không sửa |
| class-assignments-tab.tsx:329,446,536 | `p-8/gap-4 p-5/gap-5 p-5` | HAS_OVERRIDE | Không sửa |
| class-roster-tab.tsx:99 | `p-0` | NOTE_ONLY | Không sửa |
| vocab-progress-tab.tsx:214,225 | `p-5` | NOTE_ONLY | Con đều có `mt-4/mt-5`. Không sửa |
| vocab-deck-list.tsx:176 | `p-5` | NOTE_ONLY | Không sửa |
