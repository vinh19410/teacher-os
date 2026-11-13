---
feature: admin-library
type: reverse-srs-erd
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs/admin-library-reverse-erd — admin-library

Sáu thực thể của feature (khối thuộc tính liệt kê CỘT THẬT, tên cột giữ nguyên DB).
Khóa tham chiếu ngoài (organization, class, bản vật hóa) liệt kê ở cuối — không vẽ
vì thuộc schema feature khác.

```mermaid
erDiagram
    library_test ||--o{ library_test_part : "de co cac part (xoa cascade)"
    study_pack ||--o{ study_pack_item : "gom cac muc theo ngay"
    study_pack ||--o{ class_study_pack : "duoc gan cho lop (chan xoa khi con gan)"
    study_pack_exercise ||--o{ study_pack_item : "duoc tham chieu theo ma nguon (khong FK)"
    library_test_part ||--o{ study_pack_item : "duoc tham chieu theo ma nguon (khong FK)"

    library_test {
        text id PK
        text title
        text description
        text skill
        integer time_limit_seconds
        text collection
        text test_group
        text status
        text created_by
        integer created_at
        integer updated_at
    }
    library_test_part {
        text id PK
        text test_id FK
        text part
        text type
        text title
        text band
        text source
        text intro
        text passage
        text transcript
        text image_url
        text questions
        text option_bank
        text groups
        text note
        text audio_key
        text audio_name
        text audio_content_type
        integer audio_size
        integer audio_uploaded_at
        integer updated_at
    }
    study_pack_exercise {
        text id PK
        text skill
        text part
        text type
        text title
        text band
        text intro
        text passage
        text questions
        text option_bank
        text note
        text status
        text created_by
        integer created_at
        integer updated_at
    }
    study_pack {
        text id PK
        text org_id FK
        text title
        text description
        text status
        text source_pack_id
        text created_by
        integer created_at
        integer updated_at
    }
    study_pack_item {
        text id PK
        text pack_id FK
        integer day_index
        integer position
        text source_kind
        text source_id
        text note
    }
    class_study_pack {
        text id PK
        text org_id FK
        text class_id FK
        text pack_id FK
        text title
        text start_date
        text release_time
        text due_time
        text status
        text created_by
        integer created_at
        integer cancelled_at
    }
```

## Ràng buộc cấp DB và cấp ứng dụng

- **library_test_part**: unique (test_id, part) — mỗi slot một dòng; FK cascade xóa
  theo đề; index (skill, status) trên đề. ✅ packages/db/src/schema/library-test.ts:98-101, packages/db/src/schema/library-test.ts:46-47
- **study_pack_item**: unique (pack_id, day_index, source_kind, source_id) — một
  nguồn không lặp trong cùng ngày; index vị trí để sắp thứ tự. ✅
  packages/db/src/schema/study-pack.ts:95-105
- **class_study_pack**: unique riêng phần (class_id, pack_id) CHỈ với status active —
  gán lại sau hủy được phép; pack_id restrict — xóa bộ bị DB chặn khi còn gán (route
  cũng chặn trước bằng 409). ✅ packages/db/src/schema/study-pack.ts:141-144
- **created_by không FK** trên library_test/study_pack_exercise/study_pack: xóa người
  dùng không xóa dữ liệu thư viện (dữ liệu sống độc lập tài khoản). ✅
  packages/db/src/schema/library-test.ts:32-36
- **org_id NULL** trên study_pack = bản hệ thống; bản sao tổ chức có org + source_pack_id
  (unique org+source). ✅ packages/db/src/schema/study-pack.ts:52-76 (unique 70-73)

## Tham chiếu ngoài (không vẽ trong ERD)

- study_pack.org_id / class_study_pack.org_id → organization (cascade); class_study_pack
  .class_id → class (cascade). ✅ packages/db/src/schema/study-pack.ts:53-55, packages/db/src/schema/study-pack.ts:119-126
- Bản vật hóa cho học viên: assignment_prompt mang library_ref trỏ đề/part nguồn
  (migration 0060) — học viên đọc bản chụp, không đọc library_test. 🔵
  packages/db/src/migrations/0060_study_pack.sql:1-79, apps/server/src/routes/student-practice.ts:44-90
- Nguồn của study_pack_item: source_kind = "library_test_part" (part đề đọc ready) hoặc
  "library_exercise" (bài tập ready); mã nguồn lưu ở source_id. ✅
  packages/db/src/schema/study-pack.ts:90-92, apps/server/src/lib/study-pack-clone.ts:524-624
