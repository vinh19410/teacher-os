# States — assignment-tests (reverse)

## S1 — `assignment_test.status` (draft / ready) + xóa

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Draft : POST tạo mới (status cố định "draft")
    state "Draft — bản nháp riêng tư" as Draft
    state "Ready — dùng được khi giao" as Ready
    state "Deleted — đã xóa (attempt giữ qua SET NULL)" as Deleted
    Draft --> Ready : PATCH status="ready"
    Ready --> Draft : PATCH status="draft"
    Draft --> Deleted : DELETE (batch parts + test)
    Ready --> Deleted : DELETE (batch parts + test)
    Ready --> [*] : (hiển thị cho học viên — touchpoint)
    Deleted --> [*]
    note right of Draft
        UI builder không có control status (G-1)
        đường ready quan sát được: PATCH API và
        publish exam-import (publish-to-bank.ts)
    end note
```

Nguồn: `packages/db/src/schema/assignment-test.ts:16,34`; `apps/server/src/routes/assignments/tests.ts:81,118`; `packages/api/src/contracts.ts:1217-1221`.

## S2 — `assignment_prompt.status` (nguyên liệu slot)

```mermaid
stateDiagram-v2
    direction LR
    [*] --> PDraft : tạo từ composer slot / trang ngân hàng
    state "Bản nháp (draft)" as PDraft
    state "Sẵn sàng (ready)" as PReady
    PDraft --> PReady : lưu composer với trạng thái Sẵn sàng
    PReady --> PDraft : đổi trạng thái composer về Bản nháp
    note right of PReady
        ready ép điều kiện: listening cần file nghe,
        image-based cần link ảnh, auto-skill cần đáp án
        mọi câu (composerSaveAllowed)
    end note
    PReady --> PReady : PATCH nội dung khi chưa có attempt
    PReady --> Locked : test có quiz_attempt
    state "Content-locked (409)" as Locked
```

Nguồn: `apps/web/src/components/assignment-tests/test-builder-shell.tsx:752-763,892-914`; khóa nội dung `apps/server/src/routes/assignments/index.ts:428-463`.

## S3 — `quiz_attempt` (điều kiện khóa parts)

```mermaid
stateDiagram-v2
    direction LR
    [*] --> InProgress : học viên bắt đầu đề practice
    state "in_progress" as InProgress
    state "submitted — đã nộp" as Submitted
    InProgress --> Submitted : nộp bài
    InProgress --> Locking : tồn tại → PUT parts diff bị 409
    Submitted --> Locking : tồn tại → PUT parts diff bị 409
    state "Parts khóa 409 TEST_PARTS_LOCKED" as Locking
    Submitted --> Orphan : giáo viên xóa test
    state "test_id NULL — điểm giữ nguyên" as Orphan
```

Nguồn: `packages/db/src/schema/quiz-attempt.ts:30-40,57-59,99-106`; khóa `apps/server/src/routes/assignments/tests.ts:264-281` (cả in_progress lẫn submitted — test `tests.test.ts:408-513`).

## S4 — Máy trạng thái màn builder (UI)

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Opening : vào /tests/new hoặc /tests/:id
    state "Opening — đọc draft / test row" as Opening
    Opening --> RestorePrompt : create mode có draft hợp lệ
    state "Banner phục hồi bản nháp" as RestorePrompt
    RestorePrompt --> Composing : Tiếp tục
    RestorePrompt --> Composing : Hủy (reset trắng)
    Opening --> Composing : edit mode hoặc không có draft
    state "Composing — header + slots" as Composing
    Composing --> SlotDialog : Chọn từ ngân hàng
    state "Dialog chọn part" as SlotDialog
    SlotDialog --> Composing : gán prompt / đóng
    Composing --> InlineComposer : Soạn mới / Chỉnh sửa
    state "Composer lockPart" as InlineComposer
    InlineComposer --> Composing : Đóng / lưu xong
    Composing --> AnswersPanel : Soát đáp án
    state "Panel soát đáp án" as AnswersPanel
    AnswersPanel --> Composing : Đóng
    Composing --> Preview : Xem trước
    state "Preview paper" as Preview
    Preview --> Composing : Quay lại soạn
    Composing --> Saving : Tạo bộ đề / Lưu thông tin
    state "Saving — submit.run" as Saving
    Saving --> Composing : refreshed / committed / unknown (draft bị xóa khi create)
    Saving --> Composing : definite-failure + rollback slot
```

Nguồn: `test-builder-shell.tsx:101-181,341-601,722-836`.
