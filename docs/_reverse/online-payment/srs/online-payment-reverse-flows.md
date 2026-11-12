---
type: reverse-srs-flows
feature: online-payment
status: draft
updated: 2026-11-12
---

# online-payment — Flows tái lập (reverse)

> Quy ước: mọi nhãn đều truy vết được trong code (cite ở `_evidence.md`). Không vẽ bước không có trong code.

## Flow 1: Liên kết tài khoản ngân hàng (phiên hosted + sự kiện vòng đời)

### Sequence — Liên kết tài khoản ngân hàng

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant P as Panel lien ket
    participant R as API /api/bank-link
    participant H as Sepay Bank Hub
    participant W as Webhook dispatcher
    GV->>P: Mo panel "Nhan hoc phi qua chuyen khoan"
    P->>R: GET trang thai lien ket
    R-->>P: none / linked / inactive / unlinked + so TK dang che
    GV->>P: Bam "Lien ket tai khoan ngan hang"
    P->>R: POST /link-token (purpose=link)
    alt Hub chua cau hinh
        R-->>P: 503 BANKHUB_DISABLED
        P-->>GV: Thong bao tinh nang chua bat
    else Da co tai khoan dang lien ket
        R-->>P: 409 BANK_LINK_ALREADY_LINKED
    else Tao phien duoc
        R->>H: Tao dai dien (neu chua co) + tao phien
        H-->>R: hostedLinkUrl + expiresAt
        R->>R: Kiem tra nguon link trong danh sach tin cay (2 lan)
        R-->>P: hostedLinkUrl
        P->>P: Mo iframe (chi cho phep frame-src tin cay)
        GV->>H: Nhap thong tin tai khoan trong iframe
        H->>W: POST event BANK_ACCOUNT_LINKED (khoa X-Secret-Key)
        W->>W: So khoa + guard thoi gian su kien
        W-->>H: 200 success applied
        P->>P: Nhan postMessage FINISHED_ hoac poll 5 giay
        P->>R: Dong modal -> GET trang thai + POST /sync
        R-->>P: linked + so TK che
        P-->>GV: Panel "Da lien ket"
    end
```

### Activity — Liên kết tài khoản ngân hàng

```mermaid
flowchart TD
    A["Mo panel lien ket"] --> B{"Hub co cau hinh?"}
    B -->|"Khong"| C["503 BANKHUB_DISABLED - panel hien tat"]
    B -->|"Co"| D{"Trang thai hien tai?"}
    D -->|"linked"| E["409 BANK_LINK_ALREADY_LINKED"]
    D -->|"none / inactive / unlinked"| F["POST /link-token"]
    F --> G["Tao dai dien neu chua co (hang muc Unlimited)"]
    G --> H{"Dai dien san sang?"}
    H -->|"Chua"| I["409 BANK_LINK_COMPANY_SETTLING"]
    H -->|"Co"| J["Tao phien tren hub"]
    J --> K{"Nguon link hop le?"}
    K -->|"Khong"| L["502 BANK_LINK_BAD_HOSTED_LINK_ORIGIN"]
    K -->|"Co"| M["Iframe hosted link"]
    M --> N["GV nhap tai khoan trong iframe"]
    N --> O["Hub POST event BANK_ACCOUNT_LINKED"]
    O --> P{"Khoa webhook dung?"}
    P -->|"Sai"| Q["401 unauthorized"]
    P -->|"Dung"| R{"Su kien moi hon trang thai da ghi?"}
    R -->|"Cu hon"| S["Bo qua - giu trang thai hien tai"]
    R -->|"Moi hon"| T["Cap nhat linked + luu xid tai khoan"]
    T --> U["Dong modal - sync - panel Da lien ket"]
```

## Flow 2: Nhận giao dịch qua webhook (IPN) — nhiều chặng: verify → org → khớp → ghi sổ

### Sequence — Webhook giao dịch

```mermaid
sequenceDiagram
    participant SP as Sepay Bank Hub
    participant W as Webhook dispatcher
    participant I as Ingest transaction
    participant H as Hub API (fallback org)
    participant L as So giao dich D1
    SP->>W: POST /ipn (hoac /events) - giao dich moi
    W->>W: So khoa theo header (X-Secret-Key hoac Apikey)
    alt Sai hoac thieu khoa
        W-->>SP: 401 unauthorized
    else Dung khoa nhung payload thieu truong bat buoc
        W->>W: Log [ipn] payload failed required-field validation
        W-->>SP: 400 invalid body
    else Dung khoa va payload OK
        W->>I: Noi dung + so tien + xid tai khoan + raw goc
        I->>I: Loc: chi tien vao + so tien nguyen duong
        I->>H: Fallback xem tai khoan khi bang trong
        H-->>I: xid dai dien -> org
        alt Khong xac dinh duoc org do API hub loi
            I-->>W: api-error
            W->>W: Log recoverable via reconcile
            W-->>SP: 200 success (doi soat bu)
        else Xac dinh duoc org
            I->>I: Trich ma hoc phi tu noi dung
            I->>L: Tim hoa don cung org theo ma
            alt Giao dich trung (ma da co trong so)
                I-->>W: bo qua am tham
                W-->>SP: 200 success
            else Ma khong thay / phieu da du / ma org khac
                I->>L: Ghi unmatched + ly do + raw trong 1 statement
                I->>L: Tinh lai hoa don (khong doi tien)
                W-->>SP: 200 success
            else Khop ma cung org va phieu chua du
                I->>L: Ghi matched + raw rong trong 1 statement
                I->>L: Cong so da nhan + chot du neu du (cung batch)
                W-->>SP: 200 success
            end
        end
    end
```

### Activity — Webhook giao dịch

```mermaid
flowchart TD
    A["POST webhook giao dich"] --> B{"Khoa header hop le?"}
    B -->|"Sai"| C["401 unauthorized"]
    B -->|"Dung"| D{"Du truong bat buoc?"}
    D -->|"Khong"| E["400 invalid body + log transaction_id"]
    D -->|"Co"| F{"Tien vao + so tien hop le?"}
    F -->|"Khong"| G["Bo qua - ack 200"]
    F -->|"Co"| H{"Ra org theo xid tai khoan?"}
    H -->|"API hub loi"| I["Log api-error - ack 200 - doi soat bu"]
    H -->|"Khong co org"| G
    H -->|"Co org"| J{"Trich duoc ma hoc phi?"}
    J -->|"Khong co ma che do IPN"| G
    J -->|"Co ma"| K{"Ma giao dich da co trong so?"}
    K -->|"Trung"| L["No-op - ack 200"]
    K -->|"Moi"| M{"Hoa don cung org theo ma?"}
    M -->|"Khong thay"| N["Ghi unmatched unknown_code + raw"]
    M -->|"Ma cua org khac"| O["Ghi unmatched foreign_code + raw"]
    M -->|"Thay nhung phieu da du"| P["Ghi unmatched invoice_paid + raw"]
    M -->|"Thay va chua du"| Q["Ghi matched + raw rong"]
    N --> R["Tinh lai hoa don trong cung batch"]
    O --> R
    P --> R
    Q --> R
    R --> S["Ack 200 success"]
```

## Flow 3: Phụ huynh thanh toán qua link công khai

### Sequence — Trang thanh toán công khai

```mermaid
sequenceDiagram
    actor PH as Phu huynh
    participant B as Browser /pay/:token
    participant S as GET /public/pay/:token
    PH->>B: Mo link tu nhom chat (khong dang nhap)
    B->>S: GET token
    alt Token thieu hoac khong ton tai
        S-->>B: 404 not found (chung)
        B-->>PH: "Link thanh toan khong ton tai hoac da bi thu hoi."
    else Tim thay hoa don
        S->>S: Join hoa don + hoc vien + to chuc theo token
        S->>S: Dung huong dan realtime (con no, memo, QR), luoc ghi chu + han
        S-->>B: View + Cache-Control no-store
        loop moi 5 giay, toi da 15 phut, chi khi tab hien
            B->>S: GET lai trang thai
            S-->>B: Trang thai moi
        end
        alt Du tien trong luot poll
            B-->>PH: Chot "Da thanh toan du"
        else Het 15 phut chua du
            B-->>PH: Dung poll + hien nut "Lam moi"
        end
    end
```

### Activity — Trang thanh toán công khai

```mermaid
flowchart TD
    A["Mo link /pay/token"] --> B{"Token du dai?"}
    B -->|"Khong"| C["404 not found"]
    B -->|"Co"| D{"Tra duoc hoa don theo token?"}
    D -->|"Khong"| C
    D -->|"Co"| E["Dung QR + con no + memo theo thoi diem mo"]
    E --> F["Hien trang thai + khong cache"]
    F --> G{"Tab hien va duoi 15 phut?"}
    G -->|"Co"| H["Poll moi 5 giay"]
    H --> I{"Hoa don du tien chua?"}
    I -->|"Chua"| G
    I -->|"Roi"| J["Chot Da thanh toan du"]
    G -->|"Khong"| K["Dung poll - nut Lam moi"]
    K --> L["Bam Lam moi - poll tiep"]
    L --> G
```

## Flow 4: Đối soát thủ công và hàng chờ giao dịch chưa khớp

### Sequence — Đối soát + hàng chờ

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant M as Modal Thu hoc phi
    participant R as POST /api/bank-link/reconcile
    participant I as Ingest (che do luu giao dich khong ma)
    GV->>M: Mo hang cho "Giao dich chua khop (n)"
    GV->>M: Bam "Doi soat"
    M->>R: POST reconcile
    alt Bam trong vong 60 giay
        R-->>M: 429 reconcile cooldown + RECONCILE_COOLDOWN
        M-->>GV: "Vua doi soat, thu lai sau 1 phut."
    else Duoc chay
        R->>R: Gop xid hien tai + xid cu (bo trung)
        loop moi xid, toi da 5 trang x 100
            R->>I: Keo giao dich tien vao trong 7 ngay
            I->>I: Cung duong ingest, giu lai giao dich khong ma
        end
        R-->>M: scanned - matched - unmatched
        M-->>GV: "Doi soat xong: khop m, chua khop u."
    end
    GV->>M: Xem dong chua khop (noi dung bi che neu la org khac)
    alt Gan ve hoa don
        GV->>M: Chon phieu + bam "Gan"
        M->>M: POST assign
        M-->>GV: OK / 409 phieu da du / 404
    else Bo qua
        GV->>M: Bam "Bo qua"
        M->>M: POST ignore (chi tu trang thai chua khop)
        M-->>GV: OK
    end
```

### Activity — Đối soát + hàng chờ

```mermaid
flowchart TD
    A["Bam Doi soat"] --> B{"Da bam trong 60 giay truoc?"}
    B -->|"Co"| C["429 RECONCILE_COOLDOWN + nhac cho sau 1 phut"]
    B -->|"Khong"| D["Gop xid hien tai + xid cu"]
    D --> E{"Con xid de keo?"}
    E -->|"Het"| Z["Tra ket qua 3 so doi soat"]
    E -->|"Con"| F["Keo toi da 5 trang x 100, tien vao 7 ngay"]
    F --> G["Ingest cung duong IPN - giu giao dich khong ma"]
    G --> E
    Z --> H["Hien hang cho toi da 50 dong moi nhat"]
    H --> I{"GV chon hanh dong?"}
    I -->|"Gan"| J{"Phieu dich chua du?"}
    J -->|"Da du"| K["409 invoice already paid"]
    J -->|"Chua du"| L["Cap nhat so giao dich + tinh lai trong batch"]
    I -->|"Bo qua"| M{"Dong dang o trang thai chua khop?"}
    M -->|"Co"| N["Danh dau da xu ly"]
    M -->|"Khong"| O["404 transaction not found"]
```

## Flow 5: Thu học phí thủ công (ranh giới so sánh với luồng ngân hàng)

### Sequence — Thu học phí thủ công

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant M as Modal Thu hoc phi
    participant K as POST /api/invoices/:id/payments
    GV->>M: Nhap so tien + phuong thuc + ghi chu
    GV->>M: Xac nhan
    M->>K: POST kem clientRequestId tu dialog
    alt Body sai
        K-->>M: 400 invalid body
    else Hoa don khong ton tai hoac khac org
        K-->>M: 404 invoice not found
    else Ma yeu cau da ghi truoc do
        K-->>M: 200 replayed (khong cong dup)
    else Hoa don da du
        K-->>M: 422 invoice-settled
    else So tien vuot con no
        K-->>M: 422 amount-exceeds-debt + remaining
    else Dat
        K->>K: INSERT co guard (chua du + khong vuot) + tinh lai trong batch
        K-->>M: 201 id + paidAmount + remaining + status
        M-->>GV: Cap nhat "Da nhan p / t"
    end
```

### Activity — Thu học phí thủ công

```mermaid
flowchart TD
    A["Nhap phieu thu thu cong"] --> B["POST payments kem clientRequestId"]
    B --> C{"Body hop le?"}
    C -->|"Khong"| D["400 invalid body"]
    C -->|"Co"| E{"Hoa don cung org ton tai?"}
    E -->|"Khong"| F["404 invoice not found"]
    E -->|"Co"| G{"Ma yeu cau da ton tai?"}
    G -->|"Co"| H["200 replayed - khong cong dup"]
    G -->|"Khong"| I{"Phieu da du?"}
    I -->|"Co"| J["422 invoice-settled"]
    I -->|"Chua"| K{"So tien vuot con no?"}
    K -->|"Vuot"| L["422 amount-exceeds-debt + remaining"]
    K -->|"OK"| M["Insert guard + tinh lai trong batch"]
    M --> N["201 + con no moi"]
```
