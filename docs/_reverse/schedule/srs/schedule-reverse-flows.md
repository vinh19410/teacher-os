# schedule-reverse-flows.md — Luồng nghiệp vụ tái lập (feature `schedule`)

> Mỗi luồng có cả sequenceDiagram (tương tác) lẫn flowchart (nhánh quyết định). Ngôn ngữ nghiệp vụ; tên endpoint/bảng/hàm chỉ nằm ở cột Nguồn và `_evidence.md`.

## F1 — Xem lịch dạy và chuyển Tháng / Tuần / Ngày (UC-01)

**Nguồn:** `apps/web/src/routes/_auth/schedule.tsx:56-258`; `apps/web/src/lib/schedule-view.ts:47-83`; `apps/web/src/lib/schedule-week.ts:303-328`; `apps/web/src/lib/schedule-month.ts:176-276`; `apps/web/src/lib/schedule-day.ts:95-168`; `apps/web/src/routes/_auth/route.tsx:5-40`.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giáo viên
    participant SCH as Màn lịch dạy
    participant VM as Bộ tính toán view
    participant SNAP as Bản chụp dữ liệu đã tải
    GV->>SCH: Mở /schedule hoặc đổi view, đổi ngày
    SCH->>SCH: Kiểm tra phiên đăng nhập
    alt Chưa đăng nhập
        SCH-->>GV: Chuyển sang trang đăng nhập kèm địa chỉ quay lại
    else Đã đăng nhập
        SCH->>SCH: Phân tích tham số trên địa chỉ
        alt Tham số lạ hoặc link tuần định dạng cũ
            SCH-->>GV: Ghi đè địa chỉ về dạng chuẩn rồi tự tải lại
        else Tham số hợp lệ
            SCH->>SNAP: Đọc lớp, buổi học, sự kiện, kỳ nghỉ
            SNAP-->>VM: Dữ liệu lịch của tổ chức
            VM-->>SCH: Danh sách mục của view đang chọn
            SCH-->>GV: Vẽ view Tháng hoặc Tuần hoặc Ngày
        end
    end
```

```mermaid
flowchart TD
    A["Mở /schedule"] --> B{"Đã đăng nhập?"}
    B -->|"Không"| C["Chuyển trang đăng nhập kèm địa chỉ quay lại"]
    B -->|"Có"| D{"Tham số địa chỉ tạo được cặp view và ngày hợp lệ?"}
    D -->|"Không hoặc link tuần định dạng cũ"| E["Ghi đè địa chỉ dạng chuẩn, không thêm mục lịch sử"]
    E --> F
    D -->|"Có"| F["Đọc bản chụp dữ liệu trong bộ nhớ đệm"]
    F --> G{"view nào?"}
    G -->|"Tháng"| H["Dựng 42 ô, mỗi ô tối đa 3 mục cộng đếm dư"]
    G -->|"Tuần"| I["Dựng 7 cột, ghép ca thực và ca dự kiến, đếm slot"]
    G -->|"Ngày"| J["Dựng agenda trong ngày, kỳ nghỉ lên đầu"]
    H --> K["Vẽ view"]
    I --> K
    J --> K
    K --> L{"Chưa có lớp lẫn sự kiện?"}
    L -->|"Có"| M["Thẻ rỗng với nút sang Quản lý lớp học"]
    L -->|"Không"| N["Hiện lịch cho giáo viên"]
```

Điểm chính: đổi view không gọi mạng — chỉ đổi địa chỉ và tính lại trên dữ liệu đã tải (NFR-001); tham số URL là nơi lưu trạng thái (FR-005).

## F2 — Tạo sự kiện vận hành (UC-02)

**Nguồn:** `apps/web/src/routes/_auth/schedule.tsx:149-156,252-256`; `apps/web/src/components/schedule/org-event-modal.tsx:44-117`; `apps/web/src/lib/repos/events.ts:55-93`; `apps/server/src/routes/events.ts:34-63`; `packages/api/src/event-contracts.ts:35-46`.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giáo viên
    participant MD as Hộp thoại tạo sự kiện
    participant SRV as Máy chủ lịch
    participant STO as Kho dữ liệu tổ chức
    participant SNAP as Bản chụp dữ liệu đang mở
    GV->>MD: Bấm nút Sự kiện trên đầu trang lịch
    MD-->>GV: Form trống với ngày mặc định là ngày đang xem
    GV->>MD: Nhập tên, ngày, giờ bắt đầu, giờ kết thúc, ghi chú
    MD->>MD: Kiểm tra hợp lệ theo bộ luật chung với máy chủ
    alt Dữ liệu chưa hợp lệ
        MD-->>GV: Lỗi đỏ dưới từng trường, không gửi yêu cầu đi đâu
    else Dữ liệu hợp lệ
        MD->>SRV: Yêu cầu tạo sự kiện vận hành
        SRV->>SRV: Xác nhận phiên, chốt tổ chức và người tạo
        SRV->>SRV: Kiểm tra lại bộ luật dữ liệu
        alt Máy chủ từ chối vì dữ liệu
            SRV-->>MD: Từ chối kèm lý do dữ liệu chưa hợp lệ
            MD-->>GV: Dòng lỗi chung trong form, form mở để sửa
        else Máy chủ chấp nhận
            SRV->>STO: Ghi dòng sự kiện thuộc tổ chức của giáo viên
            STO-->>SRV: Dòng đã ghi đầy đủ
            SRV-->>MD: Xác nhận tạo kèm thông tin sự kiện
            MD->>SNAP: Chèn sự kiện vào bản chụp và sắp xếp lại theo ngày rồi giờ
            MD-->>GV: Báo tạo thành công, chip hiện ngay trong view đang mở
        end
    end
```

```mermaid
flowchart TD
    A["Bấm nút Sự kiện"] --> B["Mở hộp thoại, ngày mặc định là ngày đang xem"]
    B --> C["Nhập thông tin sự kiện"]
    C --> D{"Bộ luật dữ liệu hợp lệ?"}
    D -->|"Không"| E["Lỗi đỏ dưới từng trường, không gửi yêu cầu"]
    E --> C
    D -->|"Có"| F["Gửi yêu cầu tạo sự kiện"]
    F --> G{"Máy chủ trả kết quả gì?"}
    G -->|"Từ chối vì dữ liệu"| H["Dòng lỗi chung trong form"]
    H --> C
    G -->|"Lỗi khác hoặc quá hạn chờ"| I["Toast báo lỗi, thử lại"]
    I --> C
    G -->|"Tạo thành công"| J["Ghi dòng sự kiện thuộc tổ chức của giáo viên"]
    J --> K["Chèn sự kiện vào bản chụp đang mở và sắp xếp lại"]
    K --> L["Chip hiện ngay trong view đang mở kèm báo thành công"]
```

Điểm chính: một bộ luật kiểm hai lần (client chặn sớm, server chốt lần cuối — BR-001..004); id tổ chức do phiên quyết, không nhận từ form (BR-005); sau khi tạo không tải lại toàn bộ dữ liệu (FR-009).

## F3 — Xóa sự kiện vận hành (UC-03)

**Nguồn:** `apps/web/src/components/schedule/org-event-chip.tsx:33-58,101-141`; `apps/web/src/lib/repos/events.ts:96-121`; `apps/server/src/routes/events.ts:65-78`.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giáo viên
    participant CHIP as Chi tiết sự kiện vận hành
    participant SRV as Máy chủ lịch
    participant SNAP as Bản chụp dữ liệu đang mở
    GV->>CHIP: Bấm chip sự kiện trên lịch
    CHIP-->>GV: Hộp thoại chi tiết ngày, khung giờ, ghi chú
    GV->>CHIP: Bấm Xóa
    CHIP-->>GV: Bước xác nhận xóa
    alt Hủy xác nhận
        GV->>CHIP: Bấm Hủy
        CHIP-->>GV: Quay lại chi tiết sự kiện
    else Xác nhận xóa
        GV->>CHIP: Xác nhận xóa sự kiện
        CHIP->>SRV: Yêu cầu xóa sự kiện
        alt Sự kiện đã không còn tồn tại hoặc thuộc tổ chức khác
            SRV-->>CHIP: Trả kết quả không tìm thấy
            CHIP-->>GV: Báo sự kiện đã không còn tồn tại rồi đóng hộp thoại
        else Xóa thành công
            SRV-->>CHIP: Xác nhận xóa
            CHIP->>SNAP: Gỡ sự kiện khỏi bản chụp
            CHIP-->>GV: Chip biến mất ngay kèm báo đã xóa
        else Lỗi khác hoặc quá hạn chờ
            SRV-->>CHIP: Báo lỗi
            CHIP-->>GV: Báo xóa không được, giữ chip để thử lại
        end
    end
```

```mermaid
flowchart TD
    A["Bấm chip sự kiện"] --> B["Xem chi tiết trong hộp thoại"]
    B --> C{"Bấm Xóa?"}
    C -->|"Không, đóng hộp thoại"| D["Chip giữ nguyên"]
    C -->|"Có"| E["Hiện bước xác nhận xóa"]
    E --> F{"Xác nhận?"}
    F -->|"Hủy"| B
    F -->|"Xóa"| G["Gửi yêu cầu xóa sự kiện"]
    G --> H{"Máy chủ trả kết quả gì?"}
    H -->|"Không tìm thấy"| I["Báo sự kiện đã không còn tồn tại rồi đóng"]
    H -->|"Xóa thành công"| J["Gỡ khỏi bản chụp, chip biến mất ngay kèm báo đã xóa"]
    H -->|"Lỗi khác hoặc quá hạn"| K["Báo xóa không được, thử lại"]
    K --> B
```

Điểm chính: xóa là vĩnh viễn, có 2 bước chặn bấm nhầm; trường hợp "đã bị xóa nơi khác" hiển thị như thông báo, không phải lỗi (E-schedule-005).

## F4 — Điểm chạm ca học và kỳ nghỉ từ lịch (UC-04, biên feature classes / holidays)

**Nguồn:** `apps/web/src/components/schedule/schedule-day-view.tsx:66-68,102-135`; `apps/web/src/components/schedule/schedule-week-view.tsx:64-67,236-271`; `apps/web/src/routes/_auth/schedule.tsx:157-162,238-251`; `apps/web/src/components/schedule/class-session-modal.tsx:18-25`; `apps/web/src/components/schedule/holiday-modal.tsx:1-9`.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giáo viên
    participant SCH as Màn lịch dạy
    participant CLS as Hộp thoại ca học (feature classes)
    participant HOL as Hộp thoại lịch nghỉ (feature holidays)
    GV->>SCH: Bấm một ca học thực trong view Tuần hoặc Ngày
    SCH->>CLS: Mở hộp thoại ca học của lớp
    CLS-->>GV: Danh sách học viên, thao tác điểm danh và sửa buổi
    GV->>CLS: Thực hiện thao tác ca học (nghiệp vụ feature classes)
    CLS-->>SCH: Yêu cầu tải lại dữ liệu lịch sau khi ghi thành công
    GV->>SCH: Bấm nút Tạo lịch nghỉ
    SCH->>HOL: Mở hộp thoại lịch nghỉ
    HOL-->>GV: Kiểm tra tên và khoảng ngày, hiện bảng xem trước buổi bị ảnh hưởng
    HOL-->>SCH: Áp dụng thành công thì yêu cầu tải lại dữ liệu lịch
```

```mermaid
flowchart TD
    A["Trên màn lịch dạy"] --> B{"Bấm vào mục nào?"}
    B -->|"Ca học thực"| C["Mở hộp thoại ca học của feature classes"]
    B -->|"Ca dự kiến chưa có học viên"| D["Chỉ hiển thị, không bấm được"]
    B -->|"Chip sự kiện vận hành"| E["Chi tiết sự kiện, xóa theo F3"]
    B -->|"Nút Tạo lịch nghỉ"| F["Hộp thoại lịch nghỉ của feature holidays"]
    B -->|"Thẻ kỳ nghỉ còn nút hoàn tác"| G["Hộp thoại hoàn tác kỳ nghỉ"]
    C --> H["Điểm danh hoặc sửa buổi, ghi xong tải lại lịch"]
    F --> I["Xem trước và áp dụng, ghi xong tải lại lịch"]
    G --> J["Hoàn tác dời hoặc hủy buổi, ghi xong tải lại lịch"]
```

Điểm chính: lịch chỉ là điểm chạm — ghi dữ liệu ca học và kỳ nghỉ thuộc feature tương ứng; ca dự kiến cố ý không mở hộp thoại nào (BR-010).
