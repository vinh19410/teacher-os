---
feature: admin-library
type: reverse-srs-flows
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs/admin-library-reverse-flows — admin-library

Chín luồng (F1-F9 theo Mục 9 spec). Cổng admin + CSRF chạy trước mọi luồng — đặc tả
một lần ở đây, các luồng khác không vẽ lại.

## Cổng chung — qua cổng admin và CSRF

```mermaid
flowchart TD
    S["Yêu cầu tới route thư viện"] --> Q1{"Có phiên admin<br/>+ email đã xác thực<br/>+ trong danh sách?"}
    Q1 -->|"Không, chưa đăng nhập"| R401["401"]
    Q1 -->|"Không, thiếu quyền"| R403A["403 NOT_ADMIN"]
    Q1 -->|"Đạt"| Q2{"Là thao tác ghi?"}
    Q2 -->|"Đọc"| P["Chạy nghiệp vụ"]
    Q2 -->|"Ghi"| Q3{"Origin thuộc<br/>danh sách console?"}
    Q3 -->|"Không / thiếu"| R403B["403 origin not allowed"]
    Q3 -->|"Đạt"| Q4{"Cần JSON?"}
    Q4 -->|"Upload audio hoặc xóa"| P
    Q4 -->|"Ghi JSON"| Q5{"content-type là JSON?"}
    Q5 -->|"Không"| R415["415"]
    Q5 -->|"Đạt"| P
    P --> K["Hoàn tất"]
    R401 --> E["Kết thúc"]
    R403A --> E
    R403B --> E
    R415 --> E
```

Chứng thực: require-admin.ts:28-49; CSRF 381-401; test vai trò admin-library.test.ts:130-164,
CSRF :166-189, audio matrix admin-library-audio.test.ts:242-264. ✅

## F1 — Xem và lọc danh sách đề

Mở `/library` → tải toàn bộ đề hợp lệ (không gửi tham số lọc) →
bảng: tên, kỹ năng, bộ sưu tập · nhóm đề, nhãn trạng thái, "N part · M câu", thời gian
cập nhật, cờ đủ audio của đề nghe. Lọc chạy phía client trên dữ liệu đã tải; server
vẫn nhận tham số lọc và tự chặn giá trị lạ.

```mermaid
flowchart TD
    A["Mở trang danh sách"] --> B["GET danh sách đề"]
    B --> Q1{"Tham số lọc<br/>hợp lệ?"}
    Q1 -->|"skill/status lạ"| E["400 invalid skill/status"]
    Q1 -->|"Đạt"| C["Trả danh sách + đủ audio từng đề"]
    C --> D["Client lọc chip + từ khóa"]
    D --> Q2{"Có đề khớp?"}
    Q2 -->|"Không có gì"| E1["Trống: Chưa có bộ đề nào"]
    Q2 -->|"Lọc hụt"| E2["Không có bộ đề nào khớp bộ lọc + Xóa bộ lọc"]
    Q2 -->|"Có"| F["Bảng đề + sửa/xóa"]
    E --> K["Kết thúc"]
    E1 --> K
    E2 --> K
    F --> K
```

Chứng thực: route lọc 404-429 (400 lạ 406-419); sắp 432-434; hasAllAudio 455-465;
client chip 170-192, empty 235-268; wording "N part · M câu" test-table.tsx:87-89. ✅

## F2 — Tạo đề mới

```mermaid
sequenceDiagram
    actor Adm as Admin
    participant UI as Form tạo đề
    participant API as Route thư viện
    participant DB as D1

    Adm->>UI: nhập metadata + chọn kỹ năng
    UI->>API: POST /tests (JSON, Origin chuẩn)
    API->>API: requireAdmin + CSRF + parse create schema
    API->>DB: insert đề (status nháp)
    API->>DB: insert đề (khung slot chỉ là ràng buộc, chưa có dòng part)
    API-->>UI: { id } (201)
    UI->>API: GET /tests/:id — trang soạn tải riêng
    API-->>UI: detail (chưa có dòng part nào)
    UI-->>Adm: sang trang soạn
```

Chứng thực: draft cứng 498; khung part 297-299 + preset contracts.ts:410-447; form
new.tsx:1-122. ✅

## F3 — Soạn nội dung part và nhóm câu (chốt bảo vệ nhóm hỏng)

```mermaid
sequenceDiagram
    actor Adm as Admin
    participant Form as Form part
    participant API as Route thư viện
    participant DB as D1

    Adm->>Form: soạn câu hỏi + nhóm câu
    Adm->>Form: rời ô (blur)
    Form->>API: PUT part (payload + cờ hủy nhóm hỏng nếu có)
    API->>DB: đọc nhóm hiện có của slot
    API->>API: parse phân biệt rỗng / hỏng
    alt nhóm lành và không có cờ
        API->>DB: validate luật sẵn sàng nếu đề đang xuất bản
        API->>DB: upsert nội dung (không đụng cột audio)
        API-->>Form: part mới
        Form-->>Adm: "Đã lưu <part>"
    else nhóm hỏng và thiếu cờ
        API-->>Form: 409 GROUPS_CORRUPT
        Form-->>Adm: banner + nút «Lưu đè nhóm hỏng»
    else lành nhưng có cờ (snapshot cũ)
        API-->>Form: 409 GROUPS_NOT_CORRUPT
        Form-->>Adm: "Nhóm câu đã được phục hồi trên server — tải lại trang."
    end
```

Chứng thực: parse 165-201; ba nhánh guard 632-654; validate ready 655-669; không đụng
audio 670-686; client banner part-form.tsx:804-826, wording lỗi library-error.ts:24-26;
blur save $testId.tsx:552-566. ✅

## F4 — Quản lý audio part nghe (upload CAS)

```mermaid
sequenceDiagram
    actor Adm as Admin
    participant Up as Uploader
    participant API as Route thư viện
    participant R2 as Kho đối tượng
    participant DB as D1

    Adm->>Up: chọn tệp
    Up->>API: PUT audio (raw, Content-Length, kiểu, tên tệp)
    API->>API: kiểm đề nghe / slot / dung lượng ≤ 50 MB / kiểu / tên
    API->>DB: đọc khóa audio cũ của slot
    API->>R2: ghi object KHÁC (khóa mới uuid)
    API->>DB: upsert bản ghi có điều kiện khóa cũ còn nguyên
    alt khóa cũ còn nguyên
        API->>R2: xóa object cũ (nền)
        API-->>Up: 200 metadata audio
        Up-->>Adm: thanh tiến trình xong
    else khóa đã bị người khác đổi
        API->>R2: dọn object mới (nền)
        API-->>Up: 409 AUDIO_CHANGED
        Up-->>Adm: "Audio vừa được người khác cập nhật — tải lại trang rồi thử lại."
    end
```

Chứng thực: kiểm đầu vào 725-766; CAS 769-822; dọn cũ 818-822; lỗi giữa chừng dọn mới
giữ cũ 811-817; test thua CAS admin-library-audio.test.ts:452-486, purge 488-628;
503 khi vắng kho 725 + test 630-646. ✅

## F5 — Xuất bản / hạ ngược đề

```mermaid
flowchart TD
    A["Bấm Xuất bản (draft)"] --> B["Client tự chấm luật sẵn sàng"]
    B --> Q1{"Còn lý do?"}
    Q1 -->|"Có"| C["Khối: Chưa xuất bản được — N lý do"]
    Q1 -->|"Không"| D["PATCH status = ready"]
    D --> Q2{"Có part nhóm hỏng?"}
    Q2 -->|"Có"| E["409 GROUPS_CORRUPT"]
    Q2 -->|"Không"| Q3{"Đạt luật từng part?"}
    Q3 -->|"Không"| F["400 NOT_READY + danh sách lý do"]
    Q3 -->|"Đạt"| G["status = ready"]
    G --> H["Đã xuất bản bộ đề"]
    H --> I["Hoàn tất"]
    C --> A
    E --> J["Kết thúc"]
    F --> J
```

Hạ ngược: bấm "Hạ về nháp" → PATCH status = draft, luôn được; sau khi hạ mới xóa
part/audio được (nút xóa bị chặn khi đang xuất bản).

Chứng thực: client chặn trước publish-bar.tsx:42-58; guard corrupt 562-569; validate
570-576; chú giải UI "phải hạ về nháp để xóa part/audio" publish-bar.tsx:111-115. ✅

## F6 — Xóa đề và xóa part

```mermaid
flowchart TD
    A["Yêu cầu xóa"] --> Q1{"Loại?"}
    Q1 -->|"Xóa part"| Q2{"Đề đang xuất bản?"}
    Q2 -->|"Đang"| B["409 NOT_READY — hạ về nháp trước"]
    Q2 -->|"Nháp"| C["Xóa part"]
    Q1 -->|"Xóa đề"| D["Hộp thoại: Xóa bộ đề? Không thể hoàn tác"]
    D --> E["Xóa đề"]
    E --> F["Xóa đề + mọi part trong một lô"]
    F --> G["Dọn object audio ở nền sau khi bản ghi biến mất"]
    G --> H["Kết thúc"]
    C --> H
    B --> H
```

Chứng thực: chặn xóa part 703-705; hộp thoại delete-test-dialog.tsx:59-83; batch +
comment object mồ côi 594-611; test xóa 740-773. ✅ (Xóa đề KHÔNG kiểm tham chiếu —
GAP-01, OQ-03 🟡)

## F7 — Quản lý bài tập thư viện

Tạo/sửa bài tập như soạn part (cùng hình dạng nội dung). Hai điểm chặn tham chiếu:
hạ bài tập đã sẵn sàng về nháp khi còn bộ đề dùng → 409; xóa khi còn bộ đề dùng → 409.
Chứng thực: 973-987, 1022-1034; wording client packs.tsx:195, :213. ✅

## F8 — Bộ đề hệ thống và giao lớp

```mermaid
sequenceDiagram
    actor Adm as Admin
    participant UI as Trang bộ đề
    participant API as Route thư viện
    participant DB as D1

    Adm->>UI: nhập danh sách mục (JSON / quick adder)
    UI->>API: POST packs (title, status, items)
    API->>DB: validate từng mục (nguồn ready? trần ngày/mục/tổng?)
    alt hợp lệ
        API->>DB: batch insert pack + toàn bộ item
        API-->>UI: 201 pack detail
        UI-->>Adm: "Đã tạo bộ đề hệ thống."
    else lỗi nguồn hoặc trần
        API-->>UI: lỗi kèm lý do
        UI-->>Adm: "Không thể tạo bộ đề hệ thống. Kiểm tra lại dữ liệu."
    end
    Adm->>UI: sửa bộ (thêm/bớt mục)
    UI->>API: PUT packs (items mới)
    API->>DB: map mục cũ theo (ngày, nguồn, mã)
    API->>DB: batch update + xóa item + chèn lại GIỮ mã mục còn lại
    API-->>UI: pack detail (mã mục giữ nguyên)
```

Giao lớp (cross-ref): giáo viên gán bộ → máy sao chép vật hóa từng mục tham chiếu
thành nội dung lớp (bản sao sở hữu tổ chức) + bản ghi gán lớp. Chứng thực: validate
354-632; tuple 902-908; insert giữ id 910-940; test #554 admin-library.test.ts:1482-1656;
xóa chặn tham chiếu 1177-1187. ✅

## F9 — Xem trước đề

Gộp dữ liệu đã lưu và đang soạn (part hiệu lực) → render khung như học viên: intro,
đoạn văn/phiên âm, nhóm câu, ngân hàng đáp án, ảnh; dùng được cả khi nháp.
Chứng thực: effective-parts.ts:1-126 (gộp), test-preview-model.ts:1-139 (render
model), $testId.tsx:763-776 (mở hộp xem trước). ✅
