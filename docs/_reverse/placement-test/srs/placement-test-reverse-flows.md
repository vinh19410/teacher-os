---
type: reverse-flows
feature: placement-test
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# Luồng — feature `placement-test`

> Quy ước nhãn: ✅ = có code minh họa kèm path:line; 🔵 = suy luận từ ≥2 bằng chứng (liệt kê đầy đủ ở reverse-sources.md / _evidence.md); 🟡 = chưa rõ, phải có OQ tương ứng trong reverse-gaps.md. Mỗi mệnh đề mang nhãn riêng; không nâng 🟡 lên ✅ nếu không có code.

## F1 — GV nạp màn soạn đề

Nguồn: apps/web/src/routes-matcher.ts:31; apps/web/src/lib/use-finance-route-guard.ts:1-31; apps/web/src/routes/_auth/placement-test/index.tsx:128-181,526-555; apps/server/src/routes/placement-test.ts:134-181. ✅

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant NAV as Sidebar / CMD K
    participant ED as Man soan de
    participant API as GET /api/placement-test
    participant DB as DB
    GV->>NAV: mo muc Bai test dau vao
    NAV->>ED: dieu huong /placement-test
    ED->>ED: kiem tra vai tro tai chinh
    alt khong du quyen
        ED->>GV: ve /dashboard + thong bao khong co quyen
    else du quyen
        ED->>API: GET trang thai de
        API->>DB: doc dong placement_test + toan bo audio cua org
        DB-->>API: dong de hoac khong co
        API-->>ED: draft, revision, publishedVersion, publishedAt, dirty, isLeadOrg, audio
        alt chua co nhap
            ED->>GV: man dat trang thai rong (F2)
        else co nhap
            ED->>GV: hien soan thao co san
        end
    end
```

Chứng thực: guard 403 theo vai trò tại apps/server/src/routes/placement-test.ts:121-132; dirty tính từ so sánh draft với snapshot (:159-163); isLeadOrg (:164-167); `Cache-Control: no-store` (:179). ✅

## F2 — Khởi tạo đề: nhập đề gốc hoặc tạo đề trống

Nguồn: apps/web/src/components/placement-test/seed-empty-state.tsx:17-55; apps/web/src/routes/_auth/placement-test/index.tsx:60-102,334-415; apps/web/src/lib/repos/placement-test.ts:114-204. ✅

```mermaid
flowchart TD
    EMPTY["Man dat trang thai rong"] --> CHOICE{"Chon cach khoi tao?"}
    CHOICE -->|"Nhap de goc"| SEED["Fetch placement-seed/questions.json"]
    CHOICE -->|"Tao de trong"| BLANK["Khung 1 cau VG + 1 doan nghe + 1 nguong A1"]
    SEED --> OK{"Tai seed thanh cong?"}
    OK -->|"Khong"| DONE_SEEDERR["Bao loi tai de goc — dung o trang thai rong"]
    OK -->|"Co"| LOOP{"Con clip mp3 can tai?"}
    LOOP -->|"Con"| UP["PUT /api/placement-test/audio kem tien trinh"]
    UP --> ATT["Gan audioId vao clip tuong ung"]
    ATT --> LOOP
    LOOP -->|"Xong"| SAVE["PUT /api/placement-test/draft voi revision hien tai"]
    BLANK --> DONE_BLANK["Ket thuc F2: vao man soan — khong tu dong luu nhap, luu theo F3"]
    SAVE --> RES{"Ket qua luu?"}
    RES -->|"200"| DONE["Ket thuc: toast da nhap de goc 30 cau 5 doan nghe"]
    RES -->|"409"| DONE_CONFLICT["Ket thuc: banner xung dot — phai tai lai bo de"]
    RES -->|"Loi khac"| DONE_FAIL["Ket thuc: hien thong bao loi goc"]
```

Chứng thực: fetch seed (:339); vòng upload 5 mp3 + gắn audioId (:351-375); toast "Đã nhập đề gốc (30 câu, 5 đoạn nghe)." (:398); lỗi seed (:400-405); createBlankContent mặc định (:60-102); 409 xung đột (:257-261). ✅

## F3 — Soạn và lưu nháp (CAS revision)

Nguồn: apps/web/src/routes/_auth/placement-test/index.tsx:165-269; apps/server/src/routes/placement-test.ts:183-270; apps/web/src/lib/repos/placement-test.ts:92-112. ✅

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant ED as Man soan de
    participant API as PUT /api/placement-test/draft
    participant DB as DB
    GV->>ED: sua cau hoac doan nghe hoac nguong
    ED->>ED: danh dau co thay doi chua luu
    GV->>ED: bam Luu nhap
    ED->>ED: kiem tra tran so luong va do dai
    ED->>API: PUT content + revision hien tai
    API->>DB: insert hoac update where revision
    alt revision chua bi thay
        DB-->>API: ghi thanh cong
        API-->>ED: revision + 1
        ED->>GV: toast Da luu ban nhap
    else revision da bi tab khac ghi
        DB-->>API: khong dong nao duoc cap nhat
        API-->>ED: 409 PLACEMENT_REVISION_CONFLICT
        ED->>GV: banner xung dot va nut tai lai
    end
```

Chứng thực: CAS hai nhánh insert/update với 409 ở apps/server/src/routes/placement-test.ts:231-239,259-267; test CAS trùng revision 0 và revision cũ (:269-326 của placement-test.test.ts). ✅

## F4 — Tải lên và nghe thử audio đoạn nghe

Nguồn: apps/web/src/components/placement-test/clip-audio-field.tsx:60-188; apps/web/src/lib/repos/placement-test.ts:114-237; apps/server/src/routes/placement-test.ts:272-361. ✅

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant F as Clip audio field
    participant R as uploadAudio XHR PUT
    participant S as PUT /api/placement-test/audio
    participant ST as Media store + DB
    GV->>F: chon file mp3
    F->>F: kiem tra MIME va dung luong 20 MB
    alt file khong hop le
        F->>GV: toast dinh dang hoac dung luong khong hop le
    else file hop le
        F->>R: truyen file kem tien trinh va ten file
        R->>S: PUT body + X-File-Name
        S->>S: kiem tra Content-Length MIME ten file
        S->>ST: ghi object placement/org/audioId + dong metadata
        alt thanh cong
            ST-->>S: audioId
            S-->>R: audioId name size type
            R-->>F: gan audioId vao clip
            GV->>F: bam Nghe thu
            F->>F: tai blob va tao URL blob de xem truoc
        else loi kiem tra hoac loi DB
            S-->>R: 400/413/415/500 kem huy object rac
            R-->>GV: thong bao loi tai len
        end
    end
```

Chứng thực: server kiểm tra và discardObject khi lỗi (apps/server/src/routes/placement-test.ts:285-354); MIME cho phép (packages/api/src/library-contracts.ts:43-54); blob preview (apps/web/src/lib/repos/placement-test.ts:206-237); e2e thay audio + nghe thử blob (apps/e2e/specs/placement-test-editor.spec.ts:209-230). ✅

## F5 — Phát hành bộ đề

Nguồn: apps/web/src/routes/_auth/placement-test/index.tsx:271-332; apps/web/src/components/placement-test/publish-dialog.tsx:31-66; apps/server/src/routes/placement-test.ts:407-533; packages/api/src/placement-test-contracts.ts:285-514. ✅

```mermaid
flowchart TD
    BTN["GV bam Phat hanh"] --> AUTO["Tu dong luu nhap truoc"]
    AUTO --> CV{"Client validate dat?"}
    CV -->|"Khong"| BLOCK["Chan: toast con N loi + cuon toi loi dau"]
    BLOCK --> EDIT["GV sua noi dung"]
    EDIT --> BTN
    CV -->|"Dat"| DIALOG{"Xac nhan o hop thoai Phat hanh?"}
    DIALOG -->|"Huy"| DONE_CANCEL["Dung lai o man soan"]
    DIALOG -->|"Xac nhan"| PUB["POST /api/placement-test/publish"]
    PUB --> CAS{"Revision con dung?"}
    CAS -->|"Sai"| OLD["409 — tai lai trang thai moi nhat"]
    OLD --> DONE_RELOAD["Ket thuc: banner xung dot yeu cau tai lai"]
    CAS -->|"Dung"| VAL{"Server validate dat?"}
    VAL -->|"Khong"| INV["422 PLACEMENT_INVALID kem issues"]
    INV --> BANNER["Banner liet ke loi de GV sua"]
    BANNER --> EDIT
    VAL -->|"Dat"| SNAP["Build snapshot cho version ke tiep"]
    SNAP --> UPD["Ghi CAS tren revision va publishedVersion"]
    UPD --> GC{"Con audio khong tham chieu qua 24h?"}
    GC -->|"Co"| CLEAN["Don audio moc coi trong nen"]
    GC -->|"Khong"| OKP["Gi nguyen"]
    CLEAN --> DONE["Ket thuc: toast da phat hanh vN + dirty false"]
    OKP --> DONE
```

Chứng thực: autosave trước publish (:274-278); validate client + scroll (:280-288); hộp thoại cảnh báo hiệu lực ngay + học viên làm dở phải làm lại (:746-756 và publish-dialog.tsx:49-66); server 422 các loại (placement-test.ts:438-479); snapshot version+1 (:481-482); GC nền (:518-525); toast thành công (:305). ✅

## F6 — Học viên mở trang công khai và qua cổng thông tin

Nguồn: apps/profile/public/kiem-tra-dau-vao/test.js:52-350,604-1129,1646-1671; apps/profile/public/kiem-tra-dau-vao/lead-gate.js:132-248; apps/server/src/routes/public-placement-test.ts:39-68; apps/server/src/routes/public-leads.ts:292-328. ✅

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant PG as Trang tinh kiem tra dau vao
    participant API as GET /public/placement-test
    participant LEAD as POST /public/leads
    participant DB as DB
    HV->>PG: mo trang kiem-tra-dau-vao
    PG->>API: GET de cong khai
    alt 503 hoac 404 hoac loi mang
        API-->>PG: PLACEMENT_DISABLED / PLACEMENT_NOT_PUBLISHED / loi
        PG->>HV: hien Bai kiem tra dang bao tri va giu bai lam do
    else 200
        API-->>PG: snapshot version phan cau audio bands
        PG->>HV: hien trang gioi thieu va nut bat dau
        HV->>PG: bam bat dau
        PG->>HV: hien form thong tin
        HV->>PG: dien ten sdt email ngay sinh muc tieu
        PG->>PG: xac thuc sdt VN email ngay sinh honeypot elapsedMs
        PG->>LEAD: gui payload nguon placement-test
        LEAD->>DB: kiem tra tan suat IP trần ngày dedupe sdt
        alt qua tan suat
            LEAD-->>PG: 429 LEAD_RATE_LIMITED hoac LEAD_DAILY_CAP
            PG->>HV: thong bao qua nhieu luot dang ky
        else hop le
            LEAD-->>PG: 200 hoac 201
            PG->>HV: cho vao Phan 1 (F7)
        end
    end
```

Chứng thực: các trạng thái bảo trì không xóa bài dở (test.js:316-350; e2e editor spec :74-97,:261-283); honeypot + elapsedMs 3500 (lead-gate.js:8-12,206-248); 429 hai mã (public-leads.ts:292-328); 200/201 vào Phần 1 (test.js:1076-1086). ✅

## F7 — Làm bài hai phần với giới hạn lượt nghe

Nguồn: apps/profile/public/kiem-tra-dau-vao/test.js:1139-1470; apps/profile/public/kiem-tra-dau-vao/grading.js:13-40. ✅

```mermaid
flowchart TD
    P1{"Dang o buoc nao?"}
    P1 -->|"Phan 1 Vocab Grammar"| A1["Hoc vien chon dap an tung cau"]
    P1 -->|"Phan 2 Listening"| L1{"Doan nghe con luot nghe?"}
    A1 --> SAVE["Tu luu bai lam do vao localStorage"]
    SAVE --> NEXT{"Chuyen buoc?"}
    NEXT -->|"Sang Phan 2"| L1
    NEXT -->|"Chua"| A1
    L1 -->|"Con"| PLAY["Bam phat tru 1 luot nghe"]
    PLAY --> ERR{"Tai audio loi?"}
    ERR -->|"Co"| REFUND["Hoan luot nghe va thong bao khong bi tru luot"]
    REFUND --> L1
    ERR -->|"Khong"| LISTEN["Nghe (het bai tu dong ve 0 giay)"]
    LISTEN --> A2["Tra loi cau cua doan nghe"]
    A2 --> SAVE
    L1 -->|"Het"| LOCK["Vo hieu nut phat — Da het luot nghe"]
    LOCK --> A2
    A2 --> SUB["Bam nut Nop bai"]
    SUB --> LEFT{"Con cau chua chon?"}
    LEFT -->|"Co"| CONF["Xac nhan bo trong tinh 0 diem"]
    CONF -->|"Quay lai"| A2
    CONF -->|"Van nop"| GRADE["Chuyen bai lam cho bo cham"]
    LEFT -->|"Khong"| GRADE
    GRADE -->|"sang F8"| DONE_F8["Ket thuc: cham diem theo F8"]
```

Chứng thực: hai phần và stepper (test.js:52,352-384,1139-1470); trừ lượt khi sự kiện playing (:1302-1310); hoàn lượt khi lỗi (:1318-1337); reset currentTime (:1345-1349); hộp xác nhận còn câu trống kèm hai nút (:1422-1465); tự lưu localStorage (:17,145-238); e2e hoàn lượt + xác nhận (profile e2e spec :535-663). ✅

## F8 — Nộp bài: chấm điểm, kết quả, đồng bộ lead

Nguồn: apps/profile/public/kiem-tra-dau-vao/grading.js:49-131; apps/profile/public/kiem-tra-dau-vao/test.js:1472-1644. ✅

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant G as Cham diem phia trinh duyet
    participant R as Man ket qua
    participant SYNC as dong bo placement vao lead
    participant DB as DB lead
    HV->>G: nop bai
    G->>G: cong 1 diem moi cau trung — bo trong 0 diem
    G->>G: so tong diem voi bang nguong de lay CEFR va khoa goi y
    G-->>R: ket qua CEFR khoa goi y so dung tung phan
    R->>HV: hien ket qua va thong diep bao mat dap an
    R->>SYNC: gui tom tat placement <=300 ky tu bang keepalive
    SYNC->>DB: cap nhat lead da tao o F6
    alt dong bo thanh cong
        DB-->>SYNC: lead cap nhat
    else loi hoac bi chan
        SYNC-->>R: khong anh huong man ket qua
    end
    R->>HV: nut Dang Ky Theo Ket Qua Nay + Lam Lai + Doi thong tin
```

Chứng thực: chấm + map band fallback (grading.js:49-110); buildPlacementSummary ≤300 (:119-131); keepalive đồng bộ (test.js:1483-1519); màn kết quả + "🔄 Làm Lại" (:1472-1644); "Không phải bạn? Đổi thông tin" ở bước thông tin (:299). ✅
