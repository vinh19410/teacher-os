---
feature: parent-reports
type: reverse-srs-flows
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs/parent-reports-reverse-flows — parent-reports

Mỗi luồng có sơ đồ sequence + flowchart (F1 chỉ flowchart — là luồng cấu hình, không
tương tác thời gian). Nhãn: ✅ code khẳng định, 🔵 suy luận ≥2 bằng chứng, 🟡 kèm OQ.
Nhớ: hiện tại cờ TẮT — F2/F3 mô tả hành vi khi bật (test chạy ở chế độ mock cờ bật).

## F1 — Cổng vào cụm (cơ chế cờ tắt/bật)

Nguồn: apps/web/src/lib/features.ts:3-7; apps/web/src/components/layout/sidebar.tsx:106-124;
packages/ui/src/components/app-shell/nav-group.tsx:207-209;
apps/web/src/components/command-search/search-index.ts:178-191;
apps/web/src/routes/_auth/reports.tsx:15-22; apps/web/src/routes-matcher.ts:13.

```mermaid
flowchart TD
    A["Nguoi dung mo web giao vien"] --> B{"Co PARENT_REPORTS bat?"}
    B -->|"Dang tat (hien tai)"| C["Loc muc Bao cao khoi sidebar va tim Kiem nhanh"]
    C --> D{"Vao thang /reports?"}
    D -->|"Co"| E["beforeLoad chuyen huong ve /dashboard"]
    D -->|"Khong"| F["Khong co diem vao nao con lai"]
    B -->|"Bat (flip 1 hang so)"| G["Muc Bao cao hien tren sidebar + CMD K"]
    G --> H["3 diem vao mo: nav /reports, ho so hoc vien, dia chi truc tiep"]
```

- ✅ Cờ là hằng false, lọc tại nguồn danh sách nav (sidebar.tsx:121,
  nav-group.tsx:209) và ⌘K dùng chung danh sách + bộ lọc (search-index.ts:180-183).
- ✅ Redirect client-side qua beforeLoad (reports.tsx:15-22); route vẫn nằm trong
  allowlist service worker để redirect kịp chạy (routes-matcher.ts:13).
- ✅ Điểm vào khi bật: nav/⌘K + nút "Tạo báo cáo" ở hồ sơ học viên
  ($studentId.tsx:218-222) + URL trực tiếp.
- 🟡 Điều kiện/ thời điểm bật lại — OQ-01, OQ-10.

## F2 — Xem trang "Báo cáo phụ huynh"

Nguồn: apps/web/src/routes/_auth/reports.tsx:35-191; apps/web/src/lib/repos/reports.ts:4-14;
apps/web/src/lib/repos/kernel.ts:622-640 (fetchKernelSnapshot → GET /api/kernel);
apps/server/src/routes/reporting/loaders.ts:9-30.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant TR as Trang /reports
    participant KH as Kho du lieu client
    participant API as Ban chap /api/kernel
    participant DB as DB
    GV->>TR: mo /reports (khi co bat)
    TR->>KH: doc data.reports (tu ban chap ['kernel'])
    KH->>API: GET /api/kernel (mot lan lay toan bo, chua reports)
    API->>DB: loadReports(orgId) join student cung org
    DB-->>API: dong bao cao theo createdAt, id
    API-->>KH: 200 snapshot voi reports (7 truong hien thi)
    KH-->>TR: data.reports
    TR->>GV: kicker (dem + badge Chua ket noi) + 3 KPI + bang 6 cot + nhat ky gui
```

```mermaid
flowchart TD
    A["Mo trang Bao cao phu huynh"] --> B{"data.reports rong?"}
    B -->|"Rong"| C["Kicker: Chua co bao cao nao + badge Zalo OA: Chua ket noi"]
    B -->|"Co"| D["Kicker: N bao cao + badge ket noi"]
    C --> E["3 KPI: Tong bao cao = 0, Da gui = 0, Phu huynh da doc = 0"]
    D --> F["3 KPI: Tong = tong so, Da gui = khac Nhap, Phu huynh da doc = co moc doc"]
    E --> G{"Co bao cao?"}
    F --> G
    G -->|"Khong"| H["Chua co bao cao nao duoc gui."]
    G -->|"Co"| I["Bang 6 cot: Hoc vien, Chu ky, So buoi, Trang thai, Gui luc, Phu huynh xem"]
    I --> J{"Co bao cao da gui (sent hoac read)?"}
    J -->|"Co"| K["Nhat ky: Bao cao tuan → ten + Zalo OA da gui / da mo"]
    J -->|"Khong"| L["Chua co nhat ky gui tin nhan."]
    H --> M{"Bam + Tao bao cao tuan?"}
    K --> M
    L --> M
    M -->|"Co"| N["Mo modal — sang F3"]
    M -->|"Khong"| O["Dung lai trang"]
```

- ✅ Kicker 2 nhánh trung thực (#172) — reports.tsx:64-84; hằng chưa kết nối :42.
- ✅ KPI: "Đã gửi" = lọc khác nháp, "Phụ huynh đã đọc" = đếm mốc đọc — :93-103.
- ✅ Nhật ký chỉ lấy sent/read, reverse mới nhất trước — :44-58.
- ✅ Empty wording: "Chưa có báo cáo nào được gửi." :110-113, "Chưa có nhật ký gửi
  tin nhắn." :162-165.
- 🔵 "Phụ huynh đã đọc" và nhãn "Đã đọc" không thể có dữ liệu thực: create luôn ghi
  read = "" và status chỉ draft|sent (reporting/index.ts:81-96,
  packages/api/src/contracts.ts:1303-1315) + không endpoint cập nhật (negative-search
  #4) → hai hiển thị này luôn ở giá trị "0"/"Chưa mở" — OQ-02.

## F3 — Tạo và gửi báo cáo tuần (modal)

Nguồn: apps/web/src/components/modals/create-report-modal.tsx:1-142;
apps/web/src/lib/data-actions.ts:95-106; apps/web/src/lib/repos/kernel.ts:181-186, 393-421;
apps/server/src/routes/reporting/index.ts:54-101.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant MD as Modal Tao bao cao tuan
    participant KH as Kernel command
    participant API as POST /api/reports
    participant DB as DB
    GV->>MD: chon hoc vien, nhap chu ky + noi dung, chon kenh
    alt Luu nhap
        GV->>MD: bam Luu nhap
    else Gui bao cao
        GV->>MD: bam Gui bao cao
    end
    MD->>MD: kiem tra hoc vien, chu ky, (gui can noi dung)
    MD->>KH: dispatch create-report (5 truong)
    KH->>API: POST /api/reports (Origin + JSON guard)
    API->>API: 401 / 400 json / 400 body / 400 unknown student / 400 send-khong-noi-dung
    API->>DB: insert report (id uuid, sessions 0, sent moc neu gui, read rong)
    DB-->>API: 201 {id}
    API-->>KH: 201
    KH->>KH: tai lai snapshot (refreshed / committed)
    KH-->>MD: ket qua
    alt refreshed hoac committed
        MD->>MD: xoa trang chu ky + noi dung, dong modal
    else that bai xac dinh
        MD->>GV: thong bao rieng gui / nhap, giu modal + giu chu da gõ
    else khong ro ket qua
        MD->>GV: canh bao kiem tra danh sach truoc khi thu lai, khong dong modal
    end
```

```mermaid
flowchart TD
    A["Mo modal (tu /reports hoac ho so hoc vien)"] --> B{"Co hoc vien trong to chuc?"}
    B -->|"Khong"| C["Lua chon rong: Chua co hoc vien"]
    B -->|"Co"| D["Chon hoc vien (ho so hoc vien → chon san)"]
    C --> E{"Bam luu?"}
    D --> E
    E -->|"Co"| F{"Da chon hoc vien?"}
    E -->|"Khong"| Z["Dung lai modal, chua ghi gi"]
    F -->|"Khong"| G["Chon hoc vien truoc khi luu."]
    F -->|"Co"| H{"Chu ky co chu?"}
    G --> E
    H -->|"Khong"| I["Nhap chu ky bao cao (VD: 01–07/09)."]
    H -->|"Co"| J{"Hanh dong nao?"}
    I --> E
    J -->|"Luu nhap"| K["POST status draft (noi dung duoc phep rong)"]
    J -->|"Gui bao cao"| L{"Noi dung co chu?"}
    L -->|"Khong"| M["Nhap noi dung bao cao truoc khi gui."]
    L -->|"Co"| N["POST status sent"]
    M --> E
    K --> O{"Ket qua may chu?"}
    N --> O
    O -->|"Thanh cong"| P["Reset form, dong modal — bang + nhat ky cap nhat tu snapshot"]
    O -->|"That bai xac dinh"| Q["Thong bao thu lai, giu modal + giu chu"]
    O -->|"Khong ro ket qua"| R["Canh bao kiem tra danh sach, khong dong modal"]
```

- ✅ Validate 3 bước client — create-report-modal.tsx:26-39; busy guard chống ghi
  đôi :27.
- ✅ Chặn gửi rỗng ở cả server qua refine hợp đồng —
  packages/api/src/contracts.ts:1312-1314; test server kernel.test.ts:2701-2714.
- ✅ Mốc gửi chỉ khi status "sent"; nháp mốc rỗng; read luôn "" lúc tạo; sessions 0
  — reporting/index.ts:81-96.
- ✅ Phân loại kết quả 4 nhánh + hành vi modal tương ứng — repos/kernel.ts:393-421,
  create-report-modal.tsx:53-73; test giữ chữ khi lỗi và cảnh báo outcome-unknown —
  create-report-modal.test.tsx:123-149.
- 🔵 Store không tự thêm dòng (chờ snapshot sau ghi) — data-store-reducer.ts:97-105 +
  result kinds refreshed/committed ở repos/kernel.ts:393-397.
- 🟡 Vì sao "Số buổi" cứng 0 và ai sẽ điền — OQ-03; kênh Email chưa có nhãn "chưa
  kết nối" — OQ-06.
