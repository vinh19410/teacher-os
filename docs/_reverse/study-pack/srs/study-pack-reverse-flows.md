---
feature: study-pack
type: reverse-flows
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs flows — study-pack

Chuỗi ký hiệu: nhãn trong hình viết tiếng Việt không dấu để an toàn khi dựng
hình. Mỗi luồng F tương ứng một dòng trong spec Mục 9. Trích dẫn nằm ngay dưới
từng hình.

## F1 — Xem danh sách bộ đề

```mermaid
sequenceDiagram
    autonumber
    actor GVD as Giao vien
    participant UI as Man hinh Kho bo de
    participant API as API study-packs
    participant DB as Co so du lieu
    GVD->>UI: Mo tab Bo de tu hoc
    UI->>API: GET study-packs theo pham vi
    API->>API: Kiem vai doc canReviewGrade
    API->>DB: SELECT study_pack va dem ngay muc
    DB-->>API: Danh sach bo de
    API-->>UI: 200 danh sach
    UI-->>GVD: The bo de co nhan trang thai
```

- Hai phạm vi xem: bộ của tôi và thư viện hệ thống; bộ hệ thống chỉ hiện
  `ready`. ✅ apps/web/src/routes/_auth/assignments/packs.tsx:365-378; ✅
  apps/server/src/routes/study-pack.ts:87
- Cổng đọc dùng `canReviewGrade`. ✅ apps/server/src/routes/study-pack.ts:77-78
- Thẻ đếm ngày và mục mỗi bộ. ✅ apps/server/src/lib/study-pack-clone.ts:812-900

## F2 — Tạo / sửa bộ đề của trung tâm

```mermaid
sequenceDiagram
    autonumber
    actor GVD as Giao vien
    participant UI as Form soan bo de
    participant API as API study-packs
    participant DB as Co so du lieu
    GVD->>UI: Nhap tieu de mo ta trang thai
    UI->>UI: Kiem tra tran ngay muc trung lap
    GVD->>UI: Them muc theo Ngay n
    UI->>UI: Loc chi de org_prompt san sang
    GVD->>UI: Luu bo de
    UI->>API: POST hoac PUT study-packs
    API->>API: Kiem vai ghi canPublishGrade
    API->>API: Doi chieu hop dong Zod
    alt Loi hop dong
        API-->>UI: 400 invalid body
        UI-->>GVD: Thong bao loi nghiep vu
    else Hop le
        API->>DB: Ghi study_pack va study_pack_item
        DB-->>API: Bo de da luu
        API-->>UI: 200 hoac 201 bo de
        UI-->>GVD: Dong form cap nhat danh sach
    end
```

- Trần 366 ngày / 10 mục ngày / 200 mục kiểm ở hợp đồng :4480-4484 và
  superRefine :4508-4535. ✅ packages/api/src/contracts.ts
- Bộ lọc đề nguồn chỉ cho `org_prompt` ready (OQ-04). ✅
  apps/web/src/routes/_auth/assignments/packs.tsx:91-100
- Trạng thái mặc định "ready" khi mở form và sau lưu. ✅
  apps/web/src/routes/_auth/assignments/packs.tsx:75, :134
- Lỗi JSON/Zod gộp về hai chuỗi cửa thân yêu cầu. ✅
  apps/server/src/routes/study-pack.ts:56-70

## F3 — Nhân bản bộ đề hệ thống

```mermaid
sequenceDiagram
    autonumber
    actor GVD as Giao vien
    participant UI as Man hinh Kho bo de
    participant API as API clone
    participant DB as Co so du lieu
    GVD->>UI: Bam Nhan ban ve trung tam
    UI->>API: POST study-packs id clone
    API->>API: Kiem vai ghi canPublishGrade
    API->>DB: Kiem bo he thong ready va ban sao cu
    opt Da co ban sao trong org
        DB-->>API: Ban sao da ton tai
        API-->>UI: 201 ban sao cu kem co idempotent
        UI-->>GVD: Thong bao thanh cong nhu lan dau
    end
    opt Chua co ban sao
        API->>DB: Tao study_pack org va sao muc giu con tro nguon
        DB-->>API: Bo de moi
        API-->>UI: 201 bo de moi
        UI-->>GVD: Danh sach them bo moi
    end
```

- Chỉ nhân bản bộ hệ thống `ready`. ✅ apps/server/src/routes/study-pack.ts:282
- Idempotent trả bản sao cũ kèm cờ, mã 201 (OQ-11). ✅
  apps/server/src/routes/study-pack.ts:290-302
- Nhánh đua hai người nhân bản cùng lúc xử lý bằng khoá duy nhất org+source
  :348-365. ✅ apps/server/src/routes/study-pack.ts
- Mục giữ con trỏ nguồn thư viện, chưa vật hoá đề. ✅
  plans/261101-1357-533-study-pack-scheduled-release/phase-03-pack-library-and-org-api.md:71

## F4 — Gán bộ đề cho lớp

```mermaid
sequenceDiagram
    autonumber
    actor GVD as Giao vien
    participant UI as Khu vuc bo de tren lop
    participant API as API gan bo de
    participant LIB as Thu vien assign
    participant DB as Co so du lieu
    GVD->>UI: Chon bo ngay bat dau gio mo gio han
    UI->>UI: Xem truoc lich bo qua ngay nghi
    GVD->>UI: Xac nhan gan
    UI->>API: POST classes classId study-packs
    API->>API: Kiem vai ghi canPublishGrade
    API->>LIB: assignStudyPackToClass
    LIB->>DB: Kiem bo ready va lop thuoc org
    alt Bo khong san sang hoac rong muc
        LIB-->>API: Bao loi nghiep vu
        API-->>UI: 409 hoac 422 theo loi
        UI-->>GVD: Thong bao loi tuong ung
    else Dat du dieu kien
        LIB->>DB: Tai dung lop gan active neu co
        LIB->>DB: Vat hoa de assignment_prompt theo library_ref
        LIB->>DB: Tao class_study_pack active
        LIB->>DB: Tao class_assignment theo ngay hoc va muc tieu
        LIB->>DB: Ghi theo lo nho hon tran bind
        opt Loi ghi do huy xen ngang
            LIB->>DB: Kiem lai va don theo moc huy
            LIB-->>API: 409 study pack was cancelled
        end
        LIB-->>API: Ket qua gan thanh cong
        API-->>UI: 201 tong quan tien do
        UI-->>GVD: Bang bo de dang chay theo lich
    end
```

- Xem trước lịch phía khách bỏ ngày nghỉ lớp. ✅
  apps/web/src/components/classes/class-study-pack-section.tsx:41-72, :432-454
- Tái dùng lượt gán active :221-254; vật hoá :310-313; tạo lượt gán :315-331;
  nhánh đua :336-363; lịch bỏ ngày nghỉ :366-377; bài giao + thời điểm mở
  :379-417; mục tiêu :421-437; ghi lô :439-455; kiểm huỷ xen ngang :457-492.
  ✅ apps/server/src/lib/study-pack-assign.ts
- Thông điệp lỗi nghiệp vụ hiện cho giáo viên. ✅
  apps/web/src/components/classes/class-study-pack-section.tsx:163-214

## F5 — Học viên nhận bài theo giờ mở

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant SUI as Man hinh hoc vien
    participant SAPI as API hoc vien
    participant DB as Co so du lieu
    HV->>SUI: Mo danh sach bai tap
    SUI->>SAPI: GET bai tap cua lop
    SAPI->>DB: SELECT class_assignment loc available_at
    DB-->>SAPI: Chi bao da den gio
    SAPI-->>SUI: Danh sach bai hop le
    SUI-->>HV: Bai hien theo lich
    opt Bam vao bai chua mo qua duong khac
        SAPI-->>SUI: 404 khong tim thay
        SUI-->>HV: Khong co bai de lam
    end
```

- Bộ lọc thời điểm mở bài dùng chung mọi đường đọc. ✅
  apps/server/src/lib/assignment-visibility.ts:1-16
- Cổng 404 trước giờ trên đường làm bài. ✅
  apps/server/src/routes/student.ts:1354-1383, :918
- Không có bộ định giờ hay thông báo — quyết định ghi trong kế hoạch. ✅
  plans/261101-1357-533-study-pack-scheduled-release/plan.md:19, :27

## F6 — Huỷ bộ đề trên lớp

```mermaid
sequenceDiagram
    autonumber
    actor GVD as Giao vien
    participant UI as Khu vuc bo de tren lop
    participant API as API huy bo de
    participant LIB as Thu vien assign
    participant DB as Co so du lieu
    GVD->>UI: Bam Huys bo de
    UI->>UI: Xac nhan huy
    UI->>API: DELETE classes classId study-packs id
    API->>API: Kiem vai ghi canPublishGrade
    API->>LIB: cancelClassStudyPack
    LIB->>DB: Doc lop gan theo org va lop
    alt Khong tim thay lop gan
        LIB-->>API: 404 class study pack not found
        API-->>UI: 404
        UI-->>GVD: Thong bao khong tim thay
    else Tim thay
        LIB->>DB: Mot lo gan moc huy va xoa muc tieu bai chua lam
        LIB->>DB: Xoa bai giao chua toi gio mo va chua ai lam
        LIB->>DB: Giu nguyen bai da co lan lam bai
        LIB-->>API: Huys thanh cong
        API-->>UI: 200
        UI-->>GVD: Bo de chuyen trang thai Da huy
    end
```

- Quy tắc dọn: xoá bài chưa tới giờ mở (tính tới thời điểm huỷ) và chưa có lần làm; giữ lại bài đã mở và bài đã phát sinh lần làm. ✅ apps/server/src/lib/study-pack-assign.ts:140-192, :521-566
- Mốc huỷ giữ `cancelled_at` cũ nếu huỷ lại. ✅
  apps/server/src/lib/study-pack-assign.ts:534
- Không có thông báo học viên khi bị gỡ bài (OQ-08, OQ-09). ✅ (NS4 rỗng)

## F7 — Học viên vào lớp muộn

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien moi
    participant ENR as Kich hoat ghi danh
    participant LIB as Thu vien assign
    participant DB as Co so du lieu
    HV->>ENR: Kich hoat vao lop
    ENR->>LIB: backfillStudyPackTargetsForStudent
    LIB->>DB: Doc bai cua cac bo dang chay
    LIB->>DB: Chen muc tieu cho bai con han
    DB-->>LIB: Ket qua chen
    LIB-->>ENR: Hoan tat bu
    ENR-->>HV: Hoc vien thay bai con han
```

- Ba đường kích hoạt đều gọi bù: :697, :748, :769. ✅
  apps/server/src/routes/enrollment-activation.ts
- Bù chỉ tạo mục tiêu cho bài còn hạn `due_at > now`. ✅
  apps/server/src/lib/study-pack-assign.ts:573-623, :596
- Bù không đụng bài giao thường (kiểm #572). ✅
  apps/server/src/kernel.test.ts:6712-6737

## F8 — Xem tiến độ nộp

```mermaid
sequenceDiagram
    autonumber
    actor GVD as Giao vien
    participant UI as Khu vuc bo de tren lop
    participant API as API xem lop
    participant DB as Co so du lieu
    GVD->>UI: Mo tab Buoi hoc va luyen tap
    UI->>API: GET classes classId study-packs
    API->>API: Kiem vai doc canReviewGrade
    API->>DB: Doc bo dang chay dem tong va da nop
    DB-->>API: Du lieu tien do
    API-->>UI: 200 danh sach kem tien do
    UI-->>GVD: Bang theo ngay co nhan da mo chua mo
```

- Đếm tổng mục và bài đã nộp :835-854; cờ mở bài theo thời điểm :827-833; sắp
  bài trong pack theo ngày học và vị trí mục :876-881. ✅ apps/server/src/lib/study-pack-assign.ts
- Bảng ngày với huy hiệu "Đã mở"/"Chưa đến giờ" và thanh tiến độ. ✅
  apps/web/src/components/classes/class-study-pack-section.tsx:352-369

## F9 — Xoá bộ đề của trung tâm

```mermaid
sequenceDiagram
    autonumber
    actor GVD as Giao vien
    participant UI as Man hinh Kho bo de
    participant API as API study-packs
    participant DB as Co so du lieu
    GVD->>UI: Bam Xoa bo de
    UI->>API: DELETE study-packs id
    API->>API: Kiem vai ghi canPublishGrade
    API->>DB: Kiem lop gan tham chieu
    alt Con lop gan tham chieu
        DB-->>API: Van con tham chieu
        API-->>UI: 409 study pack is referenced by class assignments
        UI-->>GVD: Khong the xoa bo de da gan cho lop hoc
    else Chua gan cho lop nao
        API->>DB: Xoa study_pack va muc
        DB-->>API: Da xoa
        API-->>UI: 200
        UI-->>GVD: Danh sach cap nhat
    end
```

- Rào 409 khi còn tham chiếu :248-258; câu thoại UI khớp :216-227. ✅
  apps/server/src/routes/study-pack.ts; ✅ apps/web/src/routes/_auth/assignments/packs.tsx
- Phía hệ thống admin cũng đếm lượt gán trước khi xoá đề trung tâm. ✅
  apps/server/src/routes/admin-library.ts:1214-1241
