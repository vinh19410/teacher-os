---
type: reverse-srs-erd
feature: student-classes
status: draft
updated: "2026-11-12"
---

# student-classes — Mô hình thực thể (ERD, góc nhìn học viên)

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

```mermaid
erDiagram
    organization {
        text id PK
        text name
    }
    class {
        text id PK
        text org_id FK
        text name
        text level
        text mode "Online / Offline"
        text scheduling_mode
        integer sessions_total
        integer sessions_done
        text status
        numeric tuition_fee
    }
    enrollment {
        text id PK
        text org_id FK
        text class_id FK
        text student_id FK
        text status "invited / active"
        text created_at
    }
    membership {
        text id PK
        text org_id FK
        text role "teacher / student"
    }
    student {
        text id PK
        text name
    }
    lesson {
        text id PK
        text class_id FK
        text date "nullable - lop legacy"
        text status "upcoming mac dinh"
        text zoom "lien ket hop truc tuyen - phia giao vien"
    }
    syllabus {
        text id PK
    }
    class_assignment {
        text id PK
        text org_id FK
        text class_id FK
        text note "ghi chu giao vien"
        text class_study_pack_id "nullable"
    }
    class_assignment_target {
        text id PK
        text org_id FK
        text assignment_id FK
        text student_id FK
        text submitted_at "ISO string - nullable"
    }
    assignment_prompt {
        text id PK
        text org_id FK
        text skill
        text writing_part "chi Writing"
    }
    quiz_attempt {
        text id PK
        text student_id FK
        text assignment_id FK
        text status "in_progress / submitted"
        integer submitted_at "int ms"
    }
    organization ||--o{ class : "sở hữu lớp"
    organization ||--o{ enrollment : "phạm vi ghi danh"
    organization ||--o{ membership : "vai trò trong tổ chức"
    student ||--o{ enrollment : "ghi danh lớp"
    class ||--o{ enrollment : "nhận học viên"
    class ||--o{ lesson : "xếp buổi học"
    class |o--o| syllabus : "dùng giáo trình"
    class ||--o{ class_assignment : "được giao bài"
    class_assignment ||--o{ class_assignment_target : "chỉ định theo học viên"
    student ||--o{ class_assignment_target : "nhận bài"
    class_assignment |o--o| assignment_prompt : "có đề"
    student ||--o{ quiz_attempt : "làm bài"
    class_assignment ||--o{ quiz_attempt : "được làm"
```

## Ghi chú thực thể (chỉ các trường trang học viên đọc)

- **class** — định danh, tên, mức độ, loại, kỹ năng (chuỗi JSON), hình thức, lịch tuần (chuỗi chuẩn hoặc văn bản cũ), tổng buổi, số buổi đã xong, trạng thái, ngày khai giảng, học phí cả khoá (KHÔNG hiện trên trang học viên), ghi chú, thời điểm tạo; thuộc đúng một tổ chức. ✅ [packages/db/src/schema/class.ts:13-39]
- **enrollment** — cặp học viên–lớp trong tổ chức, trạng thái vòng đời (`invited`/`active`), thời điểm tạo; ràng buộc duy nhất cặp lớp–học viên. ✅ [packages/db/src/schema/enrollment.ts:11-47, :40-43]
- **lesson** — ngày (CHO PHÉP TRỐNG = lớp legacy), thứ, giờ, thời lượng, chủ đề, trạng thái chung (`upcoming` mặc định), trạng thái riêng theo học viên (điểm danh) + ghi chú điểm danh (chỉ giáo viên). ✅ [packages/db/src/schema/lesson.ts:46-77]
- **membership** — học viên/giáo viên thuộc tổ chức kèm vai trò; membership 'teacher' sớm nhất là giáo viên hiển thị cho học viên. ✅ [packages/db/src/schema/membership.ts:11-24; apps/server/src/routes/student-class.ts:57-75]
- **class_assignment + class_assignment_target** — bài tập của lớp và mục tiêu theo từng học viên (thời điểm nộp nằm ở mục tiêu). ✅ [apps/server/src/routes/student-class.ts:145-207]
- **assignment_prompt** — đề bài, mang kỹ năng và phần Writing dùng để phân nhãn chờ chấm. ✅ [apps/server/src/routes/student-class.ts:145-207 (các trường skill, writingPart)]
- **quiz_attempt** — bản ghi làm bài của học viên: điểm 4 tiêu chí, thời điểm chốt trả bài, trạng thái lần làm; nối trái nên bài chưa làm vẫn hiện trong bảng. ✅ [apps/server/src/routes/student-class.ts:145-207]

## Quy ước đáng nhớ

- Không có bảng/cột "giáo viên của lớp" — quan hệ qua membership tổ chức. ✅ [packages/db/src/schema/class.ts:13-39 — quét toàn bộ cột; docs/_reverse/classes/classes-reverse-spec.md:31] 🟡 → OQ-1
- Buổi tới và "Đã kết thúc" không có cột lưu — luôn suy từ ngày+giờ+thời lượng theo giờ VN. ✅ [apps/server/src/routes/student-class.ts:77-117; apps/student/src/components/class/class-lesson-list.tsx:57-67]
- Ràng buộc duy nhất ghi danh tạo từ migration đầu tiên của cụm lớp/ghi danh. ✅ [packages/db/src/migrations/0001_opposite_loki.sql:21-34]
