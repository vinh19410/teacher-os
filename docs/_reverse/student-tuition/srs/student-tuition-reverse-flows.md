---
feature: student-tuition
type: reverse-srs-flows
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs/student-tuition-reverse-flows — student-tuition

Mỗi luồng có đủ 2 sơ đồ: sequence (tương tác) + flowchart (hoạt động). Số liệu trên nút
lấy từ code thật. Nhãn: ✅ code khẳng định, 🔵 suy luận ≥2 bằng chứng, 🟡 kèm OQ.
Nhãn sơ đồ viết không dấu để tránh lỗi render mermaid; wording UI trích nguyên văn ở phần
chứng thực.

## F1 — Vào mục Học phí: danh sách hóa đơn

Nguồn: apps/student/src/routes/_auth/tuition/index.tsx:1-66;
apps/server/src/routes/student.ts:124-210, apps/server/src/routes/student.ts:928-953;
apps/student/src/components/overview/tuition-list.tsx:1-130.

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant NAV as Menu portal
    participant SPA as Trang /tuition
    participant API as Route hoc vien
    participant DB as D1
    HV->>NAV: bam muc "Hoc phi"
    NAV->>SPA: mo /tuition
    SPA->>API: GET /api/student/me (guard 401/403, tu cap ho so, chon org)
    API-->>SPA: 200 me (ho so + org phien)
    SPA->>API: GET /api/student/invoices (key ["student","invoices"], staleTime 30s)
    API->>DB: select invoice where orgId + studentId order asc createdAt, id
    API->>API: invoiceCode = INV- + 8 ky tu cuoi in hoa
    API->>API: amountDue = max(amount - paidAmount, 0)
    API-->>SPA: 200 danh sach hoa don
    SPA->>HV: kicker + h1 + 2 tong + 2 nhom hoa don (hoac khoi trong)
```

```mermaid
flowchart TD
    A["Bam muc Hoc phi trong menu"] --> B["Gate hoc vien: lay ho so theo phien"]
    B --> C{"Email da xac thuc?"}
    C -->|"Chua"| D["View: Email chua duoc xac thuc — gui lai email"] --> K1["Ket thuc: chan tai cong"]
    C -->|"Roi"| E{"Co ho so hoc vien cho phien?"}
    E -->|"Khong"| F["View: Tai khoan chua duoc lien ket"] --> K1
    E -->|"Co"| G["GET danh sach hoa don, cache 30 giay"]
    G --> H{"Tai that bai?"}
    H -->|"Co"| I["View loi theo ma — 401 tu dang xuat ve login"] --> K1
    H -->|"Khong"| J{"Co hoa don nao?"}
    J -->|"Khong"| K["Khoi trong: Chua co hoa don hoc phi"] --> K2["Ket thuc: trang trong"]
    J -->|"Co"| L["2 tong Da dong / Con lai + nhom da thanh toan gon + nhom chua du chi tiet"] --> K3["Ket thuc: danh sach"]
```

- ✅ Guard 401 → EMAIL_UNVERIFIED → provision → NOT_LINKED; org chỉ khớp hồ sơ của phiên
  (student.ts:124-210); route hóa đơn bọc requireStudent (student.ts:732-733).
- ✅ Chỉ đọc org + student, order asc createdAt,id (student.ts:928-953); invoiceCode +
  amountDue clamp tại server (student.ts:946-951).
- ✅ Wording: "Học phí của tôi" (index.tsx:45-47), "Chưa có hóa đơn học phí" + mô tả
  (index.tsx:50-55), "Đã thanh toán"/"Hạn <due>"/"Chưa có hạn đóng"/"Đã nhận X / Y"/"Tổng Y"
  (tuition-list.tsx:88-123).
- ✅ isSettled/paidOf/dueOf — bắt cả thu tay paid với paidAmount 0 (tuition-list.tsx:10-22).
- 🔵 e2e đi cùng đường: vào /tuition khi rỗng thấy h1 + empty (S36:297-307); portal có QR
  sau khi giáo viên phát hành (S35:260-269).

## F2 — Xem chi tiết phiếu + QR thanh toán

Nguồn: apps/student/src/routes/_auth/tuition/$invoiceId.tsx:1-105;
apps/server/src/routes/student.ts:957-976; apps/server/src/lib/payment-instructions.ts:21-115;
packages/ui/src/components/payments/payment-qr-panel.tsx:1-183.

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant SPA as Trang chi tiet
    participant API as Route hoc vien
    participant SVC as Service thanh toan
    participant DB as D1
    HV->>SPA: mo /tuition/<invoiceId> tu danh sach
    SPA->>API: GET /api/student/invoices/:id/payment (retry false)
    API->>DB: select invoice where id + orgId + studentId limit 1
    alt khong tim thay
        API-->>SPA: 404 invoice not found
    else tim thay
        API->>SVC: ensurePaymentRefs (backfill payment_code + pay_token neu thieu, trung ma thi thu lai, toi da 3 lan)
        SVC->>DB: UPDATE co dieu kien where isNull, roi doc lai
        API->>SVC: loadPaymentInstructions
        SVC->>SVC: amountDue clamp, PAID hoac NO_BANK_LINK hoac chuyen khoan duoc
        SVC->>SVC: memo = payment_code (VietinBank them SEVQR), qrUrl = vietqr.app theo so no hien tai
        SVC-->>API: instructions
        API-->>SPA: 200 instructions
    end
    SPA->>HV: header + 2 o Da dong / Con lai + PaymentQrPanel (4 trang thai)
```

```mermaid
flowchart TD
    A["Mo chi tiet phieu"] --> B{"Tim thay hoa don cua minh cung org?"}
    B -->|"Khong"| C["404 — Khong mo duoc phieu hoc phi nay"] --> K1["Ket thuc: loi chi tiet"]
    B -->|"Co"| D{"Thieu ma chuyen khoan hoac token?"}
    D -->|"Co"| E["Backfill co dieu kien — trung ma thi sinh lai, toi da 3 lan"]
    D -->|"Khong"| F["Doc huong dan thanh toan"]
    E --> F
    F --> G{"Da tat toan? (con lai 0 hoac status paid)"}
    G -->|"Roi"| H["Panel: Da thanh toan du"] --> K2["Ket thuc: khong cho chuyen khoan"]
    G -->|"Chua"| I{"To chuc da lien ket tai khoan nhan?"}
    I -->|"Chua"| J["Panel: Giao vien chua thiet lap nhan chuyen khoan"] --> K3["Ket thuc: khong co QR"]
    I -->|"Roi"| K["QR vietqr + 5 hang copy: Ngan hang / So tai khoan / Chu tai khoan / So tien / Noi dung"] --> K4["Hoan tat: hien thi QR"]
```

- ✅ 3 nhánh 404 đồng nhất (student.ts:971-975); backfill có điều kiện + retry ≤3
  (payment-instructions.ts:21-55).
- ✅ PAID theo amountDue ≤ 0 HOẶC status paid — comment "Settled covers both ledger-paid
  and manually mark-paid rows" (payment-instructions.ts:78-82); NO_BANK_LINK hai bước kiểm
  (payment-instructions.ts:84-95).
- ✅ QR từ link hiện tại + số nợ hiện tại, không lưu (payment-instructions.ts:57-61,
  :96-115); SEVQR cho VietinBank (vietqr.ts:5-13).
- ✅ Panel 4 trạng thái + wording + copy 5 trường + aria-live (payment-qr-panel.tsx:33-49,
  :83-108, :143-178); nền trắng + lỗi ảnh (:130-141).
- 🔵 retry:false + poll bump reload là cơ chế làm mới duy nhất của trang (INF-2).

## F3 — Tự cập nhật khi tiền về (poll)

Nguồn: apps/student/src/routes/_auth/tuition/$invoiceId.tsx:14-39;
apps/student/src/lib/repos/payments-portal.ts:1-4.

```mermaid
sequenceDiagram
    autonumber
    participant SPA as Trang chi tiet
    participant API as Route hoc vien
    SPA->>SPA: payable = true -> lap moi 5 giay
    loop moi 5 giay
        SPA->>SPA: tab an thi bo luot (khong reload)
        SPA->>SPA: qua 15 phut thi dung lap
        SPA->>API: GET payment (reload + 1 — bo qua cache)
        API-->>SPA: instructions moi
        alt con phai thu
            SPA->>SPA: giu panel hien tai
        else tien da ve du
            SPA->>SPA: panel chuyen "Da thanh toan du", payable false -> khong lap nua
        end
    end
```

```mermaid
flowchart TD
    A["Payable = con tien phai thu"] --> B{"Tab dang hien thi?"}
    B -->|"Khong"| B
    B -->|"Co"| C{"Duoi 15 phut ke tu mo trang?"}
    C -->|"Khong"| D["Dung poll — du lieu cu van hien thi"] --> K1["Ket thuc: phien xem"]
    C -->|"Roi"| E["GET lai huong dan (reload + 1)"]
    E --> F{"Tien da ve du?"}
    F -->|"Chua"| B
    F -->|"Roi"| G["Panel: Da thanh toan du"] --> K2["Ket thuc: tat toan"]
```

- ✅ Interval 5 giây chỉ đặt khi payment.data?.payable; guard document.hidden và cap
  Date.now() - openedAt < POLL_CAP_MS bên trong tick ($invoiceId.tsx:31-39); hằng số
  payments-portal.ts:1-4; comment "cùng quy tắc với public /pay" ($invoiceId.tsx:14-17).
- 🔵 reload là thành phần của query key nên mỗi bump là request thật, không dính staleTime
  (INF-2).
- 🟡 Không có nút làm mới thủ công như /pay — OQ-12.

## F4 — Vào mục học phí từ thông báo

Nguồn: apps/server/src/lib/notifications/templates.ts:40-52, apps/server/src/lib/notifications/templates.ts:130-145;
apps/student/src/components/layout/notification-bell.tsx:53-61.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien (he thong)
    participant TPL as Mau thong bao
    participant BELL as Chuong portal
    actor HV as Hoc vien
    GV->>TPL: tao hoa don hoac nhac hoc phi (ngoai feature — cross-ref tuition-invoicing)
    TPL->>BELL: su kien invoice_issued / tuition_reminder, linkPath "/tuition"
    HV->>BELL: mo thong bao
    BELL->>BELL: navigate(linkPath)
    BELL->>HV: mo /tuition — ve luong F1
```

```mermaid
flowchart TD
    A["Thong bao moi tren chuong"] --> B{"Hoc vien mo thong bao?"}
    B -->|"Khong"| K1["Ket thuc: thong bao nam trong chuong"]
    B -->|"Co"| C{"linkPath = /tuition?"}
    C -->|"Roi"| D["Mo /tuition — quay vao F1"] --> K2["Hoan tat: vao muc hoc phi"]
    C -->|"Khac"| E["Mo duong dan khac (ngoai feature)"] --> K3["Ket thuc: khong lien quan feature"]
```

- ✅ invoiceIssuedEvent + tuitionReminderEvent đều linkPath "/tuition"
  (templates.ts:142, templates.ts:50); bell navigate theo linkPath (notification-bell.tsx:53-61).
- ✅ Idempotency hai sự kiện: invoice_issued:<id> và theo ngày VN (templates.ts:139,
  templates.ts:47).
- Việc phát sự kiện thuộc phía giáo viên — cross-ref S40.

## F5 — Xem tổng hợp học phí theo lớp trên hồ sơ (GV)

Nguồn: apps/web/src/routes/_auth/students/$studentId.tsx:326-365;
apps/web/src/components/tuition/student-tuition-summary.tsx:1-118;
apps/web/src/lib/tuition-from-kernel.ts:329-399.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant SPA as Ho so hoc vien — tab Hoc phi
    participant KRN as Kernel hoc phi
    GV->>SPA: chon tab "Hoc phi"
    SPA->>KRN: studentTuitionSummary(id, classes, enrollments, invoices)
    KRN->>KRN: counted chi enrollment active + fee khac null
    KRN->>KRN: invoiceReceived — paid tinh tron amount, khac thi min(paidAmount, amount)
    KRN->>KRN: unlinkedPaid = hoa don khong tro enrollment nao
    KRN-->>SPA: {totalFee, totalPaid, totalRemaining, countedClasses, unlinkedPaid, classes[]}
    SPA->>GV: 3 the + bang theo lop + ghi chu (hoac thong bao trong)
```

```mermaid
flowchart TD
    A["Mo tab Hoc phi tren ho so"] --> B{"Co enrollment nao khong?"}
    B -->|"Khong"| C["Thong bao: Chua tham gia lop hoc nao."] --> K1["Ket thuc: khong co lop"]
    B -->|"Co"| D{"Lop nao counted (active + co hoc phi)?"}
    D -->|"Khong lop nao"| E["3 the hien — + huong dan: Chua lop nao duoc thiet lap hoc phi."]
    D -->|"Co"| F["3 the Tong / Da dong / Con lai + bang theo lop (Du Xd / Da dong du / so)"]
    E --> G{"unlinkedPaid > 0?"}
    F --> G
    G -->|"Co"| H["Dong ghi chu: Ngoai ra da thu X tu hoa don khong gan lop."]
    G -->|"Khong"| I["Khong them ghi chu"]
    H --> J{"Co hoa don tren ho so?"}
    I --> J
    J -->|"Co"| K["Bang hoa don 5 cot — bam dong mo chi tiet portal (F6)"] --> K2["Hoan tat: tong hop theo lop"]
    J -->|"Khong"| K2
```

- ✅ Quy tắc counted + invoiceReceived + unlinkedPaid — 13 it trong describe
  studentTuitionSummary (tuition-from-kernel.test.ts:707-1014).
- ✅ Wording: "—" (student-tuition-summary.tsx:11-12), "Chưa kích hoạt — chưa tính"/"Dư"/
  "Đã đóng đủ" (:14-22), "Chưa thiết lập" (:24-30), "Đã mời" (:32-51), "Ngoài ra đã thu…"/
  "Chưa tham gia lớp học nào."/"Chưa lớp nào được thiết lập học phí. Thiết lập ở trang lớp."
  (:82-98); thẻ Còn lại hot khi còn nợ (:78-79).
- ✅ Trạng thái lạ enrollment hiển thị như invited (test :183-206).
- 🔵 Kernel dùng chung với trang Doanh thu (INF-1) — một nguồn tính tiền.

## F6 — Mở hóa đơn từ hồ sơ học viên (GV — trong cùng app web)

Nguồn: apps/web/src/routes/_auth/students/$studentId.tsx:342-350;
apps/web/src/routes/_auth/tuition/$invoiceId.tsx:35,93-137 (đích — thuộc tuition-invoicing).

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant TAB as Bang hoa don tren ho so
    participant NAV as Router web (cung ung dung)
    GV->>TAB: bam dong hoa don (hoac Enter)
    TAB->>NAV: navigate /tuition/<invoiceId>
    NAV->>GV: trang chi tiet hoa don phia giao vien — guard tai chinh (cross-ref tuition-invoicing)
```

```mermaid
flowchart TD
    A["Bam dong hoa don trong bang"] --> B["navigate /tuition/<invoiceId> voi search rong"]
    B --> C["Chi tiet hoa don phia giao vien — guard tai chinh (web)"] --> K1["Hoan tat: mo hoa don"]
```

- ✅ onClick dòng → navigate /tuition/$invoiceId (#345 — $studentId.tsx:345-350).
- ✅ Trang đích là chi tiết hóa đơn phía giáo viên của feature tuition-invoicing (guard tài
  chính, mark-paid, lịch sử giao dịch — apps/web/src/routes/_auth/tuition/$invoiceId.tsx:93-137).
  E-05 (TEACHER_ON_STUDENT_PORTAL) chỉ xảy ra khi phiên giáo viên tự đăng nhập thẳng portal
  học viên, không đi qua F6 (student-error-view.tsx:99-104, :148).
- 🔵 (đã rút) Kết cục "bị chặn ở cổng học viên" KHÔNG đúng code — navigate resolve trong
  cùng app web nên mở chi tiết hóa đơn phía giáo viên (apps/web/src/routes/_auth/tuition/
  $invoiceId.tsx:35,93-97); e2e chỉ assert URL (student-tuition-summary.spec.ts:158-163).
