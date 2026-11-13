---
feature: vocab-hub
type: reverse-srs-flows
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs/vocab-hub-reverse-flows — vocab-hub

Luồng nghiệp vụ đảo ngược — draft

Ghi chú: chữ trong sơ đồ viết ASCII không dấu; tên route giữ nguyên. Nhãn
mức tin cậy đặt ở phần chứng thực, không nằm trong sơ đồ.

## F1 — Vào hub từ vựng

**Nguồn:** apps/web/src/routes/_auth/vocab/index.tsx:16-40;
apps/web/src/components/vocab/vocab-hub-decks.tsx:1-10;
apps/web/src/components/vocab/vocab-deck-list.tsx:96-218;
apps/web/src/components/layout/sidebar.tsx:88-105;
apps/server/src/routes/snapshot.ts:386-410,833-848.

```mermaid
sequenceDiagram
    participant GV as Giao vien
    participant W as Web hub
    participant K as Kernel API
    GV->>W: Mo /vocab tu sidebar (nhom IELTS)
    W->>K: GET /api/kernel
    K-->>W: 200 snapshot org (vocabDecks + suggestions pending)
    W->>W: Tinh kicker: tong deck, deck rieng, goi y cho
    GV->>W: Chon tab
    alt tab Bo tu vung
        W-->>GV: Danh sach deck + 2 nut them
    else tab Tien do
        GV->>W: Chon hoc vien
        W->>K: GET /api/kernel/vocab/progress
        K-->>W: 200 tien do theo hoc vien
        W-->>GV: Khoi tien do 5 cap + 7 ngay
    end
```

```mermaid
flowchart TD
    GV["Giao vien"] --> OPEN["Mo /vocab"]
    OPEN --> SNAP["Lay snapshot org"]
    SNAP --> KICK{"Tab nao?"}
    KICK -->|"Bo tu vung"| LIST["Hub deck: tat ca deck to chuc"]
    KICK -->|"Tien do"| PROG["GET progress theo hoc vien"]
    LIST --> EMPTY{"Chua co deck?"}
    EMPTY -->|"Co"| END_MSGR["Thong bao rong + nut tao / them tu thu vien"]
    EMPTY -->|"Khong"| ROWS["Tung dong: ten + huy hieu nguon + 3 nut"]
    ROWS --> DONE1["Quan tri bo tu (F2-F5)"]
    PROG --> END_SHOW["5 cap + den han + hoat dong 7 ngay"]
```

**Chứng thực:**
- Mục điều hướng không có công tắc ẩn/hiện; /vocab hợp lệ cho SW. ✅
  sidebar.tsx:88-105; routes-matcher.ts:33; negative-search #9.
- Kicker đếm gợi ý chờ từ slice pending của bản chụp. ✅ index.tsx:16-36;
  snapshot.ts:396-410.
- Hub hiện TẤT CẢ deck tổ chức; trang lớp chỉ hiện deck của lớp. ✅
  vocab-deck-list.tsx:96-115.
- Đếm gợi ý chờ theo deck trên web. ✅ vocab-deck-list.tsx:125-131.

## F2 — Tạo / xoá bộ từ vựng

**Nguồn:** apps/web/src/components/vocab/vocab-deck-list.tsx:133-173,222-287;
apps/server/src/routes/vocab-teacher.ts:135-275;
packages/api/src/contracts.ts:3140-3172;
apps/server/src/routes/vocab-teacher.test.ts:108-110,146.

```mermaid
sequenceDiagram
    participant GV as Giao vien
    participant W as Web
    participant K as Kernel API
    participant DB as D1
    Note over GV,DB: Tao bo tu
    GV->>W: Bam "Tao bo tu" (hub hoac trong lop)
    GV->>W: Nhap tieu de
    alt tieu de trong hoang dang luu
        W-->>GV: Nut gui bi vo hieu
    else tieu de hop le
        W->>K: POST decks (classId null tai hub, classId cua lop)
        alt lop khac to chuc
            K-->>W: 404 (E-08)
        else ok
            K->>DB: INSERT vocab_deck
            K-->>W: 201
            W->>K: refresh snapshot
            W-->>GV: Dong hop, danh sach lam moi
            Note over W,GV: That bai: hop giu nguyen, KHONG thong bao (E-26)
        end
    end
    Note over GV,DB: Xoa bo tu
    GV->>W: Bam "Xoa" tren dong deck
    W-->>GV: Hop "Xoa bo tu vung?" (canh bao giu lich su on tap)
    GV->>W: Xac nhan
    W->>K: POST decks/delete
    K->>DB: 1 batch: card NOT LIKE libword - suggestion - word - deck
    Note over DB: vocab_review_log GIU NGUYEN (doctrine F7)
    K-->>W: 200
    W->>K: refresh snapshot
    W-->>GV: Toast "Da xoa bo tu ..."
```

```mermaid
flowchart TD
    A["Nut tao / xoa"] --> MODE{"Hanh dong?"}
    MODE -->|"Tao"| T{"Tieu de?"}
    T -->|"Trong"| END_DIS["Nut gui vo hieu"]
    T -->|"Co"| POST["POST decks"]
    POST --> ORG{"Lop cung to chuc?"}
    ORG -->|"Khong"| END_E404["404 (E-08)"]
    ORG -->|"Co"| INS["INSERT deck + refresh"]
    INS --> OKR{"Lam moi duoc?"}
    OKR -->|"Co"| END_CLOSE["Dong hop"]
    OKR -->|"Khong"| END_SILENT["E-26: im lang, hop mo"]
    MODE -->|"Xoa"| CONF{"Xac nhan?"}
    CONF -->|"Huy"| STOP["Khong lam gi"]
    CONF -->|"Dong y"| BATCH["1 batch: card(khong libword) - suggestion - word - deck"]
    BATCH --> KEEP["review_log giu nguyen"]
    KEEP --> END_TOAST["Toast da xoa + refresh"]
```

**Chứng thực:**
- Đích đích-null ở hub qua hợp đồng (classId nullable, default null) và test
  web khẳng định thân lệnh hub có đích rỗng. ✅ contracts.ts:3148-3150;
  vocab-hub.test.tsx:21.
- Lớp khác tổ chức → 404 TRƯỚC khi chèn. ✅ vocab-teacher.ts:142-156; test :401.
- Xoá giữ nhật ký; thẻ libword-* được loại trừ; test tắt PRAGMA khóa ngoại để
  chứng minh không dựa cascade. ✅ vocab-teacher.ts:209-275; test :108-110,146.
- 🔵 Thứ tự xoá card→suggestion→word→deck là TRÁNH lỗi khóa ngoại còn sót, vì
  schema đã tuyên bố "không dựa vào cascade" (schema/vocab.ts:18-20) và lô xoá
  xếp đúng thứ tự phụ thuộc (vocab-teacher.ts:246-273).
- E-26: nhánh tạo thất bại không toast — đối chiếu editor/thư viện đều có
  toast. ✅ vocab-deck-list.tsx:150-160; 🟡 OQ-03.

## F3 — Soạn từ vựng + âm thanh phát âm

**Nguồn:** apps/web/src/components/vocab/vocab-deck-editor.tsx:11-201;
apps/web/src/components/vocab/vocab-word-row.tsx:87-123;
apps/server/src/routes/vocab-teacher.ts:83-133,654-749,751-880;
packages/api/src/contracts.ts:3175-3197,2420-2423.

```mermaid
sequenceDiagram
    participant GV as Giao vien
    participant W as Editor
    participant K as Kernel API
    participant S as Media store
    GV->>W: Mo hop "Soan tu vung"
    W->>K: GET decks/:id/words
    alt deck la hoac khac to chuc
        K-->>W: 404 (E-09)
    else ok
        K-->>W: 200 danh sach tu
    end
    GV->>W: "+ Them tu" nhieu lan (dong nhap)
    GV->>W: Bam "Them" tren dong nhap
    alt tu trong
        W-->>GV: "Tu vung khong duoc de trong." (E-27)
    else hop le
        W->>K: POST words/upsert (strict)
        K->>S: ghi vocab_word
        K-->>W: 200
        W->>K: GET decks/:id/words (tai lai)
    end
    GV->>W: Tha file am thanh vao dong tu da luu
    W->>K: PUT words/:id/audio (raw + Content-Length)
    alt thieu Content-Length
        K-->>W: 411 (E-15)
    else file rong
        K-->>W: 400 (E-16)
    else qua 50 MB
        K-->>W: 413 (E-17)
    else MIME ngoai 9 loai
        K-->>W: 415 (E-18)
    else tu la
        K-->>W: 404 (E-12)
    else do lon doc duoc lech khai bao
        K-->>W: 400 (E-19)
    else ok
        K->>S: ghi object vocab/{org}/{word}/{uuid}
        K->>S: xoa object key cu
        K-->>W: 200 audioKey
        W-->>GV: Nhan "Da co audio"
    end
    GV->>W: Bam "Nghe"
    W->>K: GET words/:id/audio
    K-->>W: stream audio (404 neu chua co - E-20)
```

```mermaid
flowchart TD
    OPEN["Mo hop soan tu"] --> LOAD{"Tai danh sach?"}
    LOAD -->|"Loi"| ERR["Thong bao + nut Thu lai"]
    ERR --> OPEN
    LOAD -->|"OK"| EDIT["Soan dong nhap / sua dong da luu"]
    EDIT --> SAVE{"Tu co trong?"}
    SAVE -->|"Co"| END_BLOCK["E-27: thong bao tai cho"]
    SAVE -->|"Khong"| UPS["POST words/upsert"]
    UPS --> RELOAD["GET lai danh sach"]
    RELOAD --> AUD{"Co file am thanh moi?"}
    AUD -->|"Khong"| END1["Xong: cap nhat dong"]
    AUD -->|"Co"| PRE{"Kich thuoc <= 50MB va MIME trong 9 loai?"}
    PRE -->|"Khong"| END_FAIL["E-28: toast khong upload duoc"]
    PRE -->|"Co"| PUTS["PUT words/:id/audio"]
    PUTS --> SRV{"Server kiem tra 411/400/413/415/404/lech do lon"}
    SRV -->|"Loi"| END_FAIL
    SRV -->|"OK"| KEY["Sinh key + ghi + xoa key cu"]
    KEY --> END_BADGE["Nhan Da co audio"]
```

**Chứng thực:**
- Danh sách từ tải bằng lời gọi riêng mỗi lần mở hộp. ✅ editor.tsx:30-54.
- Dòng nháp chỉ sống trong phiên hộp; sửa/xoá dòng đã lưu gọi thẳng server và
  tải lại. ✅ editor.tsx:56-117.
- 9 MIME cho phép: mpeg, mp3, mp4, x-m4a, aac, wav, x-wav, webm, ogg. ✅
  vocab-teacher.ts:41-51,779-791; test 415 :237.
- Client chặn trước theo trần + MIME; hint nguyên văn "MP3/M4A/WAV · tối đa
  50 MB". ✅ vocab-word-row.tsx:92-99.
- F3: hợp đồng KHÔNG nhận audioKey từ client; server sinh
  vocab/{orgId}/{wordId}/{uuid} và xoá key cũ. ✅ contracts.ts:3175-3177;
  vocab-teacher.ts:816,827-837.
- Nhãn "Đã có audio" tính theo audioKey HOẶC audioUrl (từ nhân bản). ✅
  vocab-word-row.tsx:87-91; test vocab-library-dialog.test.tsx:320.

## F4 — Thêm bộ từ từ thư viện

**Nguồn:** apps/web/src/components/vocab/vocab-library-dialog.tsx:14-314,452-528;
apps/server/src/routes/vocab-library.ts:21-31,204-364;
apps/server/src/routes/vocab-library.test.ts:336-588;
apps/e2e/specs/vocab-library-clone.spec.ts:1-604.

```mermaid
sequenceDiagram
    participant GV as Giao vien
    participant W as Dialog thu vien
    participant K as Kernel API
    participant DB as D1
    GV->>W: Bam "Them tu thu vien"
    W->>W: Reset toan bo trang thai
    W->>K: GET /api/kernel/vocab-library/courses
    K-->>W: 20 khoa hoc
    W->>W: Tim theo ten / mo ta / dich
    GV->>W: Chon khoa
    W->>K: GET courses/:id/decks
    K-->>W: danh sach bai (co wordCount)
    W->>W: Tim kiem tre 300 ms
    GV->>W: Tick chon bai (theo luot)
    alt chon vuot 50 bai
        W-->>GV: "Da chon toi da n bai cho 1 luot..."
    else tong > 500
        W-->>GV: Chan nut + canh bao vuot tran (E-29)
    else trong tran
        W->>K: POST /api/kernel/vocab-library/clone
        alt deckIds trung trong luot
            K-->>W: 400 (E-21)
        else lop khac to chuc
            K-->>W: 404 (E-08)
        else bai khong ton tai
            K-->>W: 404 (E-23)
        else qua tran (kiem lan 1 hoac lan 2)
            K-->>W: 422 (E-24)
        else ok
            K->>DB: kiem bai da co trong dich (isNull cho dich hub)
            K->>DB: 1 batch: INSERT vocab_deck (lang en) + vocab_word (audioKey null)
            K-->>W: 201 {deckId, added, duplicates}
            W->>K: refresh snapshot
            alt refreshed
                W-->>GV: "Da them n bo tu." + chip dong hop
            else committed
                W-->>GV: "Da luu nhung chua xac nhan..."
            else definite-failure
                W-->>GV: "Khong the them bo tu (ly do)."
            else outcome-unknown
                W-->>GV: "Khong ro ket qua mang..."
            end
        end
    end
```

```mermaid
flowchart TD
    D1S["Hop 2 buoc: khoa - bai"] --> SEL["Chon bai theo luot"]
    SEL --> CAP{"Qua tran 50/500?"}
    CAP -->|"Co"| BLOCKC["Chan nut + E-29"]
    BLOCKC --> SEL
    CAP -->|"Khong"| SEND["POST clone"]
    SEND --> VD{"Kiem tra server"}
    VD -->|"Trung luot / sai lop / sai bai / qua tran"| APIERR["400 / 404 / 422"]
    APIERR --> END_FAILK["definite-failure"]
    VD -->|"OK"| INS["1 batch INSERT deck + words"]
    INS --> DUP{"Co bai trung voi dich?"}
    DUP -->|"Co"| REPC["Bao cao duplicates, van chen ban moi"]
    DUP -->|"Khong"| REPS["duplicates rong"]
    REPC --> R201
    REPS --> R201["201 added + duplicates"]
    R201 --> KIND{"Ket qua ve client?"}
    KIND -->|"refreshed"| END_OKT["Toast da them + dong hop"]
    KIND -->|"committed"| END_CT["Canh bao chua xac nhan"]
    KIND -->|"definite-failure"| END_FT["Toast khong the them"]
    KIND -->|"outcome-unknown"| END_UT["Hoi nguoi dung kiem tra danh sach"]
```

**Chứng thực:**
- Trần 50/500 kiểm 2 lần phía server (trước và sau khi đếm từ thật) → 422
  LIBRARY_CLONE_TOO_LARGE. ✅ vocab-library.ts:21-22,246-257,281-292; test :378-436.
- Trùng deckIds trong lượt → 400; lớp IDOR kiểm trước khi đụng bảng thư viện
  → 404. ✅ vocab-library.ts:220-230,234-245; test :337-348,350-359.
- Trùng với đích chỉ BÁO CÁO: đích hub dùng điều kiện isNull(class_id) —
  nhân bản lại vẫn chèn bản mới. ✅ vocab-library.ts:294-312; test :510-526,543-588;
  🟡 OQ-05.
- Chèn giữ provenance sourceLibraryDeckId, lang "en", audioKey null (URL thư
  viện chép sang audioUrl). ✅ vocab-library.ts:326-351; schema/vocab.ts:34-38.
- 4 loại kết quả ứng xử đầy đủ phía client; chip "Đã có trong hub"/"Đã có
  trong lớp". ✅ vocab-library-dialog.tsx:236-293,519-528; e2e S44.
- Duyệt thư viện là global đọc-cho-mọi-org; chưa đăng nhập → 401 đủ 4
  endpoint. ✅ vocab-library.ts:32-43; test :211-237,266-270.

## F5 — Gợi ý / thu hồi gợi ý

**Nguồn:** apps/web/src/components/vocab/vocab-suggest-dialog.tsx:10-14,68-79,84-142,150-194,218-285;
apps/server/src/routes/vocab-teacher.ts:277-496;
packages/db/src/schema/vocab.ts:159-203;
apps/server/src/routes/vocab-teacher.test.ts:453.

```mermaid
sequenceDiagram
    participant GV as Giao vien
    participant W as Dialog goi y
    participant K as Kernel API
    participant DB as D1
    GV->>W: Bam "Goi y" tren dong deck
    W->>K: GET decks/:id/suggestions (FRESH)
    K-->>W: lich su day du
    alt to chuc chua co hoc vien
        W-->>GV: "Chua co hoc vien nao trong trung tam."
    else co hoc vien
        GV->>W: Chon hoc vien + ghi chu (<= 500)
        GV->>W: Gui
        W->>K: POST decks/:id/suggestions
        K->>DB: doc dong cu theo (student, deck)
        alt deck hoac hoc vien khac to chuc
            K-->>W: 404 (E-09 / E-10)
        else chua co dong
            K->>DB: INSERT pending
            K-->>W: 201
        else dang cho hoac da chap nhan
            K-->>W: 200 (id cu - khong tao moi)
        else da an (dismissed)
            K->>DB: flip pending + reset note/teacherId/createdAt/respondedAt
            K-->>W: 200
        end
        W->>K: GET lai lich su (khong cho snapshot)
        W-->>GV: "Da gui goi y bo tu vung cho hoc vien."
    end
    GV->>W: Bam "Thu hoi" tren dong dang cho
    W->>K: POST suggestions/revoke
    alt goi y la hoac khac to chuc
        K-->>W: 404 (E-13)
    else ok
        K->>DB: flip dismissed (GIU respondedAt)
        K-->>W: 200
        W-->>GV: "Da thu hoi goi y bo tu vung."
    end
```

```mermaid
flowchart TD
    OPEN["Mo hop goi y"] --> FETCH["GET lich su FRESH"]
    FETCH --> STU{"To chuc co hoc vien?"}
    STU -->|"Khong"| END_NOSTU["Thong bao chua co hoc vien"]
    STU -->|"Co"| FORM["Chon hoc vien + ghi chu"]
    FORM --> SENDS["POST suggestions"]
    SENDS --> EXIST{"Dong cu (student, deck)?"}
    EXIST -->|"Khong co"| INS["INSERT pending - 201"]
    EXIST -->|"pending hoac accepted"| SAME["200 tra id cu"]
    EXIST -->|"dismissed"| FLIP["Flip pending + reset 4 truong"]
    INS --> TOASTS
    SAME --> TOASTS["Toast da gui + tai lai lich su"]
    FLIP --> TOASTS
    TOASTS --> REVS{"Thu hoi?"}
    REVS -->|"Khong"| END_OUT["Dong hop"]
    REVS -->|"Co"| RV["POST revoke"]
    RV --> FOUND{"Goi y ton tai cung org?"}
    FOUND -->|"Khong"| END_E404S["404 E-13"]
    FOUND -->|"Co"| SOFT["Flip dismissed, giu respondedAt"]
    SOFT --> END_TOASTR["Toast da thu hoi + tai lai lich su"]
```

**Chứng thực:**
- Ràng buộc duy nhất (student, deck) + upsert flip. ✅ schema/vocab.ts:159-164,198-201;
  vocab-teacher.ts:397-413; test suite gợi ý :453.
- Thu hồi MỀM giữ respondedAt — không hard-delete từ phía giáo viên. ✅
  vocab-teacher.ts:484-487.
- Nhánh đua tranh có bảo vệ select-200/500 nhưng KHÔNG có test kích hoạt
  (GAP-2/E-25). ✅ vocab-teacher.ts:440-453.
- Lịch sử tải FRESH vì snapshot chỉ phơi pending. ✅ suggest-dialog.tsx:84-91,120-142;
  snapshot.ts:396-410.
- Accept/dismiss của học viên thuộc student-practice (ranh giới FR-23); mã
  SUGGESTION_ALREADY_ACCEPTED nằm ở route học viên. ✅ routes/vocab.ts:861;
  🟡 OQ-06 (thu hồi sau accepted không bị chặn).

## F6 — Xem tiến độ học từ vựng

**Nguồn:** apps/server/src/routes/vocab-teacher.ts:498-652;
apps/server/src/lib/vocab-provision.ts:72-247;
apps/web/src/components/vocab/vocab-progress-tab.tsx:33-108,129-186,284-390;
packages/api/src/contracts.ts:3422-3466.

```mermaid
sequenceDiagram
    participant GV as Giao vien
    participant W as Tab tien do
    participant K as Kernel API
    participant DB as D1
    GV->>W: Chon tab Tien do
    W->>W: Bo loc hoc vien (ten / so dien thoai / email)
    alt to chuc chua co hoc vien
        W-->>GV: "Chua co hoc vien nao trong trung tam de theo doi tien do."
    else co
        GV->>W: Chon 1 hoc vien
        W->>K: GET /api/kernel/vocab/progress?studentId
        alt thieu studentId
            K-->>W: 400 (E-11)
        else hoc vien la hoac khac to chuc
            K-->>W: 404 (E-10)
        else ok
            K->>DB: deck lop (ghi danh hieu luc)
            K->>DB: deck goi y accepted
            K->>DB: deck thu vien co the (qua the libword)
            Note over K,DB: uu tien nguon: lop > goi y > thu vien
            K->>DB: vocab_card (level, state, dueAt) + vocab_review_log
            K->>K: hom nay +07:00 - cua so 7 ngay (hom nay tru 6)
            K-->>W: {decks: theo deck + theo cap + den han, activity 7 ngay}
            W->>W: phan tich bang hop dong
            W-->>GV: 5 khoi cap + den han hom nay + hoat dong 7 ngay
        end
    end
```

```mermaid
flowchart TD
    PICK["Chon hoc vien"] --> REQ{"Co studentId?"}
    REQ -->|"Khong"| END_B400["Ket thuc: bao loi 400 E-11"]
    REQ -->|"Co"| EX{"Hoc vien cung to chuc?"}
    EX -->|"Khong"| END_B404["Ket thuc: bao loi 404 E-10"]
    EX -->|"Co"| SRC["Gom 3 nguon deck"]
    SRC --> P1["Lop: ghi danh hieu luc"]
    SRC --> P2["Goi y: status accepted"]
    SRC --> P3["Thu vien: co the libword"]
    P1 --> DEDUP["Gop va loai trung: lop > goi y > thu vien"]
    P2 --> DEDUP
    P3 --> DEDUP
    DEDUP --> AGG["Moi deck: theo cap 1-5 (review) + den han truoc cuoi ngay +07:00"]
    AGG --> ACT["Hoat dong 7 ngay: so luot + dung/sai moi ngay"]
    ACT --> RESP["Tra ve + UI hien thi"]
    RESP --> ZDECK{"Hoc vien chua co deck?"}
    ZDECK -->|"Co"| END_ZMSG["Ket thuc: thong bao rong rieng"]
    ZDECK -->|"Khong"| END_GRID["Ket thuc: danh sach khoi tien do"]
```

**Chứng thực:**
- 400 thiếu studentId; 404 học viên khác tổ chức. ✅ vocab-teacher.ts:501-514;
  test :453.
- Mô hình tiếp cận 3 nguồn + độ ưu tiên — chú thích RT-F1 liệt kê đúng 5 điểm
  gọi dùng chung với phía học viên. ✅ vocab-provision.ts:72-108,110-247.
- Giờ Việt Nam: "hôm nay" theo +07:00, đến hạn so với cuối ngày +07:00, cửa
  sổ 7 ngày = hôm nay − 6; gom lượt theo ngày VN bất kể múi giờ máy chủ. ✅
  vocab-teacher.ts:516-527,569-599.
- Phân bố cấp chỉ đếm thẻ đang review; mới/chưa học tính riêng. ✅
  vocab-teacher.ts:601-637; test :453,708.
- Tiến độ KHÔNG qua snapshot — endpoint riêng vì dữ liệu per-student. ✅
  progress-tab.tsx:156-178; 🔵 INF-4.
