---
feature: materials
type: reverse-srs-erd
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs/materials-reverse-erd — materials

Feature có BỐN thực thể riêng: material_folder, material, lesson_material,
syllabus_lesson_material. organization, class, syllabus_lesson chỉ là tham chiếu
FK (thuộc feature khác) — vẽ tối thiểu. Kiểu cột khớp schema thật
(packages/db/src/schema/material.ts).

```mermaid
erDiagram
    material_folder {
        text id PK
        text org_id FK "NOT NULL - organization.id, cascade"
        text parent_id FK "NULL = thu muc goc - material_folder.id, NO ACTION (chi xoa duoc khi rong)"
        text name "NOT NULL - ten duy nhat trong cung cha"
        integer created_at "NOT NULL timestamp_ms, default unixepoch ms"
    }
    material {
        text id PK
        text org_id FK "NOT NULL - organization.id, cascade"
        text folder_id FK "NULL = chua xep thu muc - material_folder.id, NO ACTION"
        text title "NOT NULL, 1-200 sau trim theo hop dong"
        text description "NOT NULL default rong, toi da 1000"
        text kind "NOT NULL: file hoac link hoac media - CHECK material_kind_shape"
        text url "kind = link thi NOT NULL, con lai NULL - http hoac https"
        text object_key "kind file hoac media thi NOT NULL (orgId/materialId), con lai NULL - cot teacher-only"
        text mime_type "NULL voi link - thuoc danh sach 10 MIME cho phep"
        integer size_bytes "NULL voi link"
        text original_name "NULL voi link - ten file goc, cot teacher-only"
        text created_by "NOT NULL - cot teacher-only, chua tung hien thi (OQ-01)"
        integer created_at "NOT NULL timestamp_ms, default unixepoch ms"
        integer updated_at "NOT NULL timestamp_ms, default unixepoch ms - ghi de khi PATCH"
    }
    lesson_material {
        text org_id FK "NOT NULL - organization.id, cascade"
        text class_id PK "NOT NULL - class.id, cascade - thanh phan khoa chinh gop (class_id, date, material_id)"
        text date PK "NOT NULL yyyy-mm-dd, cung gia tri lesson.date - thanh phan khoa chinh gop"
        text material_id PK "NOT NULL - material.id, NO ACTION (tai lieu dang dung khong xoa duoc) - thanh phan khoa chinh gop"
        integer position "NOT NULL default 0 - thu tu trong buoi"
        integer created_at "NOT NULL timestamp_ms, default unixepoch ms"
    }
    syllabus_lesson_material {
        text org_id FK "NOT NULL - organization.id, cascade"
        text syllabus_lesson_id PK "NOT NULL - syllabus_lesson.id, cascade - thanh phan khoa chinh gop (syllabus_lesson_id, material_id)"
        text material_id PK "NOT NULL - material.id, NO ACTION - thanh phan khoa chinh gop"
        integer position "NOT NULL default 0"
        integer created_at "NOT NULL timestamp_ms, default unixepoch ms"
    }
    organization {
        text id PK
    }
    class {
        text id PK
        text org_id FK "thuoc feature lop hoc, tham chieu toi thieu"
    }
    syllabus_lesson {
        text id PK "thuoc feature giao trinh, tham chieu toi thieu"
    }
    organization ||--o{ material_folder : "org_id"
    material_folder ||--o{ material_folder : "parent_id"
    organization ||--o{ material : "org_id"
    material_folder |o--o{ material : "folder_id"
    organization ||--o{ lesson_material : "org_id"
    class ||--o{ lesson_material : "class_id"
    material ||--o{ lesson_material : "material_id"
    organization ||--o{ syllabus_lesson_material : "org_id"
    syllabus_lesson ||--o{ syllabus_lesson_material : "syllabus_lesson_id"
    material ||--o{ syllabus_lesson_material : "material_id"
```

Chỉ mục và ràng buộc thật (schema + migration):

- `material_folder_org_parent_idx (org_id, parent_id)` — duyệt cây theo cha —
  packages/db/src/schema/material.ts:41; packages/db/src/migrations/0066_class_materials.sql. ✅
- `material_folder_org_parent_name_uq` — UNIQUE (org_id, coalesce(parent_id,''),
  name): thư mục gốc (cha NULL) cũng unique theo tên — biên tập tay vì drizzle-kit
  tách biểu thức tại dấu phẩy — packages/db/src/schema/material.ts:42-46;
  packages/db/src/migrations/0066_class_materials.sql:1-4,54. ✅
- `material_org_folder_idx (org_id, folder_id)` và `material_org_kind_idx
  (org_id, kind)` — lọc danh sách theo thư mục và theo loại —
  packages/db/src/schema/material.ts:84-85. ✅
- CHECK `material_kind_shape`: link phải có url và KHÔNG object; file/media phải
  có object và KHÔNG url — packages/db/src/schema/material.ts:86-89;
  packages/db/src/migrations/0066_class_materials.sql:38. ✅
- `lesson_material_pk` — PRIMARY KEY (class_id, date, material_id) —
  packages/db/src/schema/material.ts:120-123. ✅
- `lesson_material_material_idx (material_id)` — đếm usage khi xóa/chặn —
  :124; `lesson_material_org_idx (org_id)` — :125. ✅
- `syllabus_lesson_material_pk` — PRIMARY KEY (syllabus_lesson_id, material_id) —
  :157-160; `syllabus_lesson_material_material_idx` :161;
  `syllabus_lesson_material_org_idx` :162. ✅

Ghi chú quan hệ:

- Xóa organization → cascade xóa TẤT CẢ 4 bảng của feature trong một câu; xóa
  thư mục cha và xóa tài liệu đang dùng là NO ACTION — chỉ xóa được khi rỗng /
  khi không còn tham chiếu — packages/db/src/schema/material.ts:16-23,101-117,142-152. ✅
- Copy template giáo trình → lớp remap `syllabusLessonId`, GIỮ `materialId` — ngân
  hàng là tài nguyên org dùng chung (#655) — packages/db/src/schema/material.ts:129-138. ✅
- lesson_material không FK tới lesson: buổi là NHÓM dòng lesson cùng (classId,
  date) nên liên kết theo cặp đó — packages/db/src/schema/material.ts:93-99. ✅
- Ranh giới: bảng của feature khác không vẽ vào đây — syllabus_lesson (Giao
  trình), class (Lớp học), organization (Tổ chức); audio thư viện và kho đề nhập
  AI dùng CÙNG interface MediaStore nhưng bucket/binding riêng —
  packages/infra/alchemy.run.ts:195-209. ✅
