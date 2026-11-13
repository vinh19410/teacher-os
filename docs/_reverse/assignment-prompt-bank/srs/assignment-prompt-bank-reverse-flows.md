# Flows — assignment-prompt-bank (reverse)

Repo: /root/projects/teacher-os @ develop d6c0f6b5. Mỗi flow có **cả** sequenceDiagram và flowchart. actors/participants dùng tên ASCII, label tiếng Việt đặt trong ngoặc kép.

## Bảng flow

| ID | Flow | Nguồn chính | Nhãn |
|----|------|-------------|------|
| F1 | Tạo đề mới và lưu vào ngân hàng (ready) | `apps/web/src/routes/_auth/assignments/new.tsx:829-991`, `apps/server/src/routes/assignments/index.ts:113-153` | ✅ |
| F2 | Lưu bị chặn vì thiếu mục bắt buộc | `apps/web/src/routes/_auth/assignments/new.tsx:836-844,1141-1172` | ✅ |
| F3 | Chỉnh sửa đề — field-diff + khóa nội dung/Writing + reconcile | `apps/web/src/routes/_auth/assignments/new.tsx:846-926,992-1051`, `apps/server/src/routes/assignments/index.ts:199-525` | ✅ |
| F4 | Xem trước góc nhìn học viên (handoff hoặc đề đã lưu) | `apps/web/src/routes/_auth/assignments/preview.tsx:19-66`, `apps/web/src/lib/assignment-preview-draft.ts:57-78` | ✅ |
| F5 | Tự động lưu nháp và phục hồi (banner) | `apps/web/src/lib/assignment-draft-store.ts`, `apps/web/src/routes/_auth/assignments/new.tsx:556-568,687-699,774-785` | ✅ |
| F6 | Đối chiếu sau lưu (committed / outcome-unknown) | `apps/web/src/lib/use-kernel-form-submit.ts:66-113`, `apps/web/src/routes/_auth/assignments/new.tsx:992-1051` | ✅ |
| F7 | Giao đề cho lớp (touchpoint — feature classes) | `apps/server/src/routes/kernel.ts:1511-1542` | ✅ |

## F1 — Tạo đề mới và lưu vào ngân hàng

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant Form as assignments/new
    participant Bus as Command bus
    participant API as POST /api/assignments/prompts
    participant DB as assignment_prompt
    participant Snap as GET /api/kernel

    GV->>Form: Dien de va bam Luu vao ngan hang
    Form->>Form: missingRequirementsFor theo skill + status
    alt Con muc thieu
        Form-->>GV: Alert can hoan thien + focus muc dau
    else Du dieu kien
        Form->>Bus: run create-assignment-prompt
        Bus->>API: POST JSON + Origin hop le
        API->>API: bodyLimit 256KB roi schema strict
        alt Schema tu choi
            API-->>Bus: 400 invalid body
            Bus-->>Form: definite-failure + thong bao chung
        else Schema qua
            API->>DB: INSERT assignment_prompt status ready
            DB-->>API: id
            API-->>Bus: 201 body id
            Bus->>Snap: refresh snapshot
            Snap-->>Bus: assignmentPrompts moi
            Bus-->>Form: result kind refreshed
            Form-->>GV: Card Da them vao ngan hang + xoa draft
        end
    end
```

```mermaid
flowchart TD
    A["Bấm Lưu vào ngân hàng"] --> B{"Thiếu mục bắt buộc?"}
    B -->|"Có"| C["Alert + focus mục đầu, không gửi request"]
    B -->|"Không"| D["POST /api/assignments/prompts"]
    D --> E{"Schema hợp lệ?"}
    E -->|"Không"| F["400 invalid body, giữ form + lỗi chung"]
    E -->|"Có"| G["INSERT status ready, trả 201 id"]
    G --> H{"Snapshot refresh thế nào?"}
    H -->|"Thành công"| I["Card Đã thêm vào ngân hàng + xóa draft autosave"]
    H -->|"Mất response hoặc refresh lỗi"| J["Notice committed/unknown, chờ F6"]
    C --> K["Chưa lưu gì"]
    F --> K
    I --> L["Đề nằm trong ngân hàng"]
    J --> L
```

## F2 — Lưu bị chặn vì thiếu mục bắt buộc

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant Form as assignments/new

    GV->>Form: Bam nut Luu
    Form->>Form: setShowErrors true
    Form->>Form: missingRequirementsFor value status
    alt missing rong
        Form->>Form: tiep tuc submit theo F1
    else missing khac rong
        Form-->>GV: role alert Can hoan thien truoc khi luu N muc
        Form->>Form: focusField fieldId dau tien
        Note over Form: Khong co request nao duoc gui
    end
```

```mermaid
flowchart TD
    A["Bấm Lưu"] --> B["Thu thập missingRequirementsFor"]
    B --> C{"Danh sách thiếu trống?"}
    C -->|"Trống"| D["Đi tiếp F1"]
    C -->|"Có thiếu"| E["Hiện alert + liệt kê từng mục"]
    E --> F["Focus mục đầu có fieldId"]
    F --> G{"Giáo viên bấm vào 1 mục?"}
    G -->|"Có"| H["Focus đúng trường đó"]
    G -->|"Không"| I["Sửa thủ công"]
    H --> J["Sửa xong bấm Lưu lại"]
    I --> J
    J --> B
    D --> K["Kết thúc nhánh gate"]
```

## F3 — Chỉnh sửa đề (field-diff + khóa nội dung)

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant Form as assignments/new promptId
    participant API as PATCH /api/assignments/prompts/id
    participant DB as DB prompts + attempts

    GV->>Form: Mo de tu danh sach
    Form->>Form: captureEditBaseline theo server state
    GV->>Form: Sua noi dung roi bam Luu thay doi
    Form->>Form: field diff chi gui field khac baseline
    Form->>API: PATCH partial payload
    API->>DB: SELECT row theo id + orgId
    alt Row khong ton tai
        API-->>Form: 404 prompt not found
    else Row ton tai
        API->>API: Kiem tra type + cau hoi + writing guard
        alt Writing doi va de bi tham chieu
            API-->>Form: 409 WRITING_SECTION_LOCKED
        else Noi dung thay doi
            API->>DB: Probe quiz_attempt cung org
            alt Co attempt
                API-->>Form: 409 PROMPT_CONTENT_LOCKED
            else Khong co attempt
                API->>DB: UPDATE content + metadata
                API-->>Form: 200 body id
            end
        else Noi dung khong doi
            API->>DB: UPDATE metadata neu co
            API-->>Form: 200 body id hoac no-op 200
        end
    end
    Form->>Form: reconcile doi chieu snapshot voi payload
    alt Snapshot chua du payload
        Form-->>GV: Card Da cap nhat bai tap
    else Khong chung minh duoc
        Form-->>GV: Bao chua luu - vui long luu lai
    end
```

```mermaid
flowchart TD
    A["Mở đề theo promptId"] --> B["Nạp đề + chốt baseline lúc mount"]
    B --> C["Sửa và bấm Lưu thay đổi"]
    C --> D["Field diff so với baseline"]
    D --> E["PATCH /api/assignments/prompts/id"]
    E --> F{"Row thuộc org?"}
    F -->|"Không"| G["404 prompt not found"]
    F -->|"Có"| H{"Phần Writing thay đổi?"}
    H -->|"Đổi và đang được tham chiếu"| I["409 WRITING_SECTION_LOCKED"]
    H -->|"Không đổi hoặc tự do"| J{"Nội dung thay đổi?"}
    J -->|"Không"| K["Chỉ ghi metadata"]
    J -->|"Có"| L{"Có quiz_attempt cùng org?"}
    L -->|"Có"| M["409 PROMPT_CONTENT_LOCKED"]
    L -->|"Không"| N["Ghi content + metadata"]
    K --> O["200 id"]
    N --> O
    O --> P{"Snapshot chứa payload đã submit?"}
    P -->|"Có"| Q["Card Đã cập nhật bài tập"]
    P -->|"Không"| R["Báo chưa lưu, giữ form"]
    I --> S["Trả Writing về như cũ rồi lưu lại"]
    M --> T["Chỉ sửa metadata hoặc tạo đề mới"]
    G --> U["Kết thúc: không tìm thấy đề"]
    Q --> V["Kết thúc thành công"]
    R --> V
    S --> V
    T --> V
```

## F4 — Xem trước góc nhìn học viên

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant Composer as assignments/new
    participant Store as sessionStorage
    participant Preview as assignments/preview

    alt Tu form dang soan
        Composer->>Store: savePreviewDraft kem promptId neu dang sua
        Composer->>Preview: navigate /assignments/preview
        Preview->>Store: readPreviewDraft khong xoa
        Preview-->>GV: Bai giay hoc vien + tab mo phong
    else Tu danh sach de da luu
        GV->>Preview: mo /assignments/preview id
        Preview->>Preview: tim prompt trong snapshot theo id
        Preview-->>GV: Bai giay hoc vien cua de da luu
    end
    GV->>Preview: Quay lai soan de
    Preview->>Store: takePreviewDraft doc roi xoa
    Preview->>Composer: /assignments/new nap draft
    Composer-->>GV: Form khoi phuc nguyen ven
```

```mermaid
flowchart TD
    A["Cần xem trước"] --> B{"Đề nguồn là gì?"}
    B -->|"Đang soạn"| C["savePreviewDraft vào sessionStorage"]
    B -->|"Đã lưu"| D["Mở /assignments/preview?id"]
    C --> E["Mở /assignments/preview"]
    D --> E
    E --> F{"Có dữ liệu xem trước?"}
    F -->|"Có"| G["Hiện bài giấy học viên + tab làm thử"]
    F -->|"Không"| H["Trạng thái rỗng"]
    G --> I{"Hành động tiếp theo?"}
    I -->|"Quay lại soạn đề"| J["take draft: đọc rồi xóa storage"]
    I -->|"Quay lại danh sách"| K["Giữ nguyên storage"]
    J --> L["Form khôi phục nguyên vẹn"]
    K --> M["Về /assignments"]
    L --> N["Kết thúc"]
    M --> N
    H --> N
```

## F5 — Tự động lưu nháp và phục hồi

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant Form as assignments/new
    participant LS as localStorage assignment-draft

    GV->>Form: Soan noi dung
    Form->>Form: composerDraftHasContent
    alt Co noi dung dang soan
        Form->>LS: saveAssignmentDraft sau 1000ms
    else Rong hoac da luu hoac che do sua
        Form->>Form: khong autosave
    end
    GV->>Form: Reload giua chung
    Form->>LS: readAssignmentDraft khong pha huy
    alt Draft hop le con han
        Form-->>GV: Banner Da phuc hoi ban nhap
        GV->>Form: Chon Tiep tuc hoac Huy
        alt Tiep tuc
            Form->>LS: clearAssignmentDraft
            Form-->>GV: Form giu noi dung khoi phuc
        else Huy
            Form->>LS: clearAssignmentDraft
            Form-->>GV: Form trang trang thai ready
        end
    else Draft hong het han 7 ngay sai version
        Form->>LS: removeItem
        Form-->>GV: Form moi khong banner
    end
```

```mermaid
flowchart TD
    A["Gõ nội dung"] --> B{"Có gì đáng autosave?"}
    B -->|"Không"| C["Không lưu"]
    B -->|"Có"| D["Sau 1000ms ghi localStorage"]
    D --> E{"Draft vượt 512KB?"}
    E -->|"Có"| F["Bỏ lưu + console warn"]
    E -->|"Không"| G["Đã ghi"]
    C --> H["Reload hoặc rời trang"]
    G --> H
    F --> H
    H --> I{"Draft hợp lệ còn hạn 7 ngày?"}
    I -->|"Không"| J["Drop draft, mở form mới"]
    I -->|"Có"| K{"Vừa quay lại từ xem trước?"}
    K -->|"Có"| L["Preview draft thắng, không hiện banner"]
    K -->|"Không"| M["Banner Đã phục hồi bản nháp"]
    M --> N{"Tiếp tục hay Hủy?"}
    N -->|"Tiếp tục"| O["Form giữ nội dung, xóa draft"]
    N -->|"Hủy"| P["Form trắng, xóa draft"]
    J --> Q["Kết thúc"]
    L --> Q
    O --> Q
    P --> Q
```

## F6 — Đối chiếu sau lưu (committed / outcome-unknown)

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant Form as assignments/new
    participant Hook as useKernelFormSubmit
    participant Snap as kernel snapshot

    alt Ket qua refreshed
        Hook-->>Form: vao card thanh cong ngay
    else committed hoac outcome-unknown
        Hook->>Form: notice + chan nut luu
        GV->>Form: bam doi chieu reconcile
        Form->>Snap: refresh
        Snap-->>Form: snapshot moi
        alt Che do tao
            Form->>Form: tim row khop title + skill
        else Che do sua
            Form->>Form: editSubmissionPersisted row payload
        end
        alt Chung minh duoc da luu
            Form-->>GV: Card thanh cong + xoa draft
        else Khong chung minh duoc
            Form-->>GV: Bao chua luu - giu form
        end
    else definite-failure 4xx
        Hook-->>Form: thong bao loi - giu form - draft giu lai
    end
```

```mermaid
flowchart TD
    A["Kết quả submit"] --> B{"Kind là gì?"}
    B -->|"refreshed"| C["Card thành công ngay"]
    B -->|"committed hoặc outcome-unknown"| D["Notice + chặn nút lưu"]
    D --> E["Giáo viên bấm đối chiếu"]
    E --> F["Refresh snapshot"]
    F --> G{"Snapshot chứa kết quả ghi?"}
    G -->|"Có"| H["Card thành công + xóa draft"]
    G -->|"Không"| I["Báo chưa lưu, giữ form"]
    B -->|"definite-failure"| J["Giữ form + thông báo, draft giữ lại"]
    C --> K["Kết thúc"]
    H --> K
    I --> K
    J --> K
```

## F7 — Giao đề cho lớp (touchpoint)

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant Class as Trang Lop hoc
    participant API as POST /api/classes/id/assignments
    participant DB as class_assignment

    GV->>Class: Mo modal Giao bai tap
    Class->>Class: Liet ke de status ready
    GV->>Class: Chon de + han + hoc vien
    Class->>API: POST promptId due note studentIds
    API->>API: tim prompt theo org
    alt Prompt khong ton tai
        API-->>Class: 404 prompt not found
    else Prompt chua ready
        API-->>Class: 400 prompt not ready
    else Prompt ready
        API->>DB: INSERT class_assignment snapshot title + targets
        API-->>Class: 201
        Class-->>GV: Da giao bai tap
    end
```

```mermaid
flowchart TD
    A["Modal Giao bài tập"] --> B["Danh sách đề ready"]
    B --> C["Chọn đề + hạn + học viên"]
    C --> D["POST /api/classes/id/assignments"]
    D --> E{"Prompt thế nào?"}
    E -->|"Không thuộc org"| F["404 prompt not found"]
    E -->|"Đang bản nháp"| G["400 prompt not ready"]
    E -->|"Sẵn sàng"| H["INSERT class_assignment snapshot title"]
    H --> I["Đã giao bài tập"]
    F --> J["Kết thúc lỗi"]
    G --> J
    I --> K["Kết thúc: bàn giao cho feature classes"]
```
