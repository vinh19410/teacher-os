# Design decisions (A+)

Các quyết định này ràng buộc mọi phase. Quyết định của user (copy riêng từng lớp, được đổi schema và API, chọn A+) là điểm xuất phát, không đảo ngược.

## D1. Một bảng, hai khái niệm

Giữ ba bảng hiện có. Template là `syllabus` với `class_id IS NULL`. Giáo trình của lớp là `syllabus` với `class_id = <lớp>`. Phân biệt chỉ xảy ra trong hai chỗ: service server (`lib/syllabus-curriculum.ts`) và adapter web (`lib/repos/syllabus.ts`).

## D2. Nguồn sự thật là `syllabus.class_id`

Đọc giáo trình của lớp luôn qua `findClassCurriculum(db, classId, orgId)` (tìm theo `class_id`), không qua `class.syllabus_id`. Hệ quả:

- Con trỏ mồ côi hoặc trỏ template cùng org không còn làm hỏng việc đọc: lớp coi như chưa có giáo trình, import được phép, và import ghi đè con trỏ cũ.
- Nhánh "con trỏ lệch" ở server và web bị loại bỏ.
- Giới hạn đã biết: `class.syllabus_id` là FK thật (NO ACTION), nên con trỏ **khác org** (migration 0009 để nguyên, ví dụ lớp c4 trong test của nó) vẫn chặn việc xoá dòng đích vì mọi lệnh xoá và gỡ đều lọc `org_id` của người gọi. Đây là lỗi có sẵn. Cách chữa duy nhất là đặt con trỏ đó về NULL trong `0042` (không xoá dòng nào); việc này cần user đồng ý sau khi phase 1 đo được Q1b.
- `class.syllabus_id` vẫn được ghi (FK thật, snapshot còn đưa ra), nhưng chỉ qua `setClassCurriculumPointer`.

## D3. Migration `0042` chỉ chữa, không xoá

`0042_syllabus_class_pointer_reconcile.sql`, **chỉ tạo khi phase 1 cho thấy cần** (Q2 > 0, hoặc user đồng ý NULL hoá Q1b): với mỗi lớp có copy (cùng org) mà con trỏ null hoặc khác copy, đặt con trỏ = copy. Không xoá dòng nào. NULL hoá con trỏ khác org (Q1b) là tuỳ chọn, chỉ khi user đồng ý (khuyến nghị đồng ý nếu Q1b > 0, vì đó là tham chiếu chéo tenant và chặn xoá). Không rebuild bảng `class`, không bỏ cột. Nếu Q2 = 0 và user không chọn NULL hoá thì bỏ cả migration và test của nó.

## D4. Không đổi cách lưu `status`

Hành vi ghi `status` của lesson giữ nguyên ở mọi nhóm route (nhận `status` khi body gửi, giữ giá trị cũ khi body không gửi, mặc định `upcoming` khi thêm). Ý tưởng "template luôn lưu `upcoming`" đã bị loại: nó là thay đổi hành vi ngoài yêu cầu, làm gãy test hiện có (`kernel.test.ts` tạo template với `status: "done"` rồi assert), không bảo vệ gì vì `buildImportBatch` đã luôn đặt `upcoming` khi copy, và alias cũ vẫn ghi được `status` nên không đạt mục tiêu.

## D5. Một bộ handler nội dung, nhiều tiền tố

`routes/syllabus-content-routes.ts` xuất `mountContentRoutes(router, { basePath, resolve, deps, readBody, unauthorized })` (chữ ký chuẩn nằm ở phase 4 Task 4.1). `resolve(c, db, orgId)` trả về syllabus đã lọc org (hoặc `undefined` → 404); handler luôn dùng `resolved.id`, không dùng `c.req.param("id")`. Được mount ba lần: `/syllabus-templates/:id` (scope template), `/classes/:id/curriculum` (scope class), `/syllabi/:id` (alias cũ, hành vi y hệt trước đây, xoá ở phase 8).

## D6. Contract mới, alias cũ

| Mới | Cũ (alias đến phase 8) |
|---|---|
| `POST /syllabus-templates` | `POST /syllabi` |
| `POST /syllabus-templates/:id/replace-content` | `POST /syllabi/:id/replace-content` |
| `POST /syllabus-templates/:id/remove` | `POST /syllabi/:id/remove` |
| `POST /syllabus-templates/:id/modules[/...]` | `POST /syllabi/:id/modules[/...]` |
| `POST /classes/:id/curriculum/import` | `POST /classes/:id/import-syllabus` |
| `POST /classes/:id/curriculum/remove` | `POST /classes/:id/remove-curriculum` |
| `POST /classes/:id/curriculum/modules[/...]` | `POST /syllabi/:copyId/modules[/...]` |

`GET /syllabi` (snapshot) và `POST /classes` với `templateId` giữ nguyên. `replace-content` chỉ có ở phạm vi template.

## D7. Web: một nơi đọc `classId`

`lib/repos/syllabus.ts` xuất `splitSyllabi(syllabi)` trả về `{ templates, curriculumByClassId, templateUsage }`. Mọi component dùng hook `useTemplates()` và `useClassCurriculum(classId)`. Action module/lesson mang `target: { kind: "template"; syllabusId } | { kind: "class"; classId }` thay cho `syllabusId` trần; `repos/kernel.ts` suy ra path từ `target`.

## D8. UX: một TemplatePicker

`components/syllabus/template-picker.tsx` thay `ClassTemplatePicker` và select trong `ImportSyllabusModal`. Có preview chỉ đọc (số buổi, kỹ năng, cây module và buổi), các trạng thái rỗng, đang tải và template không còn tồn tại, tuỳ chọn `allowEmpty` ("— Lớp trống —") cho tạo lớp. Không thêm endpoint. Không làm wizard.
