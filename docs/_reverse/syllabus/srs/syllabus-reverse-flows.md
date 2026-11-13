# Flows — feature `syllabus` (reverse)

Mỗi flow có sequenceDiagram (tương tác) và flowchart (nhánh nghiệp vụ). Nguồn chính: [S1][S2][S3][S9][S14][S15][S24][S8].

## F1 — Tạo template giáo trình (thủ công hoặc kèm nội dung bulk)

Sequence: GV điền form → command bus POST → batch nguyên tử → snapshot refresh → mở detail.

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant M as "Modal Tạo syllabus"
    participant Bus as "Command bus (web)"
    participant API as "POST /api/syllabus-templates"
    participant DB as "D1 batch"
    GV->>M: Điền tên, loại, trình độ, kỹ năng
    GV->>M: Tuỳ chọn chọn file Excel/CSV (xem F2)
    M->>M: Chặn submit khi thiếu tên hoặc IELTS thiếu kỹ năng
    M->>Bus: add-syllabus payload
    Bus->>API: POST body (syllabusCreateSchema)
    API->>API: Zod validate (IELTS cần kỹ năng, cap 500 nodes)
    alt body không hợp lệ
        API-->>Bus: 400 invalid body hoặc 413 quá 2 MiB
        Bus-->>M: Hiện lỗi
    else hợp lệ
        API->>DB: batch insert syllabus + modules + lessons
        DB-->>API: OK
        API-->>Bus: 201 id
        Bus->>Bus: Refresh snapshot
        Bus-->>M: refreshed
        M->>GV: Đóng modal, mở trang chi tiết
    end
```

```mermaid
flowchart TD
    A["GV mở modal Tạo syllabus"] --> B{"Đã điền tên<br/>và IELTS có kỹ năng?"}
    B -->|"Thiếu"| B1["Chặn submit + hiện lỗi"]
    B1 --> A
    B -->|"Đủ"| C{"Có file import?"}
    C -->|"Có"| D["Kèm modules từ file (F2)"]
    C -->|"Không"| E["totalLessons từ form"]
    D --> F["POST syllabus-templates"]
    E --> F
    F --> G{"Zod + cap 500 + 2MiB?"}
    G -->|"Lỗi"| H["400/413 hiển thị lỗi"]
    H --> A
    G -->|"Đạt"| I["Batch: syllabus + modules + lessons"]
    I --> J["Snapshot refresh"]
    J --> K["Navigate sang detail"]
```

Nguồn: apps/web/src/components/modals/add-syllabus-modal.tsx:88-124; apps/server/src/routes/syllabus.ts:142-196; packages/api/src/contracts.ts:204-246.

## F2 — Parse file Excel/CSV (client-side, dùng cho F1 và F3)

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant UI as "Màn tạo / chi tiết"
    participant P as "parseSyllabusFile (client)"
    GV->>UI: Chọn file .csv hoặc .xlsx
    UI->>P: parseSyllabusFile(file)
    P->>P: Kiểm đuôi file và kích thước 2MB
    alt sai đuôi hoặc quá 2MB
        P-->>UI: Lỗi từ chối file
    else CSV
        P->>P: Papa.parse + strip BOM
        P->>P: rowsToModules (5 cột, mapping Loại)
    else XLSX
        P->>P: readSheet (read-excel-file)
        P->>P: rowsToModules
    end
    alt có lỗi dòng
        P-->>UI: Danh sách lỗi (preview hiển thị tối đa 100)
    else ok
        P-->>UI: modules + lessonCount (preview bảng 5 cột)
        UI->>UI: Auto-fill số buổi và khóa ô nhập
    end
```

```mermaid
flowchart TD
    A["File được chọn"] --> B{".csv hoặc .xlsx?"}
    B -->|"Không"| B1["Từ chối: Chỉ nhận file .csv hoặc .xlsx"]
    B -->|"Đúng"| C{"Kích thước dưới 2 MB?"}
    C -->|"Không"| C1["Từ chối: File vượt giới hạn 2 MB"]
    C -->|"Đúng"| D{"Header template cũ v2 hoặc v3?"}
    D -->|"V2 ô5 Trạng thái"| D1["1 lỗi: tải file mẫu mới"]
    D -->|"V3 cột3 Buổi học"| D2["1 lỗi: tải file mẫu mới"]
    D -->|"Không"| E["Bỏ dòng header mới nếu có"]
    E --> F["Duyệt từng dòng"]
    F --> G{"Ô dạng Date?"}
    G -->|"Có"| G1["Lỗi dòng: đổi ô sang Text"]
    G -->|"Không"| H{"Cột Loại hợp lệ?"}
    H -->|"Từ vựng v2"| H1["Lỗi dòng: nghi template cũ"]
    H -->|"Lạ"| H2["Lỗi dòng: dùng giữa kỳ hoặc cuối kỳ"]
    H -->|"Đạt"| I{"Có tên module?"}
    I -->|"Rỗng"| J["Kế thừa module trước"]
    I -->|"Mới"| K["Tạo module mới (kiểm 500/10.000 ký tự)"]
    J --> L{"Có nội dung buổi?"}
    K --> L
    L -->|"Có (mục tiêu/tài liệu/Loại khác rỗng)"| M["Thêm buổi Buổi n, tăng số thứ tự"]
    L -->|"Không"| N["Module-only row, không tiêu số"]
    M --> O{"Còn dòng?"}
    N --> O
    O -->|"Có"| G
    O -->|"Hết"| P{"Có lỗi hoặc không có dòng dữ liệu?"}
    P -->|"Có"| P1["Trả lỗi, không parse nửa chừng"]
    P -->|"Không"| Q{"Trên 500 mục?"}
    Q -->|"Có"| Q1["Lỗi vượt giới hạn 500"]
    Q -->|"Không"| R["Trả modules + lessonCount"]
```

Nguồn: apps/web/src/lib/syllabus-import.ts:29-45, 70-221, 227-266; tests apps/web/src/lib/syllabus-import.test.ts:17, 61, 103, 265, 497, 641.

## F3 — Ghi đè nội dung template (replace-content)

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant D as "Trang chi tiết template"
    participant P as "Parser client"
    participant API as "POST syllabus-templates/:id/replace-content"
    participant DB as "D1 batch"
    GV->>D: Nhập từ Excel/CSV
    D->>P: parseSyllabusFile
    P-->>D: Preview ok
    GV->>D: Bấm Ghi đè nội dung
    D->>D: Refresh snapshot trước khi mở confirm (đếm đúng số sẽ xóa)
    D->>GV: Modal xác nhận (N module · M buổi sẽ bị XÓA)
    alt GV hủy
        GV->>D: Hủy - giữ nguyên dữ liệu
    else GV xác nhận
        D->>API: replace-syllabus-content modules
        API->>API: findTemplate (chỉ template, copy thì 404)
        API->>DB: Batch: xóa lessons + xóa modules + update totalLessons + chèn cây mới
        DB-->>API: OK
        API-->>D: 200 ok
        D->>D: Clear preview khi ghi chắc chắn landed
        D-->>GV: Toast "Đã ghi đè nội dung giáo trình."
    end
```

```mermaid
flowchart TD
    A["Preview file ok ở trang chi tiết"] --> B["Refresh snapshot"]
    B --> C["Modal xác nhận ghi đè"]
    C --> D{"GV chọn?"}
    D -->|"Hủy"| E["Không đổi gì"]
    D -->|"Ghi đè"| F{"Id là template?"}
    F -->|"Copy hoặc lạ"| G["404 syllabus not found"]
    F -->|"Template"| H["Batch nguyên tử: xóa cây cũ + chèn cây mới + cập nhật totalLessons"]
    H --> I{"Kết quả chạy lệnh"}
    I -->|"refreshed hoặc committed"| J["Clear preview + toast thành công"]
    I -->|"definite-failure"| K["Giữ preview + mở lại modal để sửa rồi thử lại"]
```

Nguồn: apps/server/src/routes/syllabus.ts:201-277; apps/web/src/routes/_auth/syllabus/$syllabusId.tsx:141-144, 444-463; e2e apps/e2e/specs/syllabus-detail-import-overwrite.spec.ts:21.

## F4 — Nhập giáo trình từ template vào lớp (deep-copy + self-heal)

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant CM as "Tab Giáo trình của lớp"
    participant IM as "Modal Nhập từ template"
    participant API as "POST classes/:id/curriculum/import"
    participant DB as "D1 batch"
    GV->>CM: Nhập từ template
    CM->>IM: Mở modal (chỉ liệt kê template)
    IM->>API: import-curriculum templateId
    API->>API: Tìm lớp và template (cả hai 404 nếu lạ)
    alt copy đã tồn tại
        API->>API: Nhánh tự-heal (lớp kẹt manual 0 buổi, cây 1..52 bài)
        alt heal được
            API->>DB: Update lớp về copy + auto + tổng buổi
            API->>API: backfillStuckEnrollments
            API-->>IM: 201 id
        else không heal được
            API-->>IM: 409 CURRICULUM_ALREADY_EXISTS
        end
    else chưa có copy
        API->>API: Kiểm trần 500 node, 52 buổi, template rỗng, buổi manual
        alt vi phạm trần
            API-->>IM: 422 TEMPLATE_TOO_LARGE hoặc TOO_MANY_LESSONS hoặc EMPTY_TEMPLATE
        else lớp có buổi thủ công
            API-->>IM: 409 MANUAL_SESSIONS_EXIST
        else đạt
            API->>DB: Batch: copy syllabus + modules + lessons + links + update lớp (auto, sessionsTotal)
            API->>API: backfillStuckEnrollments khi tổng buổi lớn hơn 0
            API-->>IM: 201 copyId
        end
    end
    IM->>IM: Refresh snapshot rồi đóng modal
```

```mermaid
flowchart TD
    A["GV chọn template trong modal nhập"] --> B["POST curriculum/import"]
    B --> C{"Lớp tồn tại cùng org?"}
    C -->|"Không"| C1["404 class not found"]
    C -->|"Có"| D{"Template hợp lệ class_id NULL?"}
    D -->|"Không"| D1["404 syllabus not found"]
    D -->|"Có"| E{"Đã có bản copy?"}
    E -->|"Có"| F{"Lớp kẹt manual 0 buổi, 0 cs, cây 1-52 bài?"}
    F -->|"Có"| F1["Heal: update lớp + backfill + 201"]
    F -->|"Không"| F2{"Lớp auto còn buổi kẹt?"}
    F2 -->|"Có"| F3["Backfill + 201"]
    F2 -->|"Không"| F4["409 CURRICULUM_ALREADY_EXISTS"]
    E -->|"Không"| G{"Quá 500 node?"}
    G -->|"Có"| G1["422 TEMPLATE_TOO_LARGE"]
    G -->|"Không"| H{"Có buổi học thủ công?"}
    H -->|"Có"| H1["409 MANUAL_SESSIONS_EXIST"]
    H -->|"Không"| I{"Lớp trống và template 0 bài hoặc trên 52 bài?"}
    I -->|"Có"| I1["422 EMPTY_TEMPLATE hoặc TOO_MANY_LESSONS"]
    I -->|"Không"| J["Batch: deep-copy + links remap + update lớp sang auto"]
    J --> K{"Batch lỗi FK tài liệu?"}
    K -->|"Có"| K1["422 material-not-found"]
    K -->|"Không"| L["Backfill học viên kẹt"]
    L --> M["201 copyId + snapshot refresh"]
```

Nguồn: apps/server/src/routes/syllabus.ts:341-622; apps/server/src/lib/syllabus-curriculum.ts:133-215; apps/web/src/components/modals/import-syllabus-modal.tsx:68-88; tests apps/server/src/manual-sessions.test.ts:995, 1036, 1130, 1232, 1340, 1421; e2e apps/e2e/specs/syllabus-class-curriculum.spec.ts:128, 284.

## F5 — Gỡ giáo trình khỏi lớp

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant CM as "Tab Giáo trình"
    participant API as "POST classes/:id/curriculum/remove"
    participant DB as "D1 batch"
    GV->>CM: Bấm Gỡ giáo trình
    CM->>GV: Modal xác nhận (cây + tiến độ sẽ bị xóa)
    GV->>CM: Xác nhận
    CM->>API: remove-curriculum
    API->>API: findClassCurriculum theo class_id
    alt không có copy
        API->>DB: Heal con trỏ lệch về null (idempotent)
        API-->>CM: 200 ok
    else có copy
        API->>DB: Batch: null pointer + reset manual/0 nếu 0 buổi thật + gói buổi về 0 + xóa lessons + modules + copy
        DB-->>API: OK
        API-->>CM: 200 ok
    end
    CM->>CM: Snapshot refresh - tab về empty state
```

```mermaid
flowchart TD
    A["GV xác nhận gỡ"] --> B["POST curriculum/remove"]
    B --> C{"Lớp tồn tại?"}
    C -->|"Không"| C1["404 class not found"]
    C -->|"Có"| D{"Có bản copy theo class_id?"}
    D -->|"Không"| E["Null con trỏ lệch, 200 ok"]
    D -->|"Có"| F{"Lớp còn buổi thật (lesson hoặc class_session)?"}
    F -->|"Không còn"| G["Reset manual + sessionsTotal 0 + gói buổi về 0"]
    F -->|"Còn"| H["Giữ nguyên chế độ và tổng buổi"]
    G --> I["Xóa lessons trước, modules, rồi bản copy"]
    H --> I
    I --> J["200 ok + refresh"]
```

Nguồn: apps/server/src/routes/syllabus.ts:624-718; apps/web/src/components/class-detail/curriculum-management-section.tsx:83-118; tests apps/server/src/manual-sessions.test.ts:1421.

## F6 — Xóa template giáo trình

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant G as "Danh sách giáo trình"
    participant API as "POST syllabus-templates/:id/remove"
    participant DB as "D1 batch"
    GV->>G: Nút Xóa trên card
    G->>GV: Modal xác nhận (N lớp đang dùng KHÔNG bị ảnh hưởng)
    GV->>G: Xóa template
    G->>API: delete-syllabus
    API->>API: findTemplate - copy thì 404
    API->>DB: Batch: clear con trỏ các lớp + detach provenance + xóa lessons + modules + template
    DB-->>API: OK
    API-->>G: 200 ok
    G->>G: Snapshot refresh - card biến mất
```

```mermaid
flowchart TD
    A["GV xác nhận xóa template"] --> B["POST syllabus-templates/:id/remove"]
    B --> C{"Id là template class_id NULL?"}
    C -->|"Copy hoặc lạ"| D["404 che tồn tại"]
    C -->|"Template"| E["Batch: null con trỏ các lớp trỏ tới"]
    E --> F["Detach source_template_id của các copy"]
    F --> G["Xóa lessons trước, modules, rồi template"]
    G --> H["200 ok - copy của lớp vẫn sống độc lập"]
```

Nguồn: apps/server/src/routes/syllabus.ts:283-339; apps/web/src/components/syllabus/delete-syllabus-button.tsx:35-74; tests apps/server/src/syllabus-template-migration.test.ts:233.

## F7 — Thêm/sửa bài học kèm tài liệu ngân hàng (#655)

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant LM as "Modal Thêm/Sửa buổi học"
    participant API as "POST .../lessons"
    participant DB as "D1 batch"
    GV->>LM: Điền nội dung, chọn Loại (chỉ trên màn syllabus), chọn tài liệu
    LM->>LM: Không chạm lựa chọn tài liệu thì không gửi materialIds
    LM->>API: lessonUpsertSchema payload
    API->>API: Resolve syllabus rồi module (404 khi lạ)
    API->>API: resolveMaterialIds: dedupe + kiểm org (422 id đầu tiên thiếu)
    alt materialIds vắng mặt
        API->>DB: Insert/update bài đơn thuần
    else có materialIds
        API->>DB: Batch: ghi bài + links position 0..n-1
        alt FK fail giữa chừng
            API->>API: Re-check tài liệu còn tồn tại
            API-->>LM: 422 material-not-found
        else đạt
            API-->>LM: 201 id (thêm) hoặc 200 ok (sửa)
        end
    end
```

```mermaid
flowchart TD
    A["GV lưu bài học"] --> B{"Modal mở từ đâu?"}
    B -->|"Màn lớp"| C["Không gửi kind và status - server giữ nguyên giá trị"]
    B -->|"Màn syllabus"| D["Gửi kind theo lựa chọn"]
    C --> E{"Sửa hay thêm?"}
    D --> E
    E -->|"Sửa bài có sẵn"| F{"Có materialIds trong body?"}
    E -->|"Thêm bài mới"| F
    F -->|"Vắng (sửa)"| G["Không đụng links hiện có"]
    F -->|"Có"| H["Dedupe + kiểm tra tài liệu org"]
    H --> I{"Có id lạ?"}
    I -->|"Có"| I1["422 material-not-found kèm id đầu tiên"]
    I -->|"Không"| J["Batch: ghi bài + xóa links cũ nếu sửa + chèn links position 0..n-1"]
    J --> K{"FK fail do tài liệu vừa bị xóa?"}
    K -->|"Có"| K1["422 material-not-found"]
    K -->|"Không"| L["Thành công"]
    G --> L
```

Nguồn: apps/server/src/routes/syllabus-content-routes.ts:67-115, 282-357, 418-506; apps/web/src/components/modals/add-lesson-modal.tsx:17-69; tests apps/server/src/syllabus-material-links.test.ts:241, 273, 311.

## F8 (điểm chạm đọc) — Tài liệu buổi dạy suy từ bài N

```mermaid
sequenceDiagram
    participant CLS as "Tab Lịch học (feature classes)"
    participant SM as "resolveCurriculumMaterials"
    participant DB as "DB"
    CLS->>SM: Hỏi tài liệu cho buổi ngày D
    SM->>DB: Tìm copy theo class_id (không đọc con trỏ)
    alt không có copy hoặc ngày ngoài lịch hoặc nhóm nghỉ lễ
        SM-->>CLS: Mảng rỗng
    else có
        SM->>DB: Đếm chỉ số buổi dạy (bỏ nhóm holiday) rồi lấy bài N theo module/lesson position
        SM->>DB: Đọc links của bài N (projection teacher-safe)
        SM-->>CLS: Danh sách tài liệu của bài N
    end
```

```mermaid
flowchart TD
    A["Xem tài liệu buổi ngày D"] --> B{"Lớp có bản copy?"}
    B -->|"Không"| R["Mảng rỗng"]
    B -->|"Có"| C{"Ngày D có dòng lesson?"}
    C -->|"Không"| R
    C -->|"Có"| D{"Toàn bộ dòng là holiday?"}
    D -->|"Có"| R
    D -->|"Không"| E["Tính chỉ số buổi dạy tăng dần ngày, bỏ holiday"]
    E --> F{"Chỉ số còn trong số bài của cây?"}
    F -->|"Không"| R
    F -->|"Có"| G["Lấy bài N theo module position rồi lesson position"]
    G --> H["Trả links tài liệu của bài N"]
```

Nguồn: apps/server/src/lib/session-curriculum-materials.ts:32-111, 124-174. Ghi chú ranh giới: flow đọc này thuộc mặt hiển thị của feature classes; syllabus chỉ cung cấp cây + links.
