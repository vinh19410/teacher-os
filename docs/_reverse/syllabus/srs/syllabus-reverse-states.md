# States — feature `syllabus` (reverse)

Ba thực thể có vòng đời đa-trạng thái quan sát được trong code: **Syllabus** (template/copy), **SyllabusLesson** (tiến độ), và **Class — chế độ xếp lịch** nhìn từ góc độ giáo trình.

## S1 — Syllabus: template dùng chung ↔ bản copy của lớp

Phân loại bằng `syllabus.class_id` (NULL = template, NOT NULL = copy); chuyển trạng thái chỉ xảy ra qua import/gỡ/xóa.

```mermaid
stateDiagram-v2
    [*] --> TemplateShared : GV tạo template từ form hoặc file
    TemplateShared --> TemplateShared : ghi đè nội dung từ file hoặc sửa cây nội dung
    TemplateShared --> CopyOfOneClass : nhập vào lớp - deep-copy UUID mới
    TemplateShared --> Deleted : xóa template - copy của lớp vẫn sống
    CopyOfOneClass --> CopyOfOneClass : sửa nội dung trên lớp hoặc reset status khi nhập lại
    CopyOfOneClass --> Deleted : gỡ giáo trình khỏi lớp
    Deleted --> [*]
    note right of TemplateShared
        findTemplate chỉ nhận class_id NULL
        copy đi qua route template luôn 404
    end note
    note right of CopyOfOneClass
        class_id duy nhất per lớp - unique partial index
        source_template_id ghi provenance - detach khi xóa template
    end note
```

Nguồn: packages/db/src/schema/syllabus.ts:29-49; apps/server/src/lib/syllabus-curriculum.ts:42-55; apps/server/src/routes/syllabus.ts:283-339, 341-622, 624-718.

## S2 — SyllabusLesson.status: tiến độ per-lớp

```mermaid
stateDiagram-v2
    [*] --> Upcoming : tạo bài hoặc copy từ template
    Upcoming --> Current : GV đánh đang học trên lớp
    Current --> Done : GV hoàn tất buổi
    Upcoming --> Done : GV đánh đã dạy trực tiếp
    Done --> Current : chỉnh lại tiến độ
    note right of Upcoming
        copy template sang lớp luôn reset về upcoming
        kind thì giữ nguyên - kind là nội dung
    end note
```

Nguồn: packages/db/src/schema/syllabus.ts:93-99; apps/server/src/lib/syllabus-curriculum.ts:184-198; apps/web/src/components/syllabus/lesson-status.tsx:3-8.

## S3 — Class.schedulingMode nhìn từ giáo trình (điểm chạm classes)

```mermaid
stateDiagram-v2
    [*] --> ManualEmpty : tạo lớp trống không template
    [*] --> AutoFromTemplate : tạo lớp kèm template
    ManualEmpty --> AutoFromTemplate : nhập giáo trình - sessionsTotal bằng số bài
    AutoFromTemplate --> ManualEmpty : gỡ giáo trình khi lớp 0 buổi thật - gói buổi về 0
    AutoFromTemplate --> AutoWithLessons : gỡ giáo trình khi lớp còn buổi thật - giữ chế độ và tổng buổi
    AutoWithLessons --> AutoWithLessons : nhập giáo trình lại bị chặn 409 hoặc bảo trì buổi bị chặn 409
    note right of AutoFromTemplate
        lớp có copy không bao giờ là manual theo isManualClass
        thêm hoặc xóa buổi thủ công bị chặn 409 class-has-syllabus
    end note
    note right of ManualEmpty
        manual cũng xảy ra khi schedulingMode manual hoặc đã có class_session
    end note
```

Nguồn: apps/server/src/lib/class-mode.ts:17-36; apps/server/src/routes/syllabus.ts:527-538, 652-662; apps/server/src/routes/kernel.ts:2425-2433, 2651-2660.
