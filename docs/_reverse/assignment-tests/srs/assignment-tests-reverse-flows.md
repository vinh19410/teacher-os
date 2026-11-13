# Flows — assignment-tests (reverse)

Mỗi flow có cả sequenceDiagram và flowchart. Số câu/tên màn hình lấy nguyên văn từ code.

## F1 — Tạo bộ đề mới (create)

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giáo viên
    participant SH as TestBuilderShell
    participant API as POST /api/assignments/tests
    participant DB as D1 assignment_test
    GV->>SH: Điền tiêu đề, mô tả, thời gian, preset, collection/group
    SH->>SH: buildTestPayload — zod assignmentTestCreateSchema
    alt Payload hợp lệ
        SH->>API: POST body {title, description?, skill, timeLimitSeconds, collection?, testGroup?}
        API->>DB: INSERT assignment_test (status = "draft")
        DB-->>API: id
        API-->>SH: 201 {"id"}
        alt partsSetPayload có part đã gán trong phiên
            SH->>API: PUT /api/assignments/tests/:id/parts
            API->>DB: batch (delete parts cũ + insert parts mới)
            DB-->>API: OK
            API-->>SH: 200 {"id"}
        else Chưa gán part nào
            SH->>SH: Bỏ qua PUT parts
        end
        SH->>GV: Điều hướng /assignments/tests/:id
    else Payload lỗi
        SH->>GV: Hiện lỗi field (không gọi API)
    end
```

```mermaid
flowchart TD
    A["Mở /assignments/tests/new"] --> B["Điền header bộ đề"]
    B --> C{"buildTestPayload hợp lệ?"}
    C -->|"Không"| D["Hiện lỗi field — tiêu đề / thời gian / mô tả"]
    D --> B
    C -->|"Có"| E["POST /api/assignments/tests"]
    E --> F{"Server tạo row draft thành công?"}
    F -->|"Không — 500 test write conflict"| G["Hiện thông báo lỗi lưu chung"]
    G --> B
    F -->|"Có — 201"| H{"Có part đã gán từ phiên soạn?"}
    H -->|"Có"| I["PUT /:id/parts — replace-all batch"]
    I --> J["Điều hướng /assignments/tests/:id"]
    H -->|"Không"| J
    J --> K["Bộ đề draft xuất hiện trong kernel snapshot"]
    K --> DONE1["Done — tạo bộ đề xong"]
```

Nguồn: `apps/server/src/routes/assignments/tests.ts:63-86`; `apps/web/src/components/assignment-tests/test-builder-shell.tsx:489-532`; `apps/web/src/components/assignment-tests/test-header-form.tsx:85-121`.

## F2 — Ghép part vào slot (ngân hàng hoặc soạn mới)

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giáo viên
    participant SH as TestBuilderShell
    participant PK as PromptPickerDialog / PromptComposer
    participant API as PUT parts · POST/PATCH prompts
    GV->>SH: Bấm "Chọn từ ngân hàng" hoặc "Soạn mới" trên slot
    alt Chọn từ ngân hàng
        SH->>PK: Mở dialog (prompt lọc skill+part, không hybrid, mới nhất trước)
        PK-->>GV: Danh sách part kèm badge Sẵn sàng / Bản nháp
        GV->>PK: Chọn một prompt
        PK-->>SH: onPick(promptId)
        SH->>SH: setAssigned(part → promptId); xóa slot draft của part
    else Soạn mới trong slot
        SH->>PK: Mở composer lockPart (skill/part của slot)
        GV->>PK: Soạn nội dung + chọn trạng thái Bản nháp / Sẵn sàng
        PK->>API: create-assignment-prompt (status draft hoặc ready)
        API-->>PK: 201 {id}
        PK-->>SH: Tự gán prompt vào slot (handleAssign)
    end
    alt Chế độ edit
        SH->>API: set-assignment-test-parts (PUT replace-all)
        alt definite-failure (ví dụ 409 khóa)
            SH-->>SH: Rollback slot về prompt cũ
        else refreshed
            SH-->>GV: Snapshot cập nhật, slot hiển thị dải câu mới
        end
    else Chế độ create
        SH-->>SH: Chỉ giữ state — gửi phần khi "Tạo bộ đề"
    end
```

```mermaid
flowchart TD
    A["Slot trống — Chưa gán part"] --> B{"Cách lấp slot?"}
    B -->|"Chọn từ ngân hàng"| C["Dialog lọc skill và part của slot"]
    C --> D{"Ngân hàng có prompt phù hợp?"}
    D -->|"Không"| E["Gợi ý đóng dialog và bấm Soạn mới"]
    E --> B
    D -->|"Có"| F["Chọn prompt — badge Sẵn sàng hoặc Bản nháp"]
    F --> G["Gán vào slot + xóa slot draft"]
    B -->|"Soạn mới"| H["Composer lockPart — skill và part cố định"]
    H --> I{"composerCanSave?"}
    I -->|"Không"| J["Hiện lỗi field composer"]
    J --> H
    I -->|"Có"| K["Lưu vào ngân hàng — create prompt"]
    K --> L["Tự gán prompt mới vào slot"]
    G --> M{"Đang ở chế độ nào?"}
    L --> M
    M -->|"Edit"| N["PUT parts replace-all ngay"]
    N --> O{"Kết quả ghi?"}
    O -->|"definite-failure"| P["Rollback slot về trạng thái cũ"]
    O -->|"refreshed hoặc unknown"| Q["Giữ state mới — snapshot xác nhận"]
    M -->|"Create"| R["Chờ nút Tạo bộ đề rồi gửi parts"]
    P --> DONE2["Done — slot ổn định"]
    Q --> DONE2
    R --> DONE2
```

Nguồn: `test-builder-shell.tsx:341-369,371-487,603-613,838-848`; `prompt-picker-dialog.tsx:29-65`; `test-part-slot.tsx:42-76`.

## F3 — Soát đáp án (paste key → compare → apply)

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giáo viên
    participant P as AnswersCheckingPanel
    participant L as test-answer-key (pure)
    participant API as PATCH /api/assignments/prompts/:id
    GV->>P: Bấm "Soát đáp án" — View All grid N câu
    GV->>P: Dán key (mỗi dòng "số. giá trị[/alt]")
    P->>L: parseTestAnswerKey(keyText, ranges)
    L-->>P: entries + errors (dòng lỗi không chặn dòng hợp lệ)
    P->>L: compareAnswerKey(entries, cells)
    L-->>P: match / mismatch / missing / extra
    P->>L: answerKeyPartChanges — chỉ mismatch
    alt Key toàn match
        P-->>GV: "Key khớp toàn bộ — không có gì để ghi."
    else Có câu lệch
        P-->>GV: "Sẽ đổi N câu ở M part" + nút Áp dụng
        GV->>P: Confirm "Ghi đè đáp án N câu ở M part?"
        loop Từng part trong changes
            P->>API: update-assignment-prompt (questions: chỉ thay answer+alts)
            alt PATCH lỗi
                P-->>GV: "Ghi lỗi ở part …— chạy lại Apply" và dừng
            else OK
                P->>P: Tiếp part kế tiếp
            end
        end
        P-->>GV: "Đã ghi N câu ở M part — bảng so khớp đã tải lại"
    end
```

```mermaid
flowchart TD
    A["Bấm Soát đáp án"] --> B{"Có part đã gán có câu hỏi?"}
    B -->|"Không"| C["Empty state — gán part có câu hỏi trước"]
    C --> DONE3["Done"]
    B -->|"Có"| D["View All grid theo số câu tuyệt đối"]
    D --> E["Dán answer key"]
    E --> F{"Dòng key có lỗi parse?"}
    F -->|"Có"| G["Liệt kê dòng lỗi — dòng hợp lệ vẫn so sánh"]
    F -->|"Không"| H["Compare ngay"]
    G --> H
    H --> I{"Kết quả diff?"}
    I -->|"Toàn match"| J["Key khớp toàn bộ — không có gì để ghi"]
    J --> DONE3
    I -->|"Có mismatch hoặc missing hoặc extra"| K["Preview sẽ đổi N câu ở M part — chỉ mismatch"]
    K --> L{"GV bấm Áp dụng?"}
    L -->|"Không"| E
    L -->|"Có và confirm"| M["PATCH tuần tự từng part"]
    M --> N{"Part nào lỗi?"}
    N -->|"Có"| O["Dừng — phần trước đã ghi không hoàn tác"]
    O --> P["Chạy lại Apply — chỉ đụng câu còn lệch"]
    P --> E
    N -->|"Không"| Q["Đã ghi N câu — compare về 0 mismatch"]
    Q --> DONE3
```

Nguồn: `answers-checking-panel.tsx:112-137,139-256`; `apps/web/src/lib/test-answer-key.ts:105-181,206-231`; `apps/web/src/lib/repos/assignment-tests.ts:164-219`; e2e `apps/e2e/specs/assignment-test-create.spec.ts:226-259`.

## F4 — Xem trước bộ đề (giấy thi học viên)

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giáo viên
    participant SH as TestBuilderShell
    participant HS as sessionStorage handoff
    participant PV as Preview route + TestPreviewPaper
    GV->>SH: Bấm "Xem trước"
    SH->>HS: saveTestPreviewDraft (test + parts + items)
    alt JSON ≤ 1MB
        HS-->>PV: Draft nguyên văn khi route mở
    else Vượt 1MB
        SH->>HS: Lưu ref (testId + assignedByPart)
        PV->>PV: resolveRefDraft dựng lại từ kernel snapshot
    end
    PV-->>GV: Paper: tiêu đề, Time x minutes, Questions 1–N, từng part
    Note over PV: Không bao giờ render answer / alts
    GV->>PV: "Quay lại soạn" — history.back()
```

```mermaid
flowchart TD
    A["Bấm Xem trước — create hoặc edit"] --> B["Lưu handoff vào sessionStorage"]
    B --> C{"Kích thước JSON?"}
    C -->|"Dưới 1MB"| D["Nhúng nguyên văn draft"]
    C -->|"Trên 1MB"| E["Lưu ref — testId và slot map"]
    D --> F["Điều hướng /assignments/tests/preview"]
    E --> F
    F --> G{"Có handoff hợp lệ?"}
    G -->|"Không"| H["Empty state — trang không mở trực tiếp bằng link"]
    H --> DONE4["Done"]
    G -->|"Có"| I{"Loại handoff?"}
    I -->|"Nguyên văn"| J["Render draft"]
    I -->|"Ref"| K["resolveRefDraft từ snapshot"]
    K --> J
    J --> L["Paper — READING PASSAGE 1 đến 3 — không đáp án"]
    L --> DONE4
```

Nguồn: `test-builder-shell.tsx:553-587`; `apps/web/src/lib/assignment-test-preview-draft.ts:135-202`; `preview.tsx:29-146`; `test-preview-paper.tsx:37-61,96-174`.

## F5 — Sửa bộ đề (metadata + khóa parts 409)

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giáo viên
    participant SH as TestBuilderShell (edit)
    participant API as PATCH test · PUT parts
    participant DB as D1
    GV->>SH: Mở /assignments/tests/:id (skill select khóa)
    GV->>SH: Đổi tiêu đề/thời gian/collection… rồi "Lưu thông tin"
    SH->>API: PATCH /:id (partial)
    alt skill bị đổi
        API-->>SH: 400 {"error":"skill is immutable"}
    else OK
        API->>DB: UPDATE (trả 200 {id}; body rỗng → no-op 200)
        API-->>SH: 200
        SH-->>GV: "Đã lưu thông tin bộ đề."
    end
    GV->>SH: Đổi/gỡ part trong slot
    SH->>API: PUT /:id/parts
    alt Test đã có quiz_attempt cùng org và payload tạo diff
        API-->>SH: 409 {"error":"test parts locked","code":"TEST_PARTS_LOCKED"}
        SH-->>GV: Thông báo khóa + slot hoàn nguyên (rollback)
    else Không có attempt
        API->>DB: batch delete + insert parts
        API-->>SH: 200 {id}
    end
```

```mermaid
flowchart TD
    A["Mở /assignments/tests/:id"] --> B["Skill bị khóa theo part đã gắn"]
    B --> C{"Thao tác nào?"}
    C -->|"Lưu thông tin"| D["PATCH partial metadata"]
    D --> E{"Có đổi skill?"}
    E -->|"Có"| F["400 skill is immutable — UI đã khóa select"]
    F --> DONE5["Done"]
    E -->|"Không"| G["200 — thông báo Đã lưu thông tin bộ đề"]
    G --> DONE5
    C -->|"Đổi hoặc gỡ part"| H["PUT parts replace-all"]
    H --> I{"Payload trùng hiện trạng?"}
    I -->|"Có — idempotent"| J["200 không đụng DB"]
    J --> DONE5
    I -->|"Không"| K{"Test có quiz_attempt cùng org?"}
    K -->|"Có"| L["409 TEST_PARTS_LOCKED + rollback UI"]
    L --> DONE5
    K -->|"Không"| M["batch delete + insert — 200"]
    M --> DONE5
    C -->|"Xem trước hoặc Soát đáp án"| N["Giống create — dữ liệu từ test đang mở"]
    N --> DONE5
```

Nguồn: `tests.ts:88-131,244-281`; `test-builder-shell.tsx:302-328,489-515`; `use-kernel-form-submit.ts:18-30`; test `tests.test.ts:301-314,392-555`.

## F6 — Xóa bộ đề

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Caller (hiện chỉ API/test — G-3)
    participant API as DELETE /api/assignments/tests/:id
    participant DB as D1
    Caller->>API: DELETE
    alt Không thuộc org / không tồn tại
        API-->>Caller: 404 {"error":"test not found"}
    else OK
        API->>DB: batch [delete parts theo testId, delete test theo id+org]
        DB-->>API: OK
        API-->>Caller: 200 {"id"}
        Note over DB: quiz_attempt.test_id SET NULL — điểm giữ nguyên
    end
```

```mermaid
flowchart TD
    A["DELETE /api/assignments/tests/:id"] --> B{"Test thuộc org hiện tại?"}
    B -->|"Không"| C["404 test not found"]
    C --> DONE6["Done"]
    B -->|"Có"| D["Một batch — xóa parts và xóa test"]
    D --> E["200 — trả id"]
    E --> F["Attempt cũ giữ nguyên — test_id null"]
    F --> DONE6
```

Nguồn: `tests.ts:133-161`; `packages/db/src/schema/quiz-attempt.ts:35-40,57-59`; mutation map `apps/web/src/lib/repos/kernel.ts:289-294`; gap `../reverse-gaps.md` G-3.

## F7 — Bản nháp autosave + phục hồi

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giáo viên
    participant SH as TestBuilderShell (create)
    participant LS as localStorage teacher-os:test-draft:new
    GV->>SH: Soạn header / nội dung slot
    SH->>SH: testDraftHasContent? — form trắng thì bỏ qua
    SH->>LS: Debounce 1s — saveAssignmentTestDraft (schema v2)
    alt Vượt 512KB / QuotaExceeded
        LS-->>LS: Bỏ qua + console.warn — flow soạn không gián đoạn
    else OK
        LS-->>SH: Đã lưu
    end
    GV->>SH: Rời trang / reload rồi quay lại
    SH->>LS: readAssignmentTestDraft
    alt Draft hợp lệ và chưa quá 7 ngày
        LS-->>SH: StoredAssignmentTestDraft
        SH-->>GV: Banner "Đã phục hồi bản nháp bộ đề…"
        GV->>SH: Tiếp tục (giữ) hoặc Hủy (xóa trắng form)
    else Lỗi shape / hết hạn
        LS-->>SH: null (xóa key)
        SH-->>GV: Form trống
    end
```

```mermaid
flowchart TD
    A["Soạn trong create mode"] --> B{"Có nội dung đáng lưu?"}
    B -->|"Không"| A
    B -->|"Có"| C["Debounce 1s — ghi localStorage"]
    C --> D{"Ghi thành công?"}
    D -->|"Quá 512KB hoặc Quota"| E["Bỏ qua và warn — tiếp tục soạn"]
    E --> A
    D -->|"OK"| F["Draft chờ"]
    F --> G["Quay lại /assignments/tests/new"]
    G --> H{"Draft hợp lệ schema v2 và còn dưới 7 ngày?"}
    H -->|"Không"| I["Xóa key — form trống"]
    I --> DONE7["Done"]
    H -->|"Có"| J["Banner phục hồi"]
    J --> K{"GV chọn?"}
    K -->|"Tiếp tục"| L["Header và slot drafts vào state"]
    K -->|"Hủy"| M["Xóa draft + reset toàn bộ form"]
    L --> N["Submit thành công — clearAssignmentTestDraft"]
    M --> N
    N --> DONE7
```

Nguồn: `apps/web/src/lib/assignment-test-draft-store.ts:15-23,144-226`; `test-builder-shell.tsx:101-171,256-277,489-510,589-601`.
