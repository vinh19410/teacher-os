# Phase 6 — ghi chú cổng grep & cleanup

## Cổng grep plan (Task 6.5)

`rg -n "classId\s*(===|!==)\s*null" apps/web/src --glob '!**/*.test.*' --glob '!**/repos/syllabus.ts' --glob '!**/vocab/**'`

Baseline phase 1 (trước refactor):
- `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx`: 4 match
- `apps/web/src/lib/repos/use-syllabus.ts`: 1 match

Kết quả sau phase 6: (điền khi chạy cổng — phải là 0)

## Cleanup hook cũ (Task 6.5 step 2)

`templates` trong `useSyllabus()` chỉ xoá khi không còn consumer đọc `.templates`
từ nó. $syllabusId.tsx và index.tsx đã chuyển sang `useTemplates()`; kiểm phần
còn lại khi chạy gate.
