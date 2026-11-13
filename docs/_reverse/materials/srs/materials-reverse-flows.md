---
feature: materials
type: reverse-srs-flows
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs/materials-reverse-flows — materials

Bảy luồng khớp danh mục F1-F7 ở spec Mục 9. Mỗi luồng có sơ đồ sequence + flowchart
(F1 flowchart bổ sung sequence truy vấn; F3/F6 gộp một sequence đại diện). Nhãn sơ đồ
viết ASCII không dấu. Nhãn: ✅ code khẳng định, 🔵 suy luận ≥2 bằng chứng, 🟡 kèm OQ.

## F1 — Duyệt và tìm kiếm ngân hàng tài liệu (UC-01)

Nguồn: apps/web/src/routes/_auth/materials/index.tsx:58-98,161-208,265-385;
apps/web/src/lib/repos/materials.ts:281-340; apps/server/src/routes/materials.ts:161-174,989-1030.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant TR as Trang Tai lieu
    participant RQ as React Query
    participant API as GET /api/materials
    participant DB as DB SQLite
    GV->>TR: mo trang, go tu khoa / chon chip loai / chon thu muc
    TR->>TR: sau 300ms ngung go, ghi q, kind, folderId len URL
    TR->>RQ: goi materialsList(q, kind, folderId)
    RQ->>API: GET /api/materials?q=&kind=&folderId=
    API->>API: gate phien - GET doi hoi canReadMaterials
    API->>DB: select material cung org, loc folder (root = cha rong), order updatedAt desc, id asc
    DB-->>API: cac dong material
    API->>API: fold tieng Viet (NFC + vi) tren title, description, originalName
    API-->>RQ: 200 items (MaterialView 12 truong)
    RQ-->>TR: danh sach
    TR->>TR: loc kind phia client + tinh dem chip
    TR->>GV: dong tai lieu + duong dan thu muc + nhan Dung o N buoi
```

```mermaid
flowchart TD
    A["Mo trang Tai lieu"] --> B["Doc bo loc tu URL q, kind, folderId"]
    B --> C{"Thu muc trong URL con ton tai?"}
    C -->|"Khong"| D["The Thumuc nay khong con ton tai + nut Xem tat ca tai lieu"]
    C -->|"Co"| E["Query danh sach theo q + folderId"]
    E --> F{"Server tra loi?"}
    F -->|"Loi"| G["Khong tai duoc danh sach tai lieu + nut Thu lai"]
    F -->|"Thanh cong"| H{"Sau loc kind con dong?"}
    H -->|"Co"| I["Danh sach tai lieu + chip dem loai"]
    H -->|"Khong"| J{"Dang co bo loc (q hoac kind)?"}
    J -->|"Co"| K["Khong co tai lieu nao phu hop voi bo loc. + nut Xoa bo loc"]
    J -->|"Khong"| L["Trang rong theo quyen: Chua co tai lieu nao + 2 nut hanh dong neu co quyen ghi"]
```

- ✅ Bộ lọc sống trong URL qua validateSearch, chuẩn hóa giá trị lạ —
  apps/web/src/routes/_auth/materials/index.tsx:72-98; debounce 300ms :161-178.
- ✅ Server lọc theo org phiên, `folderId=root` map cha-rỗng, sắp mới-sửa trước,
  từ khóa > 100 ký tự → 400, kind lạ → 400 — apps/server/src/routes/materials.ts:989-1030.
- ✅ Tìm tiếng Việt không dấu-hoa hạ ở SERVER bằng fold JS (lower() của SQLite chỉ
  hạ ASCII, "Đề" không khớp "đề") — materials.ts:1015-1026 (comment nguyên văn).
- ✅ Lọc chip loại chạy phía CLIENT trên danh sách đã lấy; đếm chip tính client —
  apps/web/src/routes/_auth/materials/index.tsx:105-113,193-208.
- ✅ 5 trạng thái khung (lỗi / rỗng-không-lọc / rỗng-có-lọc / thư mục-mất / có
  bộ lọc) đúng wording — :185-191,302-385.

## F2 — Tải file lên (UC-04, và đường thẳng vào buổi trong F4)

Nguồn: apps/web/src/components/materials/material-dialogs.tsx:350-433;
apps/web/src/lib/repos/materials.ts:224-271; packages/api/src/material-contracts.ts:303-330,141-173;
apps/server/src/routes/materials.ts:302-432,1067-1098,1295-1356.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant DL as Hop thoai Tai file len
    participant CK as Kiem truoc client
    participant API as PUT /api/materials/files
    participant SU as storeUpload server
    participant KS as Kho object R2
    participant DB as DB SQLite
    GV->>DL: chon file
    DL->>CK: resolveMaterialMimeType + checkMaterialUpload (mime trinh duyet, size)
    alt sai loai, rong, hoac qua tran
        CK-->>DL: tu choi ngay tai cho - khong byte nao roi may
    else dat
        DL->>API: PUT byte tho + X-File-Name (encodeURIComponent) + Content-Type + Content-Length
        API->>SU: kiem header (MIME trong danh sach, size trong tran, ten file khop duoi)
        SU->>SU: peekStream toi da 64 byte dau, matchesMaterialMagic
        SU->>KS: store.put(key orgId/id, stream) voi dem byte that theo size khai bao
        KS-->>SU: object da luu (lech byte -> MediaSizeMismatchError)
        SU-->>API: ok (values + callback discard)
        API->>DB: insert material (kind theo mime, title = ten file, key = orgId/id)
        opt ghi DB that bai
            API->>KS: upload.discard - xoa object vua ghi nen
        end
        API-->>DL: 201
        DL->>GV: toast + lam moi cum query ngan hang
    end
```

```mermaid
flowchart TD
    A["Chon file trong hop thoai"] --> B["Client kiem mime + size bang ham thuan cung mot nguon voi server"]
    B --> C{"Client chap nhan?"}
    C -->|"Khong"| D["Bao loi ngay tai cho - khong gui byte nao"]
    C -->|"Co"| E["PUT byte tho len server"]
    E --> F{"Binding kho co khong?"}
    F -->|"Khong"| G["503 MATERIALS_DISABLED"]
    F -->|"Co"| H{"Header hop le?"}
    H -->|"MIME la, rong, hoac qua tran"| I["415 hoac 413 kem maxBytes hoac 400 + huy stream"]
    H -->|"Du va ten file khop duoi MIME"| J{"64 byte dau khop chu ky magic?"}
    J -->|"Khong"| K["415 + huy stream"]
    J -->|"Co"| L["Stream vao kho, dem byte that"]
    L --> M{"Byte thuc trung khai bao?"}
    M -->|"Lech"| N["400 + huy object"]
    M -->|"Du"| O["Ghi DB (upload vao buoi: 1 batch gom material + lesson_material)"]
    O --> P{"Ghi DB thanh cong?"}
    P -->|"Khong"| Q["discard xoa object vua ghi + tra loi nghiep vu tuong ung"]
    P -->|"Co"| R["201 + toast + lam moi danh sach"]
```

- ✅ Client kiểm TRƯỚC bằng chính hàm thuần server dùng (một nguồn sự thật) —
  packages/api/src/material-contracts.ts:4-8; apps/web/src/lib/repos/materials.ts:224-260;
  test chặn trước khi gửi apps/web/src/routes/_auth/materials/index.test.tsx:274-291.
- ✅ Chuỗi kiểm server: header → sanitize tên + khớp đuôi → peek 64 byte magic →
  đếm byte thật; mọi nhánh chặn cancel() stream trước khi trả lỗi —
  apps/server/src/routes/materials.ts:302-432 (cancel :338,365,369,390,394,411).
- ✅ Trần theo loại: tài liệu 25 MiB, audio-video 95 MiB (#647) —
  packages/api/src/material-contracts.ts:18-26.
- ✅ Ghi DB lỗi → discard object nền (inBackground); thư mục bị xóa giữa chừng →
  404 — apps/server/src/routes/materials.ts:403-404,429-430,1084-1091.
- ✅ Kích thước thực ≠ khai báo → 400 (kho đếm byte thật, không tin header) —
  apps/server/src/lib/media-store.ts:33-52; test materials.test.ts:2029-2302.

## F3 — Quản lý thư mục (UC-02)

Nguồn: apps/web/src/routes/_auth/materials/index.tsx:503-665;
apps/web/src/components/materials/material-dialogs.tsx:118-250;
apps/web/src/components/materials/folder-select.tsx:1-55;
apps/server/src/routes/materials.ts:677-985.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant DL as Dialog thu muc (Doi ten / Di chuyen)
    participant API as PATCH /api/materials/folders/:id
    participant GU as Guard WITH RECURSIVE
    participant DB as DB SQLite
    GV->>DL: nhap ten moi / chon cha moi, xac nhan
    DL->>API: PATCH name va hoac parentId
    API->>API: khong doi gi -> tra nguyen trang thai
    API->>GU: UPDATE kem guard (cha ton tai, cung org, khong vong, duoi 5 cap)
    alt guard thay dong - thanh cong
        GU-->>API: dong da sua
        API-->>DL: 200 view
    else guard khong thay dong (bi xoa, cheo org, tao vong, qua sau)
        GU-->>API: 0 dong
        API->>DB: doc lai trang thai de phan loai
        DB-->>API: chan doan 404 hoac 400 FOLDER_CYCLE / FOLDER_TOO_DEEP
        API->>GU: thu lai 1 lan voi cha vua doc
        alt lan 2 thanh cong
            GU-->>API: dong da sua
            API-->>DL: 200 view
        else van cham guard
            API-->>DL: 409 concurrent folder conflict
        end
    end
```

```mermaid
flowchart TD
    A["Thao tac thu muc"] --> B{"Loai nao?"}
    B -->|"Tao"| C{"Guard INSERT nguyen tu: cha ton tai, cung org, toi da 5 cap, khong vong"}
    B -->|"Doi ten hoac Di chuyen"| D{"Guard UPDATE nguyen tu cung dieu kien, chay tai thoi diem UPDATE"}
    B -->|"Xoa"| E{"Thu muc rong (khong con, khong tai lieu)?"}
    C -->|"Ten trung cung cha"| F["409 FOLDER_NAME_TAKEN"]
    C -->|"Tao vong hoac vuot 5 cap"| G["400 FOLDER_CYCLE / 400 FOLDER_TOO_DEEP"]
    C -->|"Cha mat hoac cheo org"| H["Doc lai phan loai, thu lai 1 lan"]
    D -->|"Ten trung vi tri moi"| F
    D -->|"Di chuyen vao chinh no hoac con chau"| G
    D -->|"Cha bien mat giua chang"| H
    H -->|"Cu duoc"| I["Thanh cong 200/201"]
    H -->|"Khong the cuu"| J["409 concurrent folder conflict"]
    E -->|"Con muc"| K["409 FOLDER_NOT_EMPTY"]
    E -->|"Rong"| L["Xoa dong - FK cha no action nen chi la xoa duoc; xoa org cascade ca cay"]
```

- ✅ Guard nguyên tử bằng WITH RECURSIVE (anc/sub, max(depth)+max(level) ≤ 5,
  CTE sub loại cạnh quay về chính id để thư mục kẹt vòng tự phục hồi được di
  chuyển ra) — apps/server/src/routes/materials.ts:677-756.
- ✅ Thua race: đọc lại phân loại (404 / FOLDER_CYCLE / FOLDER_TOO_DEEP), thử lại
  1 lần, lần 2 vẫn fail → 409 "concurrent folder conflict"; catch nameTaken → 409 —
  :758-792,800-855,857-950.
- ✅ Xóa chỉ-khi-rỗng, kiểm lại khi FK chặn (mục mới chen giữa lúc kiểm và xóa) —
  :952-985.
- ✅ Client: dialog di chuyển loại trừ chính subtree đang di chuyển —
  apps/web/src/components/materials/folder-select.tsx:23-38;
  apps/web/src/lib/material-folders.ts:64-84.
- 🔵 Thư mục kẹt vòng lịch sử (dữ liệu cũ) vẫn hiện trong cây ở gốc —
  apps/web/src/lib/material-folders.ts:33-62 + test ứng dụng
  apps/web/src/routes/_auth/materials/index.test.tsx (describe #646) + guard SQL
  cho phép move ra ngoài (:727-736) → cơ chế tự phục hồi 3 lớp.

## F4 — Tài liệu của buổi học (UC-08)

Nguồn: apps/web/src/components/class-detail/session-materials-modal.tsx:1-283;
apps/server/src/routes/materials.ts:434-653,1207-1386;
apps/server/src/lib/session-curriculum-materials.ts:1-174.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant MD as Modal Tai lieu buoi hoc
    participant API as GET /api/classes/:classId/sessions/:date/materials
    participant CM as resolveCurriculumMaterials
    participant DB as DB SQLite
    GV->>MD: mo modal tai lieu cua buoi
    MD->>API: GET danh sach
    API->>DB: resolveSession (lop cung org, ngay yyyy-mm-dd, buoi = lesson hoac class_session lop 0 hoc vien)
    DB-->>API: buoi hoc (GET KHONG chan nghi le)
    API->>DB: loadSessionMaterials join material cung org, order position, createdAt, id
    API->>CM: tim bai giao trinh theo buoi N tren lich hien hanh (holiday khong chiem so)
    CM-->>API: tai lieu cua bai (projection an toan)
    API-->>MD: 200 items + curriculumMaterials (direct uu tien, loai trung id)
    MD->>GV: danh sach gan truc tiep + muc Copy theo bai cua buoi
```

```mermaid
flowchart TD
    A["Thao tac ghi tren buoi (gan / tai len / go)"] --> B{"Ngay do la buoi nghi le toan phan?"}
    B -->|"Co"| C["409 SESSION_HOLIDAY - gan, tai len va go deu bi chan"]
    B -->|"Khong"| D{"Ngay da-doi-le con sot buoi thu cong?"}
    D -->|"Co"| E["409 - gan vao day la tao mo coi, buoi that da chuyen ngay moi"]
    D -->|"Khong"| F{"Che do nao?"}
    F -->|"Gan tu ngan hang"| G{"Tai lieu ton tai cung org?"}
    G -->|"Khong"| H["404 MATERIAL_NOT_FOUND"]
    G -->|"Co"| I{"Da gan tai lieu nay vao buoi chua?"}
    I -->|"Roi"| J["409 ALREADY_ATTACHED"]
    I -->|"Chua"| K["INSERT position = max + 1 kem guard CASE tren cot ngay"]
    F -->|"Tai len moi"| L["storeUpload + 1 batch: material + lesson_material (guard CASE)"]
    F -->|"Go khoi buoi"| M{"Dang gan?"}
    M -->|"Khong"| N["404 NOT_ATTACHED"]
    M -->|"Co"| O["DELETE dong lien ket - tai lieu van o ngan hang"]
    K --> P{"Race ap-doi le xay ra khi ghi?"}
    L --> P
    P -->|"Co"| Q["Loi DB phan loai lai thanh 409 SESSION_HOLIDAY / 404 - khong 500"]
    P -->|"Khong"| R["201 view kem position, hoac 200"]
    O --> R
```

- ✅ GET không chặn holiday (comment "modal đang mở vẫn render") trong khi
  POST/PUT/DELETE chặn — apps/server/src/routes/materials.ts:573-575,1239-1242.
- ✅ Ba lớp guard: isHolidayBucket (#645, đếm lesson holiday/non-holiday, buổi
  thủ công lớp-0-học-viên coi là all-holiday #658), isShiftedHolidayBucket (#662),
  holidayBucketDateGuard CASE chặn race ngay ở cột NOT NULL — :434-550,544-550;
  comment 6 bề mặt drift :477-486.
- ✅ Gắn lặp-an-toàn: onConflictDoNothing → inserted rỗng → 409 ALREADY_ATTACHED —
  :1270-1288.
- ✅ Upload thẳng buổi: db.batch một lần cho material + lesson_material — :1316-1334.
- ✅ Gỡ KHÔNG đòi còn lesson (liên kết mồ côi sau xóa buổi vẫn gỡ được) —
  :1358-1366 (comment + requireLesson false).
- ✅ curriculumMaterials: mapping buổi N ↔ bài N theo lịch hiện hành, dedupe
  direct-ưu-tiên — apps/server/src/lib/session-curriculum-materials.ts:113-174;
  materials.ts:1218-1228.

## F5 — Mở / tải file tài liệu (UC-07)

Nguồn: apps/web/src/components/materials/material-item.tsx:67-107;
apps/web/src/lib/repos/materials.ts:401-404; apps/server/src/routes/materials.ts:1182-1203;
apps/server/src/lib/material-file-response.ts:1-112.

```mermaid
sequenceDiagram
    autonumber
    actor NV as Nguoi xem giao vien
    participant TB as Trinh duyet
    participant API as GET /api/materials/:id/file
    participant KS as Kho object
    NV->>TB: bam Mo / Phat / Tai xuong (download=1)
    TB->>API: GET kem Range (khi phat tiep) + cookie phien
    API->>API: gate GET -> canReadMaterials
    API->>API: parseByteRange theo tong (khong thoai -> 416 ngay, khong cham kho)
    alt Range cu phap dung
        API->>KS: store.get(key, range) khi co Range
        KS-->>API: khoi du lieu (206 + Content-Range khi co Range)
        API-->>TB: 206 + nosniff + CSP khoa + disposition inline (media) hoac attachment
    else Range khong thoai
        API-->>TB: 416 + Content-Range bytes * / tong
    end
```

```mermaid
flowchart TD
    A["Yeu cau mo file tai lieu"] --> B{"Kho da cau hinh?"}
    B -->|"Khong"| C["503 MATERIALS_DISABLED"]
    B -->|"Co"| D{"Tai lieu co object (kind file hoac media)?"}
    D -->|"Link ngoai"| E["404 - link mo bang URL goc, khong qua duong file"]
    D -->|"Co"| F{"Header Range hop le?"}
    F -->|"Khong thoai"| G["416 kem Content-Range tong"]
    F -->|"Khong co hoac hop le"| H["Lay khoi du lieu (206 neu co Range)"]
    H --> I{"kind media va khong ep download?"}
    I -->|"Co"| J["Phat truc tiep trong tab: CSP media inline, sandbox khong allow-scripts"]
    I -->|"Khong"| K["Tai ve: Content-Disposition attachment, ten goc RFC 8187"]
    J --> L["MIME da luu neu trong danh sach cho phep, khong thi application/octet-stream + nosniff"]
    K --> L
```

- ✅ MỘT dải Range: 206 kèm Content-Range (:100-103); Range không thoả → 416
  kèm `bytes */tổng` (:62-67) — apps/server/src/lib/material-file-response.ts:45-56.
- ✅ inline CHỈ khi kind media và không `?download=1`; tài liệu luôn attachment;
  STRICT_CSP cho file thường, INLINE_MEDIA_CSP (không allow-scripts) cho media —
  :14-34,90-112.
- ✅ Header khóa: nosniff, no-referrer, coop same-origin, cache riêng tư — :27-34.
- ✅ Nút theo loại ở client: link mở tab mới (noopener), media Phát + Tải xuống,
  file chỉ Tải xuống — apps/web/src/components/materials/material-item.tsx:67-107.
- ✅ Kho thiếu → 503 — apps/server/src/routes/materials.ts:1184-1187.

## F6 — Xóa tài liệu (UC-06; xóa thư mục theo F3)

Nguồn: apps/web/src/components/materials/material-dialogs.tsx:513-574;
apps/server/src/routes/materials.ts:139-150,265-286,1135-1180.

```mermaid
sequenceDiagram
    autonumber
    actor GV as Giao vien
    participant DL as Dialog xac nhan xoa
    participant API as DELETE /api/materials/:id
    participant DB as DB SQLite
    participant KS as Kho object
    GV->>DL: xac nhan xoa sau khi doc canh bao Khong the hoan tac
    DL->>API: DELETE
    API->>DB: dem lesson_material VA syllabus_lesson_material
    alt con bat ky tham chieu nao
        DB-->>API: so buoi + so bai giao trinh
        API-->>DL: 409 MATERIAL_IN_USE kem ca hai so
    else khong con tham chieu
        API->>DB: delete row material (xoa dong TRUOC)
        API->>KS: store.delete(objectKey) SAU - loi chi ghi log
        API-->>DL: 200
        DL->>GV: toast + lam moi danh sach va cay thu muc
    end
```

```mermaid
flowchart TD
    A["Yeu cau xoa"] --> B{"Doi tuong nao?"}
    B -->|"Thu muc"| C{"Rong?"}
    C -->|"Con muc"| D["409 FOLDER_NOT_EMPTY"]
    C -->|"Rong"| E["Xoa dong thu muc + lam moi cay"]
    B -->|"Tai lieu"| F{"Dang dung o buoi hoac tren giao trinh?"}
    F -->|"Co"| G["409 MATERIAL_IN_USE kem so buoi + so bai"]
    F -->|"Khong"| H{"kind can object ma khong co kho?"}
    H -->|"Co"| I["503 - khong xoa row, tranh object mo coi khong ai don"]
    H -->|"Khong"| J["Xoa row; FK cham vi vua bi gan -> dem lai ve 409"]
    J --> K["Xoa object sau - loi xoa object chi log, DB da an toan"]
```

- ✅ Đếm CẢ HAI bảng tham chiếu khi chặn xóa (#655) kèm 2 số trong payload lỗi —
  apps/server/src/routes/materials.ts:265-286,1147-1153;
  packages/api/src/material-contracts.ts (MaterialRequestError fields ở client
  apps/web/src/lib/repos/materials.ts:35-62).
- ✅ Thứ tự row-trước-object là quyết định thiết kế có comment — :139-150
  ("xóa object trước sẽ để row trỏ object đã mất").
- ✅ Lỗi xóa object không làm API thất bại — :1167-1178 (catch chỉ log).
- 🔵 Nhãn "Dùng ở N buổi" trên danh sách CHỈ đếm lesson_material — người dùng có
  thể thấy "Chưa dùng ở buổi nào" nhưng xóa vẫn bị chặn vì giáo trình (bất đối
  xứng hiển thị/chặn) — materials.ts:67-68 vs :265-286 → OQ-02.

## F7 — Học viên đọc tài liệu buổi học (UC-09)

Nguồn: apps/server/src/routes/student-materials.ts:1-222;
apps/student/src/components/class/lesson-materials.tsx:1-221;
packages/api/src/material-contracts.ts:476-497.

```mermaid
sequenceDiagram
    autonumber
    actor HV as Hoc vien
    participant UI as Man hinh tai lieu buoi
    participant API as GET /api/student/classes/:classId/sessions/:date/materials
    participant DB as DB SQLite
    HV->>UI: mo buoi hoc
    UI->>API: GET danh sach (cookie hoc vien)
    API->>API: requireStudent + enrollment ACTIVE trong lop (org dang chon)
    API->>DB: enrollment do co lesson vao ngay do khong
    alt khong ghi danh hoac khong co bai hoc ngay do
        API-->>UI: 404 (ngu nghia IDOR - khong phan biet ton tai)
    else co buoi
        API->>DB: projection 9 truong + curriculumMaterials (khong objectKey, createdBy, folderId, usageCount)
        DB-->>API: dong tai lieu
        API-->>UI: 200 items + curriculumMaterials
        UI->>HV: danh sach chi-doc, mo / tai theo loai
    end
```

```mermaid
flowchart TD
    A["Hoc vien mo tai lieu buoi"] --> B{"Dang ky ACTIVE trong lop (org dang chon)?"}
    B -->|"Khong"| C["404 - khong he phan biet buoi co ton tai khong"]
    B -->|"Co"| D{"Enrollment do co lesson vao dung ngay do?"}
    D -->|"Khong"| C
    D -->|"Co"| E{"La file can mo hoac tai?"}
    E -->|"Co"| F["GET file duong hoc vien - buoi truc tiep hoac bai giao trinh anh xa deu mo duoc"]
    E -->|"Khong"| G["Xem danh sach 9 truong an toan + mo link ngoai tab moi"]
    F --> H["Khong bao gio lo key object, nguoi tao, thu muc, so buoi dung"]
    G --> H
```

- ✅ Guard kép (enrollment active + lesson ngày đó) → 404, comment "ngữ nghĩa
  IDOR như /classes/:classId" — apps/server/src/routes/student-materials.ts:28-34,44-75.
- ✅ Projection an toàn tách bạch: StudentLessonMaterialView 9 trường, không
  teacher-only; cột objectKey/createdBy ghi chú teacher-only ngay trong schema —
  packages/api/src/material-contracts.ts:476-490;
  packages/db/src/schema/material.ts:50-58.
- ✅ File học viên: kho thiếu 503; sai id/ngoài buổi → 404; Range như giáo viên —
  apps/server/src/routes/student-materials.ts:132-219.
- ✅ Tài liệu giáo trình ánh xạ buổi vẫn mở được dù không có dòng liên kết —
  :150-190 (resolve lại danh sách rồi tìm id).
