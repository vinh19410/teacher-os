# Luồng nghiệp vụ nghịch đảo — tuition-invoicing

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

## F1 — Tạo hóa đơn học phí

- **Actor**: Người tài chính (giáo viên/chủ/quản trị viên).
- **Kích hoạt**: bấm "+ Tạo hóa đơn" (trang Doanh thu) hoặc "+ Tạo khoản thu" (Sổ công nợ) ✅ [S1] apps/web/src/routes/_auth/tuition/index.tsx:110-116, [S3] apps/web/src/routes/_auth/debts/index.tsx:318-326.
- **Điều kiện trước**: phiên hợp lệ + quyền tài chính; học viên đã ghi danh lớp với trạng thái hoạt động.
- **Kết quả**: 1 dòng hóa đơn mới trạng thái chưa thu, kèm mã chuyển khoản + liên kết công khai; 1 mục nhật ký thông báo phát-hành-hóa-đơn.
- **Đường lưới**: thiếu/sai dữ liệu → lỗi dưới trường, không gọi mạng ✅ [S22] apps/web/src/components/modals/add-invoice-modal.tsx:73-114; server chặn 400/404/409 ✅ [S7] apps/server/src/routes/kernel.ts:3063-3101.

```mermaid
sequenceDiagram
    actor GV as Người tài chính
    participant W as Modal trên web
    participant S as Máy chủ
    participant D as CSDL
    participant N as Nhật ký thông báo
    GV->>W: Chọn đăng ký, nhập số tiền, hạn, ghi chú
    W->>W: Kiểm tra từng trường theo quy tắc client
    alt Thiếu số tiền hoặc sai định dạng
        W-->>GV: Báo lỗi dưới trường, không gọi mạng
    else Dữ liệu hợp lệ
        W->>S: Gửi yêu cầu tạo hóa đơn
        S->>S: Kiểm tra phiên và quyền tài chính
        S->>S: Kiểm tra hạn là ngày hợp lệ
        alt Hạn không hợp lệ
            S-->>W: 400 invalid body
        else Tìm đăng ký theo id trong org
            alt Không thấy đăng ký
                S-->>W: 404 enrollment not found
            else Đăng ký chưa ở trạng thái hoạt động
                S-->>W: 409 Học viên chưa đồng ý tham gia lớp
            else Đăng ký hợp lệ
                S->>D: Ghi hóa đơn mới kèm mã chuyển khoản và token công khai
                S->>N: Ghi sự kiện phát hành hóa đơn
                S-->>W: 201 kèm id
                W->>S: Nạp lại danh sách và KPI
                W-->>GV: Hiện dòng mới, còn phải thu đủ số tiền
            end
        end
    end
```

```mermaid
flowchart TD
    A["Bấm tạo hóa đơn"] --> B["Điền form"]
    B --> C{"Form hợp lệ theo quy tắc client?"}
    C -->|"không"| D["Báo lỗi dưới trường, không gọi mạng"]
    D --> B
    C -->|"có"| E["POST tạo hóa đơn"]
    E --> F{"Phiên và quyền tài chính hợp lệ?"}
    F -->|"không"| G["401 hoặc 403 finance-forbidden"]
    F -->|"có"| H{"Hạn là ngày hợp lệ?"}
    H -->|"không"| I["400 invalid body"]
    H -->|"có"| J{"Đăng ký tồn tại trong org?"}
    J -->|"không"| K["404 enrollment not found"]
    J -->|"có"| L{"Đăng ký đang hoạt động?"}
    L -->|"không"| M["409 Học viên chưa đồng ý tham gia lớp"]
    L -->|"có"| N["Ghi hóa đơn kèm mã và token"]
    N --> O["Ghi sự kiện phát hành hóa đơn"]
    O --> P["Web nạp lại danh sách"]
    P --> Q["Hiện dòng mới và KPI cập nhật"]
```

## F2 — Xem chi tiết hóa đơn + QR + quản lý liên kết công khai

- **Actor**: Người tài chính.
- **Kích hoạt**: bấm vào dòng hóa đơn trên trang Doanh thu.
- **Điều kiện trước**: hóa đơn thuộc org của phiên.
- **Kết quả**: thấy đủ trường hóa đơn, 3 ô số (phải đóng · đã thu · còn lại), QR + liên kết, lịch sử giao dịch khớp.
- **Đường lưới**: hóa đơn dòng cũ thiếu mã/token được backfill lười khi đọc (3 lần thử lại khi va chạm mã) ✅ [S14] apps/server/src/lib/payment-instructions.ts:31-54; đã đủ → ẩn nút xoay, giữ nút copy ✅ [S55] apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx:252-257; id lạ → trang 404 riêng ✅ [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:93-103.

```mermaid
sequenceDiagram
    actor GV as Người tài chính
    participant W as Trang chi tiết
    participant S as Máy chủ
    participant D as CSDL
    GV->>W: Mở trang chi tiết hóa đơn
    W->>S: Hỏi dữ liệu QR của hóa đơn
    S->>D: Tra hóa đơn theo id trong org
    alt Không thấy
        S-->>W: 404 không phân biệt org
        W-->>GV: Trang không tìm thấy riêng
    else Thấy hóa đơn
        alt Dòng cũ chưa có mã hoặc token
            S->>D: Backfill lười kèm thử lại khi va chạm mã
        end
        S->>D: Tra liên kết ngân hàng hiện hành của org
        S-->>W: Dữ liệu QR, trạng thái khả dụng và lý do nếu không
        W->>S: Hỏi lịch sử giao dịch khớp của hóa đơn
        S-->>W: Danh sách giao dịch mới nhất trước
        W-->>GV: Đủ trường, 3 ô số, QR, copy link
        opt Còn phải thu
            GV->>W: Bấm tạo liên kết mới
            W->>GV: Hỏi xác nhận vì liên kết cũ sẽ chết
            GV->>W: Xác nhận
            W->>S: POST xoay token
            S-->>W: Token mới
            W->>S: Nạp lại dữ liệu QR
            W-->>GV: Liên kết mới, liên kết cũ 404
        end
        W->>W: Quan sát giá trị số đã thu
        alt Số đã thu thay đổi khi trang đang mở
            W->>S: Nạp lại snapshot và lịch sử
            W-->>GV: Ô số và trạng thái tự cập nhật
        end
    end
```

```mermaid
flowchart TD
    A["Mở chi tiết hóa đơn"] --> B{"Hóa đơn thuộc org?"}
    B -->|"không"| C["404 và trang không tìm thấy"]
    B -->|"có"| D{"Đã có mã và token?"}
    D -->|"chưa"| E["Backfill lười kèm thử lại"]
    D -->|"có"| F["Xây QR từ liên kết ngân hàng hiện hành"]
    E --> F
    F --> G["Hiện thông tin, 3 ô số, QR, lịch sử"]
    G --> H{"Còn phải thu?"}
    H -->|"có"| I["Cho phép copy và xoay token có xác nhận"]
    I --> J["POST xoay token"]
    J --> K["Token mới, liên kết cũ chết"]
    H -->|"không"| L["Chỉ giữ copy, ẩn xoay"]
    K --> M["Quan sát số đã thu để tự làm mới"]
    L --> M
    M --> N{"Số đã thu đổi?"}
    N -->|"có"| O["Nạp lại snapshot và lịch sử"]
    N -->|"không"| M
    O --> M
```

## F3 — Thu tự động: phụ huynh chuyển khoản → hệ thống tự khớp → giao diện tự heal

- **Actor**: Phụ huynh (chuyển khoản), Ngân hàng/Bank Hub (báo giao dịch), Hệ thống.
- **Kích hoạt**: giao dịch tiền vào tài khoản org có nội dung chứa mã chuyển khoản.
- **Điều kiện trước**: org đã liên kết tài khoản nhận; mã khớp mẫu tìm-kiếm không phân biệt hoa/thường theo biên từ ✅ [S15] packages/api/src/lib/payment-code.ts:9-15.
- **Kết quả**: giao dịch ghi sổ; nếu khớp → số đã thu tăng, trạng thái đủ khi đủ; webhook nhận ack để nhà cung cấp không gửi lại ✅ [S36] apps/server/src/routes/bank-hub-webhooks.ts:44-60.
- **Đường lưới**: gửi lại/quét lại → no-op nhờ khóa duy nhất ✅ [S11] apps/server/src/lib/payments/ingest-transaction.ts:100-133, [S73] apps/server/src/bank-hub-ipn.test.ts:232-249; 4 lý do chưa khớp: no_code/unknown_code/foreign_code/invoice_paid ✅ [S11] apps/server/src/lib/payments/ingest-transaction.ts:104-133, [S73] apps/server/src/bank-hub-ipn.test.ts:264-306; nội dung thường vẫn khớp (không phân biệt hoa/thường) ✅ [S73] apps/server/src/bank-hub-ipn.test.ts:378-393; hóa đơn đã đánh dấu đủ mà sổ còn thiếu vẫn nhận tiền bù vào sổ ✅ [S73] apps/server/src/bank-hub-ipn.test.ts:250-263; payload gốc chỉ giữ khi chưa khớp ✅ [S9] packages/db/src/schema/payment-transaction.ts:19-21.

```mermaid
sequenceDiagram
    actor PH as Phụ huynh
    participant NH as Ngân hàng
    participant BH as Bank Hub
    participant S as Máy chủ
    participant D as CSDL
    participant W as Web quản lý đang mở
    PH->>NH: Chuyển khoản ghi mã trong nội dung
    NH->>BH: Báo giao dịch tiền vào
    BH->>S: POST webhook trên đường IPN hoặc sự kiện
    S->>S: Kiểm tra header bí mật của webhook
    S->>D: Tra liên kết ngân hàng để xác định org
    S->>D: Ghi sổ với khóa chống trùng nhà cung cấp và mã giao dịch
    alt Trùng khóa vì gửi lại hoặc quét lại
        S-->>BH: ack, không ghi thêm
    else Chưa tồn tại
        S->>S: Tìm mã trong nội dung theo biên từ
        alt Nội dung không có mã
            S->>D: Ghi chưa khớp - lý do no_code
        else Mã không thuộc org này
            S->>D: Ghi chưa khớp - lý do unknown_code hoặc foreign_code
        else Hóa đơn đã đủ theo sổ
            S->>D: Ghi chưa khớp - lý do invoice_paid
        else Hóa đơn còn thiếu số tiền
            S->>D: Ghi khớp vào hóa đơn
            S->>D: Tính lại số đã thu, trạng thái và gợi ý phương thức
        end
        S-->>BH: ack đã nhận
    end
    loop Mở modal hoặc trang còn phải thu
        W->>S: Poll 5 giây một lần, tối đa 15 phút
        alt Số đã thu thay đổi
            W->>S: Nạp lại snapshot
            W-->>W: Ô số và trạng thái tự cập nhật
        end
    end
```

```mermaid
flowchart TD
    A["Giao dịch tiền vào tài khoản org"] --> B["Webhook IPN hoặc sự kiện"]
    B --> C{"Header bí mật hợp lệ?"}
    C -->|"không"| D["401 từ chối"]
    C -->|"có"| E["Xác định org từ tài khoản nhận"]
    E --> F{"Khóa giao dịch đã tồn tại?"}
    F -->|"có"| G["No-op và trả ack"]
    F -->|"không"| H{"Nội dung có mã?"}
    H -->|"không"| I["Ghi chưa khớp - no_code"]
    H -->|"có"| J{"Mã thuộc hóa đơn của org này?"}
    J -->|"không"| K["Ghi chưa khớp - unknown_code hoặc foreign_code"]
    J -->|"có"| L{"Hóa đơn còn thiếu số tiền?"}
    L -->|"không"| M["Ghi chưa khớp - invoice_paid"]
    L -->|"có"| N["Ghi khớp và tính lại số đã thu"]
    N --> O{"Tổng khớp đạt đủ số tiền?"}
    O -->|"có"| P["Trạng thái chuyển thành đã đủ"]
    O -->|"không"| Q["Vẫn chưa đủ, giữ số đã thu một phần"]
    P --> R["Web poll thấy giá trị đổi và tự nạp lại"]
    Q --> R
    I --> S2["Dòng nằm trong hàng đợi chưa khớp"]
    K --> S2
    M --> S2
```

## F4 — Đánh dấu đã thu thủ công

- **Actor**: Người tài chính.
- **Kích hoạt**: nút "Đã nhận" trên dòng hóa đơn (trang Doanh thu).
- **Điều kiện trước**: hóa đơn đang hiện ở trạng thái chưa đủ.
- **Kết quả**: trạng thái đủ; ô số tiền KPI coi như thu trọn; phương thức ghi "CK" từ bảng.
- **Đường lưới**: chặn thao tác kép trong phiên (tất cả nút khóa khi đang lưu) ✅ [S33] apps/web/src/lib/use-direct-kernel-action.ts:14-31; optimistic ✅ [S32] apps/web/src/lib/data-store-reducer.ts:77-87; gửi lại sau lỗi mạng = replay an toàn, chỉ ghi đè phương thức ✅ [S7] apps/server/src/routes/kernel.ts:3119-3124.

```mermaid
sequenceDiagram
    actor GV as Người tài chính
    participant W as Bảng hóa đơn
    participant S as Máy chủ
    participant D as CSDL
    GV->>W: Bấm Đã nhận trên dòng chưa đủ
    W->>W: Khóa mọi nút để chặn thao tác kép
    W->>W: Đổi ô trạng thái ngay optimistic
    W->>S: POST đánh dấu đã thu kèm nhãn phương thức
    S->>D: Tra hóa đơn theo id trong org
    alt Không thấy
        S-->>W: 404
        W->>W: Bỏ trạng thái optimistic
        W-->>GV: Toast dữ liệu chưa được ghi
    else Hóa đơn còn chưa đủ
        S->>D: Cập nhật trạng thái đủ và phương thức
        S->>D: Tính lại số đã thu theo quy tắc trạng thái
        S-->>W: Thành công
        W-->>GV: Ô trạng thái đủ, KPI đổi chiều
    else Hóa đơn đã đủ từ trước vì gửi lại
        S->>D: Ghi đè phương thức, giữ trạng thái đủ
        S-->>W: Thành công với kết quả giống lần đầu
        W-->>GV: Giao diện không đổi bất thường
    end
```

```mermaid
flowchart TD
    A["Bấm Đã nhận"] --> B["Khóa nút, optimistic đổi trạng thái"]
    B --> C["POST đánh dấu đã thu"]
    C --> D{"Hóa đơn thuộc org?"}
    D -->|"không"| E["404, bỏ optimistic"]
    E --> F["Toast dữ liệu chưa được ghi"]
    D -->|"có"| G{"Trạng thái đã đủ trước đó?"}
    G -->|"chưa"| H["Cập nhật đủ kèm phương thức"]
    G -->|"rồi"| I["Ghi đè phương thức, giữ đủ"]
    H --> J["Tính lại số đã thu theo trạng thái"]
    I --> J
    J --> K["Bảng và KPI cập nhật"]
    K --> L["Mở khóa nút"]
    F --> L
```

## F5 — Ghi nhận phiếu thu từng phần (Sổ công nợ)

- **Actor**: Người tài chính.
- **Kích hoạt**: nút "Thu" trên dòng học viên còn nợ.
- **Điều kiện trước**: học viên có ≥1 hóa đơn còn nợ (mặc định chọn khoản hạn sớm nhất ✅ [S24] apps/web/src/components/modals/record-payment-modal.tsx:73-85, [S18] apps/web/src/lib/tuition-from-kernel.ts:622-637).
- **Kết quả**: 1 dòng sổ provider "manual" + tính lại số đã thu; kết quả có thể một phần hoặc đủ.
- **Đường lưới**: 422 đã-đủ / vượt-còn-thiếu (kèm số còn lại cập nhật vào form) / 409 trùng khóa (giữ form, sinh khóa mới) ✅ [S24] apps/web/src/components/modals/record-payment-modal.tsx:124-191; guard chống vượt nằm trong cùng lô ghi ✅ [S12] apps/server/src/lib/payments/record-manual-payment.ts:97-196.

```mermaid
sequenceDiagram
    actor GV as Người tài chính
    participant W as Modal phiếu thu
    participant S as Máy chủ
    participant D as CSDL
    GV->>W: Bấm Thu trên dòng còn nợ
    W->>W: Chọn sẵn khoản hạn sớm nhất, hiện tóm tắt phải đóng đã thu còn nợ
    GV->>W: Nhập số tiền hoặc bấm thu toàn bộ, chọn phương thức, ghi chú
    W->>W: Kiểm tra số tiền lớn hơn 0 và không vượt còn nợ
    alt Sai số tiền
        W-->>GV: Lỗi inline, khóa nút lưu
    else Hợp lệ
        W->>S: POST phiếu thu kèm khóa chống trùng của phiên
        S->>D: Ghi trong một lô với điều kiện bảo vệ
        alt Hóa đơn không thuộc org
            S-->>W: 404
            W-->>GV: Báo lỗi, modal giữ nguyên
        else Hóa đơn đã đủ theo sổ
            S-->>W: 422 invoice-settled
            W->>S: Nạp lại
            W-->>GV: Giải thích đã thu đủ, modal mở tiếp
        else Số tiền vượt còn thiếu
            S-->>W: 422 amount-exceeds-debt kèm số còn lại
            W-->>GV: Hiện số còn thiếu mới, giữ form
        else Trùng khóa với phiếu khác
            S-->>W: 409 client-request-id-conflict
            W->>W: Sinh khóa mới, giữ số đã nhập
            W-->>GV: Báo trùng, cho thử lại
        else Ghi thành công
            S->>D: Tính lại số đã thu và trạng thái
            S-->>W: Kết quả phiếu một phần hoặc đủ
            W->>S: Nạp lại snapshot
            W-->>GV: KPI và dòng nợ cập nhật, modal đóng
        end
    end
```

```mermaid
flowchart TD
    A["Bấm Thu trên dòng còn nợ"] --> B["Mở modal, chọn khoản hạn sớm nhất"]
    B --> C["Nhập số tiền, phương thức, ghi chú"]
    C --> D{"Số tiền hợp lệ và không vượt còn nợ?"}
    D -->|"không"| E["Lỗi inline, khóa nút lưu"]
    E --> C
    D -->|"có"| F["POST phiếu thu với khóa phiên"]
    F --> G{"Kết quả lô ghi có điều kiện bảo vệ"}
    G -->|"404"| H["Báo lỗi, giữ modal"]
    G -->|"422 đã đủ"| I["Nạp lại và giải thích đã thu đủ"]
    G -->|"422 vượt"| J["Hiện số còn thiếu mới, giữ form"]
    G -->|"409 trùng khóa"| K["Sinh khóa mới, giữ số nhập"]
    G -->|"thành công"| L["Tính lại sổ, trả kết quả phiếu"]
    H --> C
    I --> C
    J --> C
    K --> C
    L --> M["Nạp lại snapshot"]
    M --> N["Đóng modal, KPI cập nhật"]
```

## F6 — Xử lý giao dịch chưa khớp: gán vào phiếu / bỏ qua

- **Actor**: Người tài chính.
- **Kích hoạt**: hàng đợi "Giao dịch chưa khớp" trên trang Doanh thu.
- **Điều kiện trước**: có giao dịch chưa khớp của org (tối đa 50 dòng); nội dung lạ được che ✅ [S4] apps/server/src/routes/payment-transactions.ts:47-76.
- **Kết quả**: tiền được gán vào hóa đơn còn thiếu (hoặc bị đánh dấu bỏ qua, không tính tiền); số đã thu tính lại.
- **Đường lưới**: gán vào hóa đơn đã đủ theo sổ → 409 INVOICE_ALREADY_PAID; giao dịch không còn trạng thái chưa khớp (gán 2 lần) → 404 ✅ [S4] apps/server/src/routes/payment-transactions.ts:78-130; nút gán phía client không đọc body lỗi → chỉ làm mới 🟡 [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:397-414 (→ OQ-16).

```mermaid
sequenceDiagram
    actor GV as Người tài chính
    participant W as Hàng đợi chưa khớp
    participant S as Máy chủ
    participant D as CSDL
    W->>S: Tải hàng đợi chưa khớp của org
    S-->>W: Tối đa 50 dòng kèm lý do, che nội dung lạ
    GV->>W: Chọn giao dịch và hóa đơn đang nợ
    alt Bấm Gán
        W->>S: POST gán kèm id hóa đơn
        S->>D: Cập nhật dòng sổ với điều kiện bảo vệ trong một lô
        alt Dòng không còn trạng thái chưa khớp
            S-->>W: 404
            W->>S: Nạp lại hàng đợi
        else Hóa đơn đã đủ theo sổ
            S-->>W: 409 INVOICE_ALREADY_PAID
            W->>S: Nạp lại hàng đợi
        else Gán được
            S->>D: Tính lại số đã thu và trạng thái hóa đơn
            S-->>W: Thành công
            W->>S: Nạp lại hàng đợi và snapshot
            W-->>GV: Dòng rời hàng đợi, KPI cập nhật
        end
    else Bấm Bỏ qua
        W->>S: POST bỏ qua
        S->>D: Chuyển các dòng chưa khớp của org sang đã bỏ qua
        S-->>W: Thành công
        W->>S: Nạp lại hàng đợi
        W-->>GV: Dòng rời hàng đợi, không tính tiền
    end
```

```mermaid
flowchart TD
    A["Mở hàng đợi chưa khớp"] --> B["Xem dòng kèm lý do"]
    B --> C{"Chọn hành động"}
    C -->|"Gán"| D{"Hóa đơn mục tiêu còn thiếu?"}
    C -->|"Bỏ qua"| J["Đánh dấu bỏ qua các dòng của org"]
    D -->|"có"| E["Cập nhật dòng sổ và tính lại"]
    D -->|"không"| H["409, nạp lại hàng đợi"]
    E --> F{"Ghi thành công?"}
    F -->|"có"| G["Dòng rời hàng đợi, KPI cập nhật"]
    F -->|"hóa đơn đủ theo sổ"| H
    F -->|"dòng đã xử lý"| I["404, nạp lại hàng đợi"]
    J --> K["Dòng rời hàng đợi, không tính tiền"]
    G --> L["Nạp lại hàng đợi"]
    H --> L
    I --> L
    K --> L
```

## F7 — Đối soát tài khoản ngân hàng

- **Actor**: Người tài chính + hệ thống.
- **Kích hoạt**: nút "Đối soát" cạnh hàng đợi chưa khớp.
- **Điều kiện trước**: org có liên kết tài khoản đang hoạt động (lịch sử tài khoản cũ vẫn được quét ✅ [S69] packages/db/src/schema/org-bank-link.ts:14-16).
- **Kết quả**: giao dịch mới nạp vào sổ qua cùng bộ ghép (cho phép lưu dòng không có mã); trả bộ đếm `{scanned, matched, unmatched}` ✅ [S13] packages/api/src/contracts.ts:3083-3087.
- **Đường lưới**: cooldown 60 giây → 429 "reconcile cooldown"/RECONCILE_COOLDOWN ✅ [S37] apps/server/src/routes/bank-link.ts:278-281, [S74] apps/server/src/bank-hub-reconcile.test.ts:223-229; Bank Hub trả 429 thì route cũng 429 kèm Retry-After ✅ [S74] apps/server/src/bank-hub-reconcile.test.ts:230-236; web hiển thị kết quả hoặc cảnh báo cooldown ✅ [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:329-339; quét cả tài khoản cũ sau khi relink và lưu dòng không-mã ✅ [S74] apps/server/src/bank-hub-reconcile.test.ts:173-207.

```mermaid
sequenceDiagram
    actor GV as Người tài chính
    participant W as Hàng đợi chưa khớp
    participant S as Máy chủ
    participant BH as Bank Hub API
    participant D as CSDL
    GV->>W: Bấm Đối soát
    W->>S: POST yêu cầu quét
    alt Trong vòng 60 giây kể từ lần trước
        S-->>W: Báo reconcile cooldown
        W-->>GV: Cảnh báo chờ một phút rồi thử lại
    else Hợp lệ
        S->>BH: Kéo giao dịch tài khoản hiện hành và tài khoản cũ
        BH-->>S: Danh sách giao dịch
        S->>D: Nạp vào sổ qua bộ ghép, cho phép lưu dòng không có mã
        S->>D: Tính lại các hóa đơn vừa khớp thêm
        S-->>W: Kết quả quét, khớp, chưa khớp
        W->>S: Nạp lại hàng đợi và snapshot
        W-->>GV: Thông báo kết quả, dòng mới rơi vào hàng đợi nếu chưa khớp
    end
```

```mermaid
flowchart TD
    A["Bấm Đối soát"] --> B["POST yêu cầu quét"]
    B --> C{"Quá 60 giây kể từ lần cuối?"}
    C -->|"không"| D["Báo cooldown, web cảnh báo chờ"]
    C -->|"có"| E["Kéo giao dịch từ Bank Hub"]
    E --> F["Nạp vào sổ qua bộ ghép, lưu cả dòng không mã"]
    F --> G{"Có giao dịch khớp hóa đơn?"}
    G -->|"có"| H["Tính lại số đã thu các hóa đơn"]
    G -->|"không"| I["Không đổi KPI"]
    H --> J["Trả kết quả quét, khớp, chưa khớp"]
    I --> J
    J --> K["Nạp lại hàng đợi và snapshot"]
    K --> L{"Dòng nào chưa khớp?"}
    L -->|"có"| M["Rơi vào hàng đợi cho xử lý tay"]
    L -->|"không"| N["Hàng đợi rỗng"]
    D --> N
    M --> N
```

## F8 — Sổ công nợ: lọc/tìm/chọn → gửi nhắc học phí hàng loạt

- **Actor**: Người tài chính.
- **Kích hoạt**: mở `/debts`; chọn chip/lớp/từ khóa; tick dòng còn nợ; bấm "Gửi nhắc học phí".
- **Điều kiện trước**: quyền tài chính (gate web trước khi render ✅ [S27] apps/web/src/lib/use-finance-route-guard.ts:12-30).
- **Kết quả**: mỗi hóa đơn còn nợ của học viên được chọn nhận 1 thông báo; khóa chống trùng theo ngày Việt Nam; trả `{queued, skipped}` ✅ [S30] apps/server/src/lib/notifications/templates.ts:40-54.
- **Đường lưới**: chip/lớp/từ khóa sync URL; tìm không dấu debounce ✅ [S56] apps/web/src/routes/_auth/debts/index.test.tsx:208-332; gọi lại trong ngày → queued=0 ✅ [S51] apps/server/src/routes/debt-reminders.test.ts:336-366; chặn >100 hoặc trùng id → 400 ✅ [S13] packages/api/src/contracts.ts:4087-4098.

```mermaid
sequenceDiagram
    actor GV as Người tài chính
    participant W as Sổ công nợ
    participant S as Máy chủ
    participant D as CSDL
    participant N as Nhật ký thông báo
    GV->>W: Mở trang Sổ công nợ
    W->>W: Kiểm tra quyền, nếu thiếu chuyển về bảng điều khiển kèm toast
    W->>S: Nạp snapshot và lớp
    W->>W: Tính sổ nợ: lọc lớp và từ khóa rồi mới tính chip và KPI
    GV->>W: Lọc chip trạng thái, chọn lớp, gõ từ khóa không dấu
    W->>W: Đồng bộ URL, debounce tìm kiếm
    GV->>W: Tick các dòng còn nợ
    GV->>W: Bấm Gửi nhắc học phí
    W->>GV: Xác nhận với tổng số hóa đơn sẽ nhận
    GV->>W: Đồng ý
    W->>S: POST nhắc học phí kèm danh sách học viên
    S->>D: Gom hóa đơn còn nợ theo học viên, chia lô 50, tối đa 100 học viên
    loop Mỗi hóa đơn còn nợ
        S->>N: Ghi thông báo với khóa chống trùng theo ngày VN
    end
    S-->>W: Kết quả queued và skipped
    W-->>GV: Toast kết quả kèm link nhật ký
    opt Gọi lại trong cùng ngày
        S-->>W: queued bằng 0
        W-->>GV: Báo đã nhắc hôm nay
    end
```

```mermaid
flowchart TD
    A["Mở Sổ công nợ"] --> B{"Có quyền tài chính?"}
    B -->|"không"| C["Chuyển về bảng điều khiển kèm toast"]
    B -->|"có"| D["Tính sổ nợ từ snapshot"]
    D --> E["Áp lọc lớp và từ khóa trước, chip sau"]
    E --> F["Hiện KPI, badge hạn, nút Thu và xem dòng thời gian"]
    F --> G["Tick dòng còn nợ"]
    G --> H["Bấm Gửi nhắc học phí"]
    H --> I["Xác nhận tổng số hóa đơn"]
    I --> J{"Danh sách hợp lệ - tối đa 100 không trùng?"}
    J -->|"không"| K["400, giữ trang"]
    J -->|"có"| L["Gom hóa đơn còn nợ theo học viên, chia lô 50"]
    L --> M["Ghi thông báo, khóa chống trùng theo ngày VN"]
    M --> N["Trả queued và skipped"]
    N --> O{"queued lớn hơn 0?"}
    O -->|"có"| P["Toast thành công kèm link nhật ký"]
    O -->|"không"| Q["Báo đã nhắc hôm nay"]
    P --> R["Bỏ tick sau khi gửi"]
    Q --> R
    K --> F
```

## F9 — Xem dòng thời gian hóa đơn & giao dịch theo học viên

- **Actor**: Người tài chính.
- **Kích hoạt**: nút con mắt trên dòng nợ (không kích hoạt điều hướng dòng).
- **Kết quả**: drawer với 3 ô tổng, các mục phát-hành-hóa-đơn và mục thu tiền theo tháng mới nhất trước; mục thu từ luồng ngân hàng được che nội dung/phương thức ✅ [S52] apps/server/src/routes/billing-timeline.test.ts:336-345.
- **Đường lưới**: 200 sự kiện phát hành + 200 mục thu, thu tiền đứng trước phát hành cùng mốc ✅ [S7] apps/server/src/routes/kernel.ts:3274-3387; học viên lạ/org khác → 404 không phân biệt ✅ [S52] apps/server/src/routes/billing-timeline.test.ts:356-365.

```mermaid
sequenceDiagram
    actor GV as Người tài chính
    participant W as Drawer dòng thời gian
    participant S as Máy chủ
    participant D as CSDL
    GV->>W: Bấm con mắt trên dòng học viên
    W->>S: Hỏi dòng thời gian
    S->>D: Kiểm tra học viên thuộc org
    alt Không thấy hoặc org khác
        S-->>W: 404 không phân biệt
        W-->>GV: Báo lỗi
    else Hợp lệ
        S->>D: Lấy tối đa 200 sự kiện phát hành và 200 mục thu
        S->>S: Trộn, sắp mới nhất trước, thu trước phát hành cùng mốc
        S-->>W: Danh sách sự kiện che dữ liệu nhạy của nguồn ngân hàng
        W-->>GV: Nhóm theo tháng, 3 ô tổng, link sang chi tiết hóa đơn
    end
```

```mermaid
flowchart TD
    A["Bấm con mắt trên dòng nợ"] --> B["Hỏi dòng thời gian"]
    B --> C{"Học viên thuộc org?"}
    C -->|"không"| D["404 không phân biệt"]
    C -->|"có"| E["Lấy 200 phát hành và 200 thu tiền"]
    E --> F["Trộn và sắp mới nhất trước"]
    F --> G["Che nội dung và phương thức của nguồn ngân hàng"]
    G --> H["Nhóm theo tháng trong drawer"]
    H --> I["3 ô tổng và link sang chi tiết hóa đơn"]
    D --> J["Kết thúc"]
```

## F10 — Phụ huynh thanh toán qua liên kết công khai

- **Actor**: Phụ huynh (không đăng nhập).
- **Kích hoạt**: mở liên kết `/pay/<token>` do giáo viên chia sẻ.
- **Kết quả**: thấy số tiền, tên học viên, tổ chức, QR chuyển khoản; tiền về → giao diện tự đổi sang đã đủ (poll).
- **Đường lưới**: token không tồn tại/xoay → 404 chung; hạn đóng và ghi chú cố ý không trả về ✅ [S16] apps/server/src/routes/public-pay.ts:10-17, [S72] apps/server/src/public-pay.test.ts:66-92; đủ → trả không-khả-dụng kèm lý do; chưa liên kết tài khoản → lý do riêng ✅ [S72] apps/server/src/public-pay.test.ts:93-111; không cache ✅ [S16] apps/server/src/routes/public-pay.ts:33-38; poll 5s ≤15 phút, hết hạn hiện nút Làm mới ✅ [S21] apps/web/src/lib/repos/payments.ts:64-116, [S17] apps/web/src/routes/pay.$token.tsx:25-116.

```mermaid
sequenceDiagram
    actor PH as Phụ huynh
    participant P as Trang công khai
    participant S as Máy chủ
    participant D as CSDL
    PH->>P: Mở liên kết token
    P->>S: Hỏi dữ liệu công khai không cần phiên
    S->>D: Tra hóa đơn theo token
    alt Token không tồn tại hoặc đã xoay
        S-->>P: 404 chung
        P-->>PH: Trang liên kết không khả dụng
    else Token hợp lệ
        S-->>P: Số tiền, tên học viên, tổ chức, QR - không hạn không ghi chú
        P-->>PH: Hiện QR và số tiền
        loop Còn phải thu và chưa hết 15 phút
            P->>S: Poll 5 giây
            alt Số tiền đã đủ
                S-->>P: Trạng thái đã đủ
                P-->>PH: Xác nhận đã nhận đủ, dừng poll
            end
        end
        opt Hết giờ poll
            P-->>PH: Nút Làm mới
            PH->>P: Bấm Làm mới
            P->>S: Nạp lại
        end
    end
```

```mermaid
flowchart TD
    A["Phụ huynh mở liên kết"] --> B{"Token tồn tại?"}
    B -->|"không"| C["404 chung"]
    B -->|"có"| D["Hiện QR, số tiền, học viên, tổ chức"]
    D --> E{"Còn phải thu?"}
    E -->|"không"| F["Hiện đã đủ"]
    E -->|"có"| G["Poll 5 giây, tối đa 15 phút"]
    G --> H{"Tiền đã đủ?"}
    H -->|"có"| F
    H -->|"chưa và hết giờ"| I["Hiện nút Làm mới"]
    H -->|"chưa và còn giờ"| G
    I --> J["Phụ huynh bấm Làm mới"]
    J --> G
```
