# States — assignment-prompt-bank (reverse)

Repo: /root/projects/teacher-os @ develop d6c0f6b5. Feature có 1 state-machine được lưu bền (`assignment_prompt.status`) và các máy trạng thái phái sinh/phiên (khóa nội dung derive theo dữ liệu tham chiếu; nháp soạn thảo sống trong localStorage/sessionStorage).

## 1. `assignment_prompt.status` — máy trạng thái lưu bền

Cột `status` text not null default `draft`, enum `draft | ready` — `packages/db/src/schema/assignment-prompt.ts:50`; enum hợp đồng `packages/api/src/contracts.ts:868` (trong base schema); migration `packages/db/src/migrations/0017_wet_jetstream.sql:13`.

```mermaid
stateDiagram-v2
    state "Ban nhap - draft" as Draft
    state "San sang giao - ready" as Ready

    [*] --> Draft : Tao de luu ban nhap (POST status=draft)
    [*] --> Ready : Tao de du dieu kien luon (POST status=ready)
    Draft --> Ready : PATCH status=ready (rule chat theo skill/part)
    Ready --> Draft : PATCH status=draft (metadata luon duoc sua)
    Draft --> Draft : PATCH khac (noi dung tu do)
    Ready --> Ready : PATCH metadata khi bi khoa noi dung

    note right of Ready
        Chi ready moi xuat hien trong modal Giao bai tap
        Gate server tra 400 prompt not ready (kernel.ts:1540-1542)
        PATCH ready ve draft van hop le - xem Conflict-1
    end note

    note left of Draft
        UI hien nhan Ban nhap
        Su duoc metadata moi luc ke ca khi da giao
    end note
```

Chi tiết chuyển tiếp:
- **Tạo trực tiếp ready**: create schema chấp nhận `status: "ready"` khi qua mọi rule chặt (stem, answer, audio, image...) — `packages/api/src/contracts.ts:874-1123`; E2E flow đầu tiên lưu luôn ready `apps/e2e/specs/assignment-prompt-create.spec.ts:18-68`. ✅
- **draft → ready**: PATCH `status:"ready"` — route validate lại type + per-question theo part/skill của ROW với rule chặt — `apps/server/src/routes/assignments/index.ts:241-281`. ✅
- **ready → draft**: `status` thuộc nhóm metadata luôn được ghi (`apps/server/src/routes/assignments/index.ts:471`); không có rào chắn nào dựa trên việc đề đã giao — lý do ra Conflict-1/OQ-2. 🟡
- **Không có trạng thái xóa/lưu trữ**: không có DELETE route hay cột deleted_at (Gap-1). ✅

## 2. Khóa chỉnh sửa — trạng thái derive (không lưu trong DB)

Hai khóa này không phải cột; chúng được tính lúc xử lý PATCH bằng probe dữ liệu tham chiếu — `apps/server/src/routes/assignments/index.ts:304-374,428-463`.

```mermaid
stateDiagram-v2
    state "Tu do sua" as Free
    state "Khoa noi dung - CONTENT_LOCKED" as ContentLocked
    state "Khoa Writing - WRITING_SECTION_LOCKED" as WritingLocked

    [*] --> Free : De vua tao chua duoc dung

    Free --> ContentLocked : Co quiz_attempt cung org tro vao de (grading hoac practice)
    ContentLocked --> ContentLocked : Van sua metadata (title band source status note)
    ContentLocked --> Free : Khong co cau lenh huy khoa trong feature nay

    Free --> WritingLocked : De bi class_assignment hoac assignment_test_part hoac study_pack_item tham chieu VA doi Writing
    WritingLocked --> Free : Tra Writing ve nhu cu (payload khac van luu duoc)

    note right of ContentLocked
        Probe 1 row - index.ts:428-453
        Khong the tu mo khoa bang PATCH
    end note

    note right of WritingLocked
        3 probe - index.ts:318-363
        Kiem tra truoc khoa noi dung
    end note
```

Lưu ý biên: hai khóa **kết hợp theo chiều AND**: nếu đề vừa bị tham chiếu Writing vừa có attempt, đổi nội dung + đổi Writing cùng lúc → Writing lock thắng vì được kiểm trước — `apps/server/src/routes/assignments/index.ts:319,429` (thứ tự if). ✅

## 3. Nháp soạn thảo cục bộ (localStorage `assignment-draft`)

Không thuộc DB; sống theo thiết bị trình duyệt — `apps/web/src/lib/assignment-draft-store.ts`.

```mermaid
stateDiagram-v2
    state "Khong co nhap" as Empty
    state "Co nhap autosave" as HasDraft
    state "Nhap het han hoac hong" as Stale

    [*] --> Empty
    Empty --> HasDraft : Ghi sau 1000ms khi co noi dung dang soan
    HasDraft --> HasDraft : Ghi de sau 1000ms moi lan sua
    HasDraft --> Empty : Luu thanh cong len server (xoa draft)
    HasDraft --> Empty : Banner bi huy (xoa draft)
    HasDraft --> Stale : Qua 7 ngay hoac schemaVersion khac 1
    Stale --> Empty : Doc xoa item, khong banner

    note right of HasDraft
        Vuot 512KB thi bo luu va console warn
        Che do sua promptId khong autosave
    end note
```

Chuyển tiếp "xoa khi luu thanh cong" chỉ xảy ra với kind `refreshed` / `committed` / `outcome-unknown` — `apps/web/src/routes/_auth/assignments/new.tsx:969-978`. ✅

## 4. Nháp xem trước (sessionStorage `teacher-os:assignment-preview-draft`)

Vòng đời ngắn trong 1 tab — `apps/web/src/lib/assignment-preview-draft.ts:57-78`.

```mermaid
stateDiagram-v2
    state "Trong" as PEmpty
    state "Da luu xem truoc" as PSaved
    state "Da lay - bi xoa" as PTaken

    [*] --> PEmpty
    PEmpty --> PSaved : Bam Xem truoc tu form soan
    PSaved --> PSaved : readPreviewDraft - doc khong xoa
    PSaved --> PTaken : Quay lai soan de - takePreviewDraft doc roi xoa
    PTaken --> PEmpty : Form khoi phuc xong
    PSaved --> PEmpty : Dong tab hoac het phien

    note right of PSaved
        Preview draft thang uu tien hon banner khoi phuc localStorage
    end note
```

## 5. Nhãn hiển thị derive (promptStatus)

Không phải state-machine thật — hàm derive thuần, nhưng quyết định nhãn chính của danh sách — `apps/web/src/components/assignments/assignment-status.ts:198-206`:

```mermaid
stateDiagram-v2
    state "Ban nhap" as L1
    state "Da dung N lop" as L2
    state "San sang" as L3

    [*] --> L1 : status = draft
    [*] --> L2 : status = ready va used > 0
    [*] --> L3 : status = ready va used = 0

    note right of L1
        Uu tien cao nhat - de da giao nhung ha ve draft van hien Ban nhap
        Nguon Conflict-1
    end note
```

used = số lớp distinct từ `classAssignments` theo promptId — `apps/web/src/routes/_auth/assignments/index.tsx:162-170`. ✅
