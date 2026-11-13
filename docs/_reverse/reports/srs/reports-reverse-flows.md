---
feature: reports
type: reverse-srs-flows
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs/reports-reverse-flows — reports

> Quy ước nhãn — mỗi mệnh đề mang nhãn riêng: ✅ = khẳng định bởi code/test, có cite `path:line`; 🔵 = suy luận từ ≥2 bằng chứng độc lập; 🟡 = phỏng đoán nghiệp vụ/vì sao, bắt buộc kèm OQ tương ứng.

Bốn luồng đúng danh mục Mục 9 spec. Nhãn sơ đồ viết ASCII không dấu để an toàn
khi render; câu chữ UI trích nguyên văn nằm ở phần chứng bên dưới từng sơ đồ.

## F1 — Mở trang Doanh thu (cổng vai → bản chụp → KPI + biểu đồ)

Nguồn: apps/web/src/components/layout/sidebar.tsx:109,128-145;
apps/web/src/routes/_auth/tuition/index.tsx:40-53,60-90,109-144;
apps/web/src/lib/use-finance-route-guard.ts:6,16-29; apps/server/src/routes/snapshot.ts:348;
apps/web/src/lib/repos/kernel.ts:622-679.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant NAV as Sidebar nhom Kinh doanh
    participant TR as Trang /tuition
    participant GR as Coong vai tai chinh
    participant KH as Kernel store (client)
    participant API as GET /api/kernel
    GV->>NAV: bam muc "Doanh thu"
    NAV->>TR: mo route (khong co ky → month)
    TR->>GR: kiem tra vai hien tai
    alt vai ngoai danh sach tai chinh
        GR-->>GV: toast "Ban khong co quyen xem So cong no" + ve /dashboard
    else vai trong danh sach
        TR->>KH: doc snapshot.invoices
        KH->>API: nap 1 lan neu chua co (staleTime vo han)
        API-->>KH: snapshot (invoices ISO; server cat invoices neu vai thieu quyen)
        KH-->>TR: invoices
        TR-->>GV: tieu de + 4 KPI + cho chunk bieu do (Suspense)
        TR->>TR: lazy import chunk bieu do
        TR-->>GV: bieu do cot kep theo ky
    end
```

```mermaid
flowchart TD
    A["Nguoi dung mo /tuition"] --> B{"Vai trong danh sach tai chinh?"}
    B -->|"Khong (ta, class_teacher, vai la)"| C["Khong thay muc tren nav va CMD K; vao thang dia chi thi toast + ve /dashboard; snapshot tu server KHONG co invoices"]
    B -->|"Co (teacher, owner, admin)"| D["Render tieu de + 4 KPI tu snapshot"]
    D --> E{"Chunk bieu do da tai?"}
    E -->|"Chua"| F["O cho rong (Suspense, testid tuition-revenue-chart)"]
    F --> G["Chunk ve xong → ve cot kep"]
    E -->|"Roi"| G
    G --> H{"Moi bucket deu 0/0?"}
    H -->|"Co"| I["O rong testid revenue-chart-empty"]
    H -->|"Khong"| J["Cot kep: Phat hanh nen + Da thu de giua"]
```

- ✅ Mục nav chỉ hiện cho vai tài chính: lọc tại nguồn danh sách
  (sidebar.tsx:128-145) và bảng chọn lệnh dùng chung danh sách + lọc
  (search-index.ts:179-193).
- ✅ Cổng client: hàm guard điều hướng về /dashboard và bắn toast một lần
  (use-finance-route-guard.ts:6,16-29); trang dừng render (index.tsx:90).
- ✅ Ranh giới chính ở dữ liệu: máy chủ trả mảng hóa đơn rỗng cho vai thiếu
  quyền (snapshot.ts:348).
- ✅ Nạp một lần, không polling (FR-13): query-client.ts:9-24; nhật cook
  "store nạp bản chụp MỘT LẦN lúc login"
  (plans/journals/2026-10-08-cook-261007-1628-doanh-thu-chart-issue-343.md:16).
- 🟡 Câu toast nêu "Sổ công nợ" cho cả trang Doanh thu — OQ-09.

## F2 — Đổi kỳ xem (Tháng/Quý/Năm)

Nguồn: apps/web/src/components/tuition/revenue-chart.tsx:146-170;
apps/web/src/routes/_auth/tuition/index.tsx:40-53,64,84-88;
apps/e2e/specs/tuition-revenue-chart.spec.ts:179-195,198-209.

```mermaid
flowchart TD
    A["Nguoi dung bam Thang / Quy / Nam"] --> B["setPeriod: navigate THAY THE lich su ?ky=..."]
    B --> C{"validateSearch: ky hop le?"}
    C -->|"month / quarter / year"| D["Dia chi cap nhat, khong don history"]
    C -->|"Gia tri la hoac thieu"| E["Chuan ve month, trang chay binh thuong"]
    D --> F["period doi → useMemo chay lai revenueByPeriod"]
    E --> F
    F --> G["Nhan truc, nhan anh, o rong doi theo cua so 12/8/5 ky"]
```

- ✅ Nút có nhãn bật/tắt (aria-pressed) và testid riêng từng kỳ
  (revenue-chart.tsx:156-157); nhóm có nhãn "Kỳ doanh thu" :151.
- ✅ Replace lịch sử — bấm liên tục không dồn bước (index.tsx:84-88, chú thích
  :84-85); e2e xác nhận `?ky=quarter` rồi `?ky=month`
  (tuition-revenue-chart.spec.ts:179-195).
- ✅ Giá trị lạ an toàn: e2e `?ky=lạ` trang sống, ô rỗng hiện
  (:198-209); validateSearch không throw (index.tsx:40-53).
- ✅ Kỳ sống trong địa chỉ — BR-06; khi sang chi tiết được mang theo (F3 của
  tuition-invoicing; FR-12).

## F3 — Chặng dữ liệu: bản chụp → cột biểu đồ

Nguồn: apps/web/src/lib/repos/invoices.ts:30-33;
apps/web/src/lib/tuition-from-kernel.ts:21-33,73-97,102-184;
apps/web/src/components/tuition/revenue-chart.tsx:129-142,214-229.

```mermaid
flowchart TD
    A["snapshot.invoices (createdAt chuoi ISO)"] --> B["Anh xa client: Date.parse, hong thi 0"]
    B --> C{"Moc phat hanh doc duoc?"}
    C -->|"Khong (0/NaN)"| D["Dem vao dropped; console.warn + chu thich + cau ta bieu do"]
    C -->|"Co"| E{"Trong cua so 12/8/5 ky ke ca ky hien tai?"}
    E -->|"Ngoai cua so (qua cu)"| F["Loai co chu y, KHONG tinh dropped"]
    E -->|"Trong"| G["Tach ngay theo Asia/Ho_Chi_Minh → key ky"]
    G --> H["Cong issued += amount; collected += invoiceReceived"]
    H --> I["Sort cu → moi; ky rong giu slot 0/0"]
    I --> J{"Moi bucket deu 0/0?"}
    J -->|"Co"| K["O rong + loi giai thich so bi bo qua"]
    J -->|"Khong"| L["Bar Phat hanh (nen) + Bar Da thu (de giua, rong nho hon)"]
```

- ✅ Luật tiền một nguồn cho cả issued-collected và KPI (EV-1:
  tuition-from-kernel.ts:21-48).
- ✅ Ba kênh báo dropped: console.warn (:132-138), nhãn ảnh (:140-142), chú
  thích dưới biểu đồ (:248-252) — FR-07.
- ✅ Hóa đơn thật ngoài cửa sổ KHÔNG tính dropped (docblock :108-110; test
  :666-676).
- ✅ Hoạt ảnh tắt hoàn toàn (:220, :228); hai cột căn giữa slot
  (FR-05); màu dùng token chart-1/chart-2 (:219, :227).

## F4 — Dữ liệu đổi sau lệnh ghi (luồng liên feature)

Nguồn: apps/web/src/lib/data-provider.tsx:101-108;
apps/web/src/routes/_auth/tuition/index.tsx:66-68;
plans/journals/2026-10-08-cook-261007-1628-doanh-thu-chart-issue-343.md:16;
apps/e2e/specs/tuition-revenue-chart.spec.ts:125-153.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant MOD as Modal Thu hoc phi (tuition-invoicing)
    participant BUS as Command bus (client)
    participant API as Lenh ghi server
    participant KH as Kernel store (client)
    participant TR as Trang Doanh thu
    GV->>MOD: ghi nhan thu / tao hoa don
    MOD->>BUS: dispatch lenh ghi
    BUS->>API: POST lenh
    API-->>BUS: thanh cong
    BUS->>KH: refetch /api/kernel sau ghi
    KH-->>TR: snapshot.invoices moi
    TR->>TR: tuitionTotals + revenueByPeriod chay lai
    TR-->>GV: 4 KPI va cot "Da thu" doi theo
```

note right of KH : Khong polling — so doi CHI khi lenh ghi thanh cong hoac nap lai thu cong (FR-13)

- ✅ Bus làm mới sau ghi là CƠ CHẾ DUY NHẤT trừ nạp thủ công
  (data-provider.tsx:101-108; query-client.ts:9-24).
- ✅ Comment tại trang khẳng định mô hình này ("the command bus refetches after
  mark-paid", index.tsx:66-68).
- ✅ e2e ghi nhận hệ quả được chấp nhận: dữ liệu gieo sau login phải tải lại
  trang mới thấy (tuition-revenue-chart.spec.ts:150-153).
- 🟡 Mâu thuẫn chú thích "polling snapshot" cùng dòng #343 — GAP-1, OQ-03.
