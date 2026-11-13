---
feature: placement-test
type: reverse-srs
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
confidence_summary: "spec: ✅ 176 / 🔵 5 / 🟡 2; tổng toàn assembly: ✅ 355 / 🔵 25 / 🟡 29"
complexity_flags: [media]
---

# Reverse-SRS — feature `placement-test` (Bài test đầu vào / kiểm tra đầu vào CEFR)

> Quy ước nhãn: ✅ = có code minh họa kèm path:line; 🔵 = suy luận từ ≥2 bằng chứng (liệt kê đầy đủ ở reverse-sources.md / _evidence.md); 🟡 = chưa rõ, phải có OQ tương ứng trong reverse-gaps.md. Mỗi mệnh đề mang nhãn riêng; không nâng 🟡 lên ✅ nếu không có code.

## 0. Nguồn soạn thảo

### 0.1 Phương pháp

- Soạn bằng đọc tĩnh source code ở commit `d6c0f6b5` (branch develop), không chạy test, không chạy app. ✅
- R1 test-mining: đếm `test(`/`it(` bằng regex `^\s*(test|it)\(` trên 7 file test của feature + 2 file test biên; tổng 26 test active thuộc feature, không có skip/only/todo (chi tiết ở _evidence.md). ✅
- R3 negative-search: mọi khẳng định "không tồn tại" kèm lệnh grep đã chạy thật + kết quả thật ở reverse-gaps.md mục Negative-search. ✅
- Trang học viên là trang tĩnh zero-dependency (`apps/profile/public/kiem-tra-dau-vao/`) nên hành vi chỉ chứng minh được bằng JS tĩnh + e2e; chuỗi hiển thị trích nguyên văn, không có catalog i18n. ✅

### 0.2 Bảng nguồn chính

Bảng đầy đủ 42 nguồn ở `reverse-sources.md`. Nguồn trọng yếu:

| S# | Path | Loại | Range | Confidence | Ghi chú |
|----|------|------|-------|------------|---------|
| S01 | packages/db/src/schema/placement-test.ts | schema | 1-51 | ✅ | 2 bảng placement_test + placement_test_audio |
| S04 | packages/api/src/placement-test-contracts.ts | contract | 1-562 | ✅ | hằng số, validate publish, snapshot builder |
| S05 | apps/server/src/routes/placement-test.ts | server-route | 1-536 | ✅ | API GV: GET/PUT draft, audio, publish |
| S06 | apps/server/src/routes/public-placement-test.ts | server-route | 1-174 | ✅ | API công khai: đề + audio (Range/206) |
| S09 | apps/web/src/routes/_auth/placement-test/index.tsx | web-route | 1-759 | ✅ | màn sửa đề của GV |
| S29 | apps/profile/public/kiem-tra-dau-vao/test.js | static-js | 1-1826 | ✅ | trang học viên: 5 bước, chấm điểm |
| S30 | apps/profile/public/kiem-tra-dau-vao/lead-gate.js | static-js | 1-284 | ✅ | cổng thu thập thông tin học viên |

### 0.3 Tài liệu nghiệp vụ và plan tham chiếu

- Không có tài liệu SRS nghiệp vụ gốc trong repo; bản thân tài liệu này được dựng ngược từ code. ✅
- plan-ref: `#515` xuất hiện trong comment code tại packages/api/src/placement-test-contracts.ts:11, packages/db/src/schema/placement-test.ts:6, apps/server/src/routes/public-placement-test.ts:20, apps/web/src/components/layout/sidebar.tsx:53, apps/web/src/routes-matcher.ts:30, apps/server/src/app.ts:324. ✅
- plan-ref: `#534` xuất hiện trong comment code tại apps/profile/public/kiem-tra-dau-vao/lead-gate.js:4. ✅
- plan `#511` (trang học viên) không xuất hiện trong comment code nào (grep rỗng) nên chỉ được nhắc như bối cảnh, không gắn nhãn xác minh trên mệnh đề plan-ref này.
- Quyết định kỹ thuật D4-D15 của plan #515 được truy thấy rải trong comment code: D4/D6/D11 tại placement-test-contracts.ts:286,448,521; D10/D14 tại apps/web/src/lib/repos/placement-test.ts:122,207; D11 tại placement-test.ts:33,89; D13 tại placement-test.ts:121. ✅
- File kế hoạch trong `plans/` (261031-0736-511, 261031-1242-515, 261101-1535-534) được đọc như bằng chứng phụ cho ý định thiết kế; mệnh đề nghiệp vụ trong tài liệu này vẫn chỉ dựa trên code. 🔵

## 1. Phạm vi

- Feature gồm: (a) màn soạn đề cho GV tại `/placement-test` trong apps/web; (b) API riêng tư `/api/placement-test*` cho GV; (c) API công khai `/public/placement-test*` cho trang tĩnh; (d) trang học viên zero-dependency `/kiem-tra-dau-vao/` trong apps/profile; (e) cổng thu thập thông tin học viên tạo lead gắn nhãn nguồn `placement-test`; (f) 2 bảng DB `placement_test`, `placement_test_audio`. ✅
- Ngoài phạm vi: CRUD lead chung (feature leads), rate-limit cho endpoint đọc công khai (plan #515 ghi rõ non-goal; xem reverse-gaps.md), trang quản trị apps/admin, i18n. ✅
- Feature chỉ có ý nghĩa đầy đủ với đúng một tổ chức được cấu hình `LEAD_ORG_ID`; các tổ chức khác vẫn soạn/đọc được đề của mình nhưng trang công khai chỉ phục vụ tổ chức lead. ✅

## 2. Actor

| Actor | Vai | Bằng chứng |
|-------|-----|-----------|
| Giáo viên/Chủ trung tâm (GV) | soạn đề, tải audio, phát hành | ✅ packages/auth/src/role.ts:75,85 |
| Trợ giảng (ta), GV đứng lớp (class_teacher) | bị chặn 403 khỏi API soạn đề | ✅ apps/server/src/routes/placement-test.test.ts:238-267 |
| Học viên (khách vãng lai, chưa đăng nhập) | làm bài kiểm tra đầu vào, để lại thông tin | ✅ apps/server/src/routes/public-placement-test.ts:19-24 |
| Hệ thống | chấm điểm phía client, dọn audio mồ côi | ✅ apps/profile/public/kiem-tra-dau-vao/grading.js:49-110; apps/server/src/routes/placement-test.ts:53-107 |

- Actor GV được nhận diện qua role membership tổ chức: `FINANCE_ROLES = ["teacher", "owner", "admin"]` và hàm `canAccessFinance`. ✅ packages/auth/src/role.ts:75,85
- Actor học viên không có phiên đăng nhập; CORS chỉ cho origin trang profile và không gửi credential. ✅ apps/server/src/routes/public-placement-test.ts:19-24,28-37

## 3. Yêu cầu chức năng (FR)

| Mã | Yêu cầu | Nhãn | Nguồn (path:line) |
|----|---------|------|-------------------|
| FR-01 | GV truy cập màn soạn đề qua mục "Bài test đầu vào" trong nhóm "Kinh doanh" của thanh điều hướng, hoặc qua phím tắt tìm kiếm ⌘K; mục chỉ hiện với vai trò được xem khu tài chính. | ✅ | apps/web/src/components/layout/sidebar.tsx:52-59,128-145; apps/web/src/components/command-search/search-index.ts:179-191 |
| FR-02 | Truy cập trực tiếp route `/placement-test` khi không đủ quyền điều về `/dashboard` kèm thông báo "Bạn không có quyền xem Sổ công nợ". | ✅ | apps/web/src/lib/use-finance-route-guard.ts:1-31 |
| FR-03 | Khi chưa có bản nháp, màn soạn hiển thị trạng thái rỗng với hai lựa chọn: "Nhập đề gốc (30 câu, 5 audio)" và "Tạo đề trống". | ✅ | apps/web/src/components/placement-test/seed-empty-state.tsx:17-55 |
| FR-04 | "Nhập đề gốc" tải bộ câu hỏi mẫu từ `/placement-seed/questions.json` và 5 file mp3 mẫu; mỗi mp3 được tải lên qua API audio rồi gắn `audioId` vào đoạn nghe tương ứng; kết quả là đề 30 câu, 5 đoạn nghe và được lưu nháp ngay. | ✅ | apps/web/src/routes/_auth/placement-test/index.tsx:334-415 |
| FR-05 | "Tạo đề trống" khởi tạo nội dung mặc định: 1 câu Ngữ pháp/Từ vựng, 1 đoạn nghe (tối đa 2 lượt nghe, chưa có audio) và 1 ngưỡng điểm CEFR (0-2 → A1, khóa `ielts-foundation`). | ✅ | apps/web/src/routes/_auth/placement-test/index.tsx:60-102 |
| FR-06 | GV soạn Phần 1 "Vocab + Grammar": mỗi câu có phân loại (grammar/vocab), cấp độ A1-C2, nội dung ≤1000 ký tự, đúng 4 đáp án ≤300 ký tự, một đáp án đúng, mã câu duy nhất. | ✅ | packages/api/src/placement-test-contracts.ts:19-52,225-283 |
| FR-07 | GV soạn Phần 2 "Listening": mỗi đoạn nghe có tiêu đề ≤200 ký tự, cấp độ, số lần nghe tối đa 1-5 (mặc định 2), file audio và 1-20 câu hỏi cùng cấu trúc 4 đáp án. | ✅ | packages/api/src/placement-test-contracts.ts:81-91; apps/web/src/components/placement-test/clip-card.tsx:124-225 |
| FR-08 | GV khai bảng quy đổi điểm → mức CEFR (≤20 ký tự) → khóa học đề xuất; số ngưỡng tối đa 8; có tổng số câu hiển thị để căn ngưỡng. | ✅ | apps/web/src/components/placement-test/bands-editor.tsx:47-130 |
| FR-09 | Tổng số câu hỏi toàn bài (Phần 1 + các câu trong các đoạn nghe) không vượt quá 100 câu; vượt quá sẽ bị chặn khi lưu với thông báo "Tổng số câu hỏi không được vượt quá 100 câu." | ✅ | packages/api/src/placement-test-contracts.ts:117-136 |
| FR-10 | "Lưu nháp" gửi toàn bộ nội dung kèm số hiệu `revision` đến API lưu nháp; lần đầu (revision 0) tạo mới, các lần sau cập nhật có điều kiện; thành công tăng revision lên 1 và hiện "Đã lưu bản nháp.". | ✅ | apps/server/src/routes/placement-test.ts:241-268; apps/web/src/routes/_auth/placement-test/index.tsx:250 |
| FR-11 | Khi hai nơi cùng lưu một revision, request sau nhận lỗi 409 `PLACEMENT_REVISION_CONFLICT`; màn soạn hiện banner "Đề đã được sửa ở tab khác, tải lại để tiếp tục" và bắt GV tải lại trạng thái mới nhất. | ✅ | apps/server/src/routes/placement-test.ts:231-239,259-267; apps/web/src/routes/_auth/placement-test/index.tsx:217-224,257-261 |
| FR-12 | Cảnh báo khi rời trang còn thay đổi chưa lưu: hộp thoại xác nhận với nội dung "Còn thay đổi chưa lưu nháp. Rời trang bây giờ sẽ mất các thay đổi này — tiếp tục?" và chặn đóng tab bằng sự kiện beforeunload. | ✅ | apps/web/src/routes/_auth/placement-test/index.tsx:194-211 |
| FR-13 | GV tải file audio cho đoạn nghe: kiểm tra định dạng và dung lượng ngay trên trình duyệt (tối đa 20 MB, các định dạng mp3/m4a/aac/wav/webm/ogg), tải lên bằng PUT kèm tiến trình, trả về mã audio dùng cho đoạn nghe. | ✅ | apps/web/src/components/placement-test/clip-audio-field.tsx:60-110; apps/web/src/lib/repos/placement-test.ts:114-204; apps/server/src/routes/placement-test.ts:285-361 |
| FR-14 | Server kiểm tra audio tải lên: Content-Length phải hợp lệ và không vượt 20 MB (413 `AUDIO_TOO_LARGE`), kiểu MIME phải thuộc danh sách được phép (415 `UNSUPPORTED_AUDIO_TYPE`), tên file được làm sạch (400 `INVALID_AUDIO`); lỗi không khớp dung lượng thực nhận 400. | ✅ | apps/server/src/routes/placement-test.ts:285-338 |
| FR-15 | Audio lưu vào kho đối tượng theo khóa `placement/<mã tổ chức>/<audioId>` cùng một dòng metadata trong bảng audio; nếu lưu DB thất bại thì đối tượng vừa tạo bị hủy để không rác. | ✅ | apps/server/src/routes/placement-test.ts:322-354; packages/db/src/schema/placement-test.ts:35-51 |
| FR-16 | GV nghe thử audio ngay trên màn soạn qua URL blob tạo từ nội dung audio đã tải; trình phát nghe thử có nhãn riêng cho từng đoạn. | ✅ | apps/web/src/lib/repos/placement-test.ts:206-237; apps/e2e/specs/placement-test-editor.spec.ts:222-230 |
| FR-17 | Nút "Phát hành" chạy tự động lưu nháp trước, rồi kiểm tra hợp lệ ngay trên trình duyệt; còn lỗi thì chặn với thông báo "Chưa thể phát hành: còn N lỗi cần kiểm tra." và cuộn tới lỗi đầu tiên. | ✅ | apps/web/src/routes/_auth/placement-test/index.tsx:271-293,104-126 |
| FR-18 | Trước khi phát hành thật, hiện hộp thoại "Xác nhận phát hành bộ đề (vN)" cảnh báo đề mới có hiệu lực ngay trên trang /kiem-tra-dau-vao/ và học viên đang làm dở bản cũ sẽ phải làm lại từ đầu khi tải lại trang. | ✅ | apps/web/src/components/placement-test/publish-dialog.tsx:31-66 |
| FR-19 | Phát hành thành công: server kiểm tra lại toàn bộ nội dung, tạo bản chụp (snapshot) bất biến với số phiên bản tăng dần, ghi thời điểm và người phát hành; response trả `{publishedVersion, publishedAt, revision, dirty:false}`; giao diện hiện "Đã phát hành bộ đề vN.". | ✅ | apps/server/src/routes/placement-test.ts:452-532; apps/web/src/routes/_auth/placement-test/index.tsx:295-332 |
| FR-20 | Nội dung nháp phải đạt các điều kiện phát hành: Phần 1 có ≥1 câu ("Phần 1 (Vocab + Grammar) phải có ít nhất 1 câu hỏi."), Phần 2 có ≥1 đoạn nghe ("Phần 2 (Listening) phải có ít nhất 1 đoạn nghe."), mỗi đoạn có audio ("Đoạn nghe chưa có file âm thanh.") và ≥1 câu, mỗi câu có đáp án đúng và các đáp án không trùng/để trống. | ✅ | packages/api/src/placement-test-contracts.ts:254-360 |
| FR-21 | Bảng ngưỡng khi phát hành phải có ≥1 ngưỡng ("Phải có ít nhất 1 ngưỡng điểm CEFR."), ngưỡng đầu bắt đầu từ 0, các ngưỡng liền nhau không chồng lấn hay hở khoảng, khóa gợi ý thuộc danh mục hợp lệ, và ngưỡng cuối kết thúc đúng bằng tổng số câu. | ✅ | packages/api/src/placement-test-contracts.ts:381-442 |
| FR-22 | Nháp hỏng định dạng khi phát hành trả 422 `PLACEMENT_INVALID` với vấn đề `parts` và thông điệp "Bản nháp không đúng định dạng."; gắn audio của tổ chức khác trả 422 với vấn đề tại `parts.1.clips.N.audioId` "File âm thanh không tồn tại hoặc không thuộc tổ chức này.". | ✅ | apps/server/src/routes/placement-test.ts:438-479 |
| FR-23 | Phát hành không hợp lệ kèm CAS sai revision trả 409 `PLACEMENT_REVISION_CONFLICT`; sau phát hành thành công, audio không còn được tham chiếu (và cũ quá 24 giờ) bị dọn khỏi kho và bảng metadata trong nền. | ✅ | apps/server/src/routes/placement-test.ts:33-34,53-107,508-525 |
| FR-24 | Lưu nháp sau khi đã phát hành không ảnh hưởng bản công khai; trạng thái soạn báo "có thay đổi chưa phát hành" (dirty). | ✅ | apps/server/src/routes/placement-test.ts:159-167; apps/server/src/routes/placement-test.test.ts:328-397 |
| FR-25 | Trang công khai trả trạng thái 503 `PLACEMENT_DISABLED` khi tổ chức lead chưa cấu hình, 404 `PLACEMENT_NOT_PUBLISHED` khi chưa phát hành, và 200 kèm snapshot + `Cache-Control: no-cache` khi đã phát hành. | ✅ | apps/server/src/routes/public-placement-test.ts:39-68 |
| FR-26 | Snapshot công khai chứa: số phiên bản, hai phần với đầy đủ câu hỏi và đáp án đúng, các đoạn nghe kèm số lượt nghe tối đa và URL audio dạng `/public/placement-test/audio/<audioId>`, và bảng ngưỡng CEFR. | ✅ | packages/api/src/placement-test-contracts.ts:447-514 |
| FR-27 | API audio công khai chỉ phục vụ audio thuộc tổ chức lead: 503 `PLACEMENT_AUDIO_DISABLED` khi thiếu cấu hình, 404 `not found` khi không thuộc tổ chức lead; hỗ trợ HTTP Range nên trả 200 đầy đủ hoặc 206 một phần hoặc 416 với `Content-Range: bytes */total` khi khoảng không hợp lệ. | ✅ | apps/server/src/routes/public-placement-test.ts:70-171 |
| FR-28 | Audio công khai được cache dài hạn: `Cache-Control: public, max-age=31536000, immutable`, kèm `Accept-Ranges: bytes`, `X-Content-Type-Options: nosniff` và CSP `default-src 'none'; sandbox`. | ✅ | apps/server/src/routes/public-placement-test.ts:107-170 |
| FR-29 | API riêng tư đọc audio của chính tổ chức gắn header `Cross-Origin-Resource-Policy: same-site` để trang profile cùng site phát được; tổ chức khác đọc audio này nhận 404. | ✅ | apps/server/src/routes/placement-test.ts:364-405; apps/server/src/app.ts:325-328 |
| FR-30 | Trang học viên `/kiem-tra-dau-vao/` là trang tĩnh không phụ thuộc framework: nạp đề công khai khi mở, và khi API lỗi hoặc chưa phát hành thì hiện "Bài kiểm tra đang bảo trì" mà KHÔNG xóa bài làm dở đã lưu trong trình duyệt. | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:316-350; apps/e2e/specs/placement-test-editor.spec.ts:74-97,261-283 |
| FR-31 | Đề phiên bản mới hơn bài đang làm dở sẽ đặt lại bài làm từ bước đầu nhưng giữ thông tin học viên đã điền; người làm thấy gợi ý "Tiếp Tục Bài Đang Làm →" hoặc "Làm Lại Từ Đầu". | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:175-238,529-541 |
| FR-32 | Trước khi vào bài, học viên điền form thông tin: họ tên, SĐT Việt Nam đúng định dạng 10 số bắt đầu bằng 0, email (bắt buộc khi nguồn là placement-test), ngày sinh hợp lệ, mục tiêu/study mode; kèm ô nhả mật (honeypot) ẩn và đo thời gian ở lại trang tối thiểu 3500 ms để chống bot. | ✅ | apps/profile/public/kiem-tra-dau-vao/lead-gate.js:8-12,64-191,206-248 |
| FR-33 | Form thông tin gửi đến API lead công khai với nguồn cố định "placement-test"; thành công (200/201) mới cho vào Phần 1; lỗi hiển thị theo mã: tần suất "Có quá nhiều lượt đăng ký...", trần ngày, dữ liệu chưa hợp lệ, hoặc lỗi máy chủ với hướng thử lại. | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:604-1129; apps/server/src/routes/public-leads.ts:292-328 |
| FR-34 | API lead công khai giới hạn theo IP và theo SĐT: quá tần suất trả 429 `LEAD_RATE_LIMITED`, vượt trần 100 lead/ngày trả 429 `LEAD_DAILY_CAP`; trùng SĐT trong cửa sổ dedupe cập nhật lead cũ thay vì tạo mới. | ✅ | apps/server/src/routes/public-leads.ts:23-36,292-328 |
| FR-35 | Khi vào bài, đề được chia đúng 2 phần: Phần 1 Vocab + Grammar và Phần 2 Listening; học viên trả lời từng câu bằng chọn 1 trong 4 đáp án; tiến trình trả lời hiển thị "Đã trả lời: X/Y câu". | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:1139-1470; apps/e2e/specs/placement-test-editor.spec.ts:206-208 |
| FR-36 | Bài làm dở được tự lưu vào trình duyệt (khóa `msmy_placement_attempt_v1`) sau mỗi lựa chọn; tải lại trang tiếp tục đúng bước và câu đã chọn. | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:17,145-238 |
| FR-37 | Audio đoạn nghe của học viên bị giới hạn lượt nghe bằng `maxPlays`: bấm phát trừ 1 lượt; lỗi tải audio hoàn lượt và không cộng lượt; hết lượt thì vô hiệu nút phát với nhãn "Đã hết lượt nghe"; nhãn còn lại dạng "Còn X/Y lượt nghe". | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:1275-1337; apps/e2e/specs/profile-placement-test.spec.ts:535-663 |
| FR-38 | Khi phát audio, vị trí phát luôn reset về 0 khi kết thúc/tạm dừng để không tua lại nội dung đã nghe; kiểm soát phát chỉ còn play/pause. | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:1345-1349; apps/e2e/specs/profile-placement-test.spec.ts:535-663 |
| FR-39 | Trước khi nộp, nếu còn câu chưa chọn, hiện xác nhận đếm số câu bỏ trống: "Bạn còn X/Y câu chưa chọn đáp án. Câu bỏ trống sẽ được tính là 0 điểm. Bạn có chắc chắn muốn nộp bài ngay?" với hai nút "Vẫn Nộp Bài Ngay" / "Quay Lại Làm Tiếp". | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:1422-1465 |
| FR-40 | Nộp bài chấm ngay trên trình duyệt: mỗi câu trúng đáp án được 1 điểm, bỏ trống 0 điểm; tổng điểm so vào bảng ngưỡng để chọn mức CEFR và khóa học gợi ý; không có ngưỡng khớp thì dùng ngưỡng đầu tiên trong bảng; nếu bảng rỗng thì dùng mặc định A1 / ielts-foundation. | ✅ | apps/profile/public/kiem-tra-dau-vao/grading.js:49-110 |
| FR-41 | Màn kết quả hiện "Kết Quả Đánh Giá Trình Độ & Lộ Trình Gợi Ý", trình độ CEFR ước tính, khóa học gợi ý tham khảo, ghi chú "Đáp án chi tiết được bảo mật để cô Thục Mỹ trực tiếp phân tích lỗ hổng tư duy và chữa bài 1-1 cùng bạn." và nút "Đăng Ký Theo Kết Quả Này" dẫn tới trang đăng ký. | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:1472-1644 |
| FR-42 | Kết quả được đồng bộ ngược vào lead đã tạo: tổng điểm/tổng câu, số đúng từng phần và nhãn CEFR (tối đa 300 ký tự) được ghi vào lead bằng request keepalive; trỏ vào lead cũ khi học viên đã tồn tại. | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:1483-1519; apps/profile/public/kiem-tra-dau-vao/grading.js:119-131 |
| FR-43 | Sau kết quả, học viên có "🔄 Làm Lại" (xóa bài, giữ thông tin học viên đã đăng ký và về trang giới thiệu), và phần khám phá thang CEFR/IELTS độc lập với bài làm; nút "Không phải bạn? Đổi thông tin" nằm ở bước thông tin, không ở màn kết quả. | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:1603-1639,1677-1826,299 |
| FR-44 | Học viên thấy bản nhận diện: tiêu đề trang "Bài Kiểm Tra Đầu Vào (CEFR & IELTS) | Cô Đỗ Thục Mỹ", meta trỏ API lead, chân trang với Zalo 0929.060.994. | ✅ | apps/profile/public/kiem-tra-dau-vao/index.html:1-58 |
| FR-45 | Màn soạn hiển thị trạng thái: tiêu đề "Bài test đầu vào", huy hiệu "Có thay đổi chưa phát hành"/"Có thay đổi chưa lưu", nhãn "Chưa phát hành" hoặc "Đã phát hành vN lúc ...", và tổng số câu. | ✅ | apps/web/src/routes/_auth/placement-test/index.tsx:417-474; apps/web/src/components/placement-test/bands-editor.tsx:44-51 |
| FR-46 | Khi tổ chức hiện tại không phải tổ chức lead, màn soạn hiện cảnh báo "Lưu ý cấu hình tổ chức:" kèm mã tổ chức lead và đường dẫn trang công khai, giải thích đề của tổ chức này không hiện trên trang học viên. | ✅ | apps/web/src/routes/_auth/placement-test/index.tsx:476-490 |
| FR-47 | Người dùng chưa đăng nhập gọi API riêng tư nhận 401; GV không đủ quyền nhận 403; request ghi từ origin lạ nhận 403 (kiểm tra Origin tường minh vì cookie SameSite=None). | ✅ | apps/server/src/routes/placement-test.ts:121-132; apps/server/src/routes/kernel.ts:190-195; apps/server/src/routes/placement-test.test.ts:238-267 |
| FR-48 | API riêng tư không cho phép trình duyệt cache: GET trạng thái gắn `Cache-Control: no-store`. | ✅ | apps/server/src/routes/placement-test.ts:179 |
| FR-49 | Trần kích thước và số lượng khi lưu: thân nháp tối đa 256 KB (lỗi 413 `PAYLOAD_TOO_LARGE`), tổng 100 câu, tối đa 20 đoạn nghe, mỗi đoạn 20 câu, tối đa 8 ngưỡng; audio tối đa 20 MB. | ✅ | packages/api/src/placement-test-contracts.ts:19-30; apps/server/src/routes/placement-test.ts:190-199,293-295 |
| FR-50 | Đáp án đúng trong snapshot công khai: câu chưa chọn đáp án được chuẩn hóa thành chỉ số 0 để trang học viên luôn chấm được; clip trỏ `src` về audio public. | ✅ | packages/api/src/placement-test-contracts.ts:481-514 |

## 4. Yêu cầu phi chức năng (NFR)

| Mã | Yêu cầu | Nhãn | Nguồn (path:line) |
|----|---------|------|-------------------|
| NFR-01 | Tách thẩm quyền hai lớp: API soạn đề đi qua kernel (đăng nhập + kiểm tra vai trò tài chính + kiểm tra Origin); API công khai nằm ngoài `/api/*` với CORS giới hạn origin profile và không dùng credential. | ✅ | apps/server/src/app.ts:399-405,428-429; apps/server/src/routes/public-placement-test.ts:19-37 |
| NFR-02 | Dữ liệu tách theo tổ chức: mọi dòng đề/audio gắn mã tổ chức, mọi truy vấn lọc theo tổ chức phiên đăng nhập; xuất ôn nhau giữa hai tổ chức bị từ chối khi phát hành (422). | ✅ | packages/db/src/schema/placement-test.ts:13-51; apps/server/src/routes/placement-test.ts:454-468 |
| NFR-03 | Xử lý đồng thời kiểu CAS trên `revision`: không dùng khóa, hai lần lưu trùng revision thì request sau nhận 409, tránh ghi đè lẫn nhau giữa nhiều tab. | ✅ | packages/db/src/schema/placement-test.ts:5-12; apps/server/src/routes/placement-test.ts:231-267 |
| NFR-04 | Trang học viên không phụ thuộc framework/build (HTML + JS thuần), có thể host tĩnh; media nghe được trên Safari iOS nhờ hỗ trợ HTTP Range/206. | ✅ | apps/profile/public/kiem-tra-dau-vao/index.html:1-58; apps/server/src/routes/public-placement-test.ts:19-24 |
| NFR-05 | Bản đã phát hành bất biến và định danh bằng số phiên bản tăng dần; snapshot build bằng allowlist trường nên không rò trường nội bộ. | ✅ | packages/db/src/schema/placement-test.ts:18-19; packages/api/src/placement-test-contracts.ts:447-514 |
| NFR-06 | Không lưu PII trong feature này ngoài lead của feature leads; trang công khai không có cookie/đăng nhập; IP lead chỉ lưu dạng băm. | ✅ | packages/db/src/migrations/0057_exotic_vulture.sql:17; apps/server/src/routes/public-placement-test.ts:19-24 |
| NFR-07 | Giao diện soạn đề đáp ứng desktop/tablet/mobile không tràn ngang và có dark mode (kiểm tra e2e 3 viewport + dark). | ✅ | apps/e2e/specs/placement-test-editor.spec.ts:145-176 |
| NFR-08 | Âm thanh công khai cache dài hạn bất biến (1 năm) vì nội dung gắn `audioId` ngẫu nhiên không bao giờ đổi; đề công khai luôn no-cache để đổi đề tức thì. | ✅ | apps/server/src/routes/public-placement-test.ts:61-67,145-151 |

## 5. Quy tắc nghiệp vụ (BR)

| Mã | Quy tắc | Nhãn | Nguồn (path:line) |
|----|---------|------|-------------------|
| BR-01 | Một tổ chức chỉ có đúng một bộ đề kiểm tra đầu vào (khóa chính là mã tổ chức). | ✅ | packages/db/src/schema/placement-test.ts:13-27 |
| BR-02 | Bản nháp và bản phát hành tồn tại song song; bản công khai chỉ thay đổi khi phát hành; lưu nháp sau phát hành bật lại cờ dirty. | ✅ | packages/db/src/schema/placement-test.ts:5-27; apps/server/src/routes/placement-test.ts:159-163 |
| BR-03 | Chỉ vai trò teacher/owner/admin của tổ chức được soạn và phát hành; ta/class_teacher bị chặn. | ✅ | packages/auth/src/role.ts:75-85; apps/server/src/routes/placement-test.ts:121-132 |
| BR-04 | Trang công khai chỉ phục vụ đúng một tổ chức lead cấu hình bằng `LEAD_ORG_ID`; thiếu cấu hình coi như tắt tính năng (503). | ✅ | apps/server/src/routes/public-placement-test.ts:39-46; apps/web/src/routes/_auth/placement-test/index.tsx:164-167,476-490 |
| BR-05 | Mỗi phát hành tạo phiên bản mới (bắt đầu từ 1) và không thể quay về phiên bản cũ qua API (không có endpoint unpublish/rollback). | ✅ | apps/server/src/routes/placement-test.ts:481-506; reverse-gaps.md Negative-search N-04 |
| BR-06 | Audio là tài nguyên tổ chức: gắn audio tổ chức khác vào đề bị từ chối khi phát hành; dọn rác chỉ xóa audio không còn tham chiếu và cũ hơn 24 giờ. | ✅ | apps/server/src/routes/placement-test.ts:33-34,53-107,454-468 |
| BR-07 | Đề hợp lệ khi phát hành phải đủ: Phần 1 ≥1 câu, Phần 2 ≥1 đoạn nghe có audio và ≥1 câu mỗi đoạn, mỗi câu 4 đáp án phân biệt có đúng 1 đáp án, bảng ngưỡng phủ kín 0..tổng câu không chồng lấn, khóa gợi ý thuộc danh mục lead. | ✅ | packages/api/src/placement-test-contracts.ts:285-445 |
| BR-08 | Thang điểm chỉ đếm số câu đúng (mỗi câu 1 điểm, không trừ điểm sai); bỏ trống tính 0 điểm. | ✅ | apps/profile/public/kiem-tra-dau-vao/grading.js:49-110 |
| BR-09 | Học viên phải để lại thông tin hợp lệ (tên, SĐT VN, email) trước khi làm bài; thông tin này tạo/cập nhật lead với nguồn "placement-test". | ✅ | apps/profile/public/kiem-tra-dau-vao/lead-gate.js:132-248 |
| BR-10 | Số lượt nghe tối đa mỗi đoạn do GV đặt (1-5, mặc định 2) và được thi hành phía trình duyệt học viên; lỗi tải audio không trừ lượt. | ✅ | packages/api/src/placement-test-contracts.ts:81-91; apps/profile/public/kiem-tra-dau-vao/test.js:1302-1337 |
| BR-11 | Chống bot cổng thông tin: honeypot ẩn, chặn gửi quá nhanh (thời gian ở trang < 3000 ms ở server; client tự đặt sàn 3500 ms), giới hạn tần suất theo IP và trần/ngày ở server. | ✅ | apps/profile/public/kiem-tra-dau-vao/lead-gate.js:8-12,206-248; apps/server/src/routes/public-leads.ts:23-36 |
| BR-12 | Bài làm dở lưu cục bộ theo phiên bản đề; đổi phiên bản đề thì làm lại từ đầu nhưng giữ thông tin cá nhân; khi API lỗi thì KHÔNG xóa bài dở. | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:145-238,316-350 |
| BR-13 | Kết quả chấm và nhãn CEFR được ghi ngược vào lead để GV liên hệ kèm ngữ cảnh; nội dung ghi tối đa 300 ký tự. | ✅ | apps/profile/public/kiem-tra-dau-vao/grading.js:119-131; packages/api/src/lead-contracts.ts:216-223 |
| BR-14 | Đáp án đúng được gửi kèm đề công khai (chấm phía client); chi tiết đáp án được che trên giao diện kết quả bằng thông điệp bảo mật, GV chữa trực tiếp. | ✅ | packages/api/src/placement-test-contracts.ts:447-514; apps/profile/public/kiem-tra-dau-vao/test.js:1538-1544 |
| BR-15 | GV soạn được cảnh báo khi tổ chức không phải tổ chức lead nhưng vẫn soạn/đọc được đề của tổ chức mình. | ✅ | apps/web/src/routes/_auth/placement-test/index.tsx:476-490 |

## 6. Ma trận lỗi (E-xx)

| Mã | Tình huống | HTTP / hiển thị | Nhãn | Nguồn (path:line) |
|----|-----------|-----------------|------|-------------------|
| E-01 | Gọi API riêng tư chưa đăng nhập | 401 `unauthorized` | ✅ | apps/server/src/routes/placement-test.ts:121-127 |
| E-02 | Vai trò ta/class_teacher gọi API soạn đề | 403 `placement-forbidden` | ✅ | apps/server/src/routes/placement-test.ts:127-132; apps/server/src/routes/placement-test.test.ts:238-255 |
| E-03 | Request ghi với Origin lạ | 403 (kiểm tra Origin tường minh) | ✅ | apps/server/src/routes/kernel.ts:190-195; apps/server/src/routes/placement-test.test.ts:257-266 |
| E-04 | Lưu nháp trùng revision (cả revision 0 lặp) | 409 `PLACEMENT_REVISION_CONFLICT` | ✅ | apps/server/src/routes/placement-test.ts:231-239,259-267 |
| E-05 | Phát hành với revision cũ | 409 `PLACEMENT_REVISION_CONFLICT` | ✅ | apps/server/src/routes/placement-test.ts:423-436,508-516 |
| E-06 | Thân nháp JSON sai kiểu/content-type | 415 "content-type must be application/json" | ✅ | apps/server/src/routes/placement-test.ts:186-188 |
| E-07 | Thân nháp vượt 256 KB | 413 `PAYLOAD_TOO_LARGE` | ✅ | apps/server/src/routes/placement-test.ts:190-199 |
| E-08 | JSON nháp sai cấu trúc Zod | 400 "invalid body" | ✅ | apps/server/src/routes/placement-test.ts:201-211 |
| E-09 | Nháp không parse được lúc phát hành | 422 `PLACEMENT_INVALID` + issue "Bản nháp không đúng định dạng." | ✅ | apps/server/src/routes/placement-test.ts:438-450 |
| E-10 | Phần 1 trống câu hỏi | 422 issue "Phần 1 (Vocab + Grammar) phải có ít nhất 1 câu hỏi." | ✅ | packages/api/src/placement-test-contracts.ts:299-304 |
| E-11 | Phần 2 không có đoạn nghe | 422 issue "Phần 2 (Listening) phải có ít nhất 1 đoạn nghe." | ✅ | packages/api/src/placement-test-contracts.ts:315-320 |
| E-12 | Đoạn nghe thiếu audio | 422 issue "Đoạn nghe chưa có file âm thanh." | ✅ | packages/api/src/placement-test-contracts.ts:334-339 |
| E-13 | Đoạn nghe không có câu hỏi | 422 issue "Mỗi đoạn nghe phải có ít nhất 1 câu hỏi." | ✅ | packages/api/src/placement-test-contracts.ts:355-360 |
| E-14 | Đáp án A bỏ trống / đáp án trùng nhau / thiếu đáp án đúng | 422 issues "Đáp án A không được để trống." / "Các đáp án trong cùng một câu không được trùng nhau." / "Chưa chọn đáp án đúng." | ✅ | packages/api/src/placement-test-contracts.ts:254-282 |
| E-15 | Mã câu hỏi trùng nhau hoặc mã đoạn nghe trùng nhau | 422 issue `Mã câu hỏi "<id>" bị trùng.` / `Mã đoạn nghe "<id>" bị trùng.` | ✅ | packages/api/src/placement-test-contracts.ts:234,328 |
| E-16 | Không có ngưỡng CEFR | 422 issue "Phải có ít nhất 1 ngưỡng điểm CEFR." | ✅ | packages/api/src/placement-test-contracts.ts:381-387 |
| E-17 | Khóa gợi ý ngoài danh mục | 422 issue "Khóa học gợi ý không thuộc danh mục hợp lệ." | ✅ | packages/api/src/placement-test-contracts.ts:397-402 |
| E-18 | Ngưỡng đầu ≠ 0 / chồng lấn / hở khoảng / cuối ≠ tổng câu | 422 issues "Ngưỡng điểm đầu tiên phải bắt đầu từ 0." / "Ngưỡng thứ N bị chồng lấn với ngưỡng thứ M." / "Ngưỡng thứ N bị hở khoảng điểm so với ngưỡng thứ M." / "Ngưỡng cuối cùng phải kết thúc đúng bằng tổng số câu (N)." | ✅ | packages/api/src/placement-test-contracts.ts:411-442 |
| E-19 | Gắn audio tổ chức khác rồi phát hành | 422 issue `parts.1.clips.N.audioId` "File âm thanh không tồn tại hoặc không thuộc tổ chức này." | ✅ | apps/server/src/routes/placement-test.ts:454-468; apps/server/src/routes/placement-test.test.ts:422-449 |
| E-20 | Tổng câu vượt 100 (client chặn trước khi lưu) | toast "Chưa thể phát hành: còn N lỗi cần kiểm tra." + banner lỗi | ✅ | packages/api/src/placement-test-contracts.ts:117-136; apps/web/src/routes/_auth/placement-test/index.tsx:280-288 |
| E-21 | Audio: thiếu/không hợp lệ Content-Length, tên file xấu, body rỗng | 400 `INVALID_AUDIO` | ✅ | apps/server/src/routes/placement-test.ts:285-320 |
| E-22 | Audio vượt 20 MB (client và server) | client toast "Dung lượng file âm thanh không được vượt quá 20 MB."; server 413 `AUDIO_TOO_LARGE` | ✅ | apps/web/src/components/placement-test/clip-audio-field.tsx:72-75; apps/server/src/routes/placement-test.ts:293-295 |
| E-23 | Audio sai định dạng MIME | client toast "Định dạng file âm thanh không được hỗ trợ."; server 415 `UNSUPPORTED_AUDIO_TYPE` | ✅ | apps/web/src/components/placement-test/clip-audio-field.tsx:68-71; apps/server/src/routes/placement-test.ts:297-303 |
| E-24 | Dung lượng thực khác Content-Length | 400 `INVALID_AUDIO` + hủy đối tượng đã tạo | ✅ | apps/server/src/routes/placement-test.ts:329-338 |
| E-25 | Audio public khi tắt tính năng / sai tổ chức | 503 `PLACEMENT_AUDIO_DISABLED` / 404 `not found` | ✅ | apps/server/src/routes/public-placement-test.ts:79-104 |
| E-26 | Range ngoài biên audio | 416 + `Content-Range: bytes */total` | ✅ | apps/server/src/routes/public-placement-test.ts:107-128; apps/server/src/lib/byte-range.ts:9-42 |
| E-27 | Trang công khai khi tắt tính năng / chưa phát hành | 503 `PLACEMENT_DISABLED` / 404 `PLACEMENT_NOT_PUBLISHED` | ✅ | apps/server/src/routes/public-placement-test.ts:39-59 |
| E-28 | API đề/audio lỗi trên trang học viên | "Bài kiểm tra đang bảo trì", giữ nguyên bài dở trong localStorage | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:316-350; apps/e2e/specs/placement-test-editor.spec.ts:261-283 |
| E-29 | Lỗi tải audio học viên | hoàn lượt nghe + "Không tải được âm thanh – không bị trừ lượt nghe. Vui lòng thử lại." | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:1318-1337 |
| E-30 | Lưu nháp 409 trên màn soạn | banner xung đột "Đề đã được sửa ở tab khác, tải lại để tiếp tục" + nút tải lại | ✅ | apps/web/src/routes/_auth/placement-test/index.tsx:217-224,257-261,492-507 |
| E-31 | Phát hành bị server từ chối 422 | toast "Phát hành bị từ chối (N lỗi nội dung)." + banner liệt kê lỗi | ✅ | apps/web/src/routes/_auth/placement-test/index.tsx:318-325,509-524 |
| E-32 | Form lead: SĐT sai định dạng / ngày sinh sai / tên-thiếu | thông báo lỗi trường "Thông tin chưa hợp lệ..." theo trường | ✅ | apps/profile/public/kiem-tra-dau-vao/lead-gate.js:81-191 |
| E-33 | Form lead bị honeypot / gửi quá nhanh (<3000 ms ở server; client tự đặt sàn 3500 ms) | 201 giả, không ghi DB | ✅ | apps/server/src/routes/public-leads.ts:23-36; apps/profile/public/kiem-tra-dau-vao/lead-gate.js:206-248 |
| E-34 | Lead vượt tần suất IP / trần ngày | 429 `LEAD_RATE_LIMITED` / 429 `LEAD_DAILY_CAP` → "Có quá nhiều lượt đăng ký..." | ✅ | apps/server/src/routes/public-leads.ts:292-328; apps/profile/public/kiem-tra-dau-vao/lead-gate.js:255-284 |
| E-35 | API lead lỗi máy chủ (5xx) | "Hệ thống đang bận, chưa thể lưu thông tin của bạn..." + hướng thử lại | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:1064-1086; apps/profile/public/kiem-tra-dau-vao/lead-gate.js:255-284 |
| E-36 | Nhập đề gốc lỗi mạng/HTTP | "Không tải được đề gốc (HTTP ...)" và giữ trạng thái rỗng | ✅ | apps/web/src/routes/_auth/placement-test/index.tsx:334-415 |
| E-37 | Tải trạng thái đề lỗi | thẻ lỗi "Không thể tải bộ đề kiểm tra đầu vào (N)" (không có nút thử lại; tải lại trang để thử lại) | ✅ | apps/web/src/lib/repos/placement-test.ts:66-83; apps/web/src/routes/_auth/placement-test/index.tsx:526-542 |
| E-38 | Nghe thử audio lỗi | "Không thể tải audio nghe thử (N)" / "Định dạng audio không hợp lệ." | ✅ | apps/web/src/lib/repos/placement-test.ts:206-237 |

## 7. Thước đo (SM)

| Mã | Thước đo | Nhãn | Nguồn (path:line) |
|----|----------|------|-------------------|
| SM-01 | Số câu tối đa toàn bài: 100 | ✅ | packages/api/src/placement-test-contracts.ts:25 |
| SM-02 | Số đoạn nghe tối đa: 20; số câu mỗi đoạn: 20 | ✅ | packages/api/src/placement-test-contracts.ts:26-27 |
| SM-03 | Số ngưỡng CEFR tối đa: 8 | ✅ | packages/api/src/placement-test-contracts.ts:28 |
| SM-04 | Dung lượng audio tối đa: 20 MB (20 * 1024 * 1024 byte) | ✅ | packages/api/src/placement-test-contracts.ts:29 |
| SM-05 | Thân nháp tối đa: 256 KB | ✅ | packages/api/src/placement-test-contracts.ts:30 |
| SM-06 | Giới hạn độ dài: nội dung câu 1000, đáp án 300, tiêu đề đoạn 200, cấp độ 20, nhãn CEFR 20 | ✅ | packages/api/src/placement-test-contracts.ts:20-24 |
| SM-07 | Số lượt nghe mỗi đoạn: 1-5, mặc định 2 | ✅ | packages/api/src/placement-test-contracts.ts:81-91 |
| SM-08 | Thời gian tối thiểu ở cổng thông tin: 3500 ms (chống bot) | ✅ | apps/profile/public/kiem-tra-dau-vao/lead-gate.js:8-12 |
| SM-09 | Audio mồ côi bị dọn sau 24 giờ kể từ khi tạo | ✅ | apps/server/src/routes/placement-test.ts:33-34 |
| SM-10 | Cache audio công khai 31536000 giây (1 năm, immutable) | ✅ | apps/server/src/routes/public-placement-test.ts:145-151 |
| SM-11 | Lead giới hạn: 3 lượt/IP/10 phút, 100 lead/ngày (mã 429) | ✅ | apps/server/src/routes/public-leads.ts:23-36 |
| SM-12 | Bộ đề gốc mẫu: 30 câu, 5 đoạn nghe, 5 file mp3 | ✅ | apps/web/src/routes/_auth/placement-test/index.tsx:398; apps/web/public/placement-seed/clip-1.mp3 |
| SM-13 | R1: 26 test active thuộc feature trong 7 file (5+3+4+3+7+1+3), 0 skip/only/todo; thêm 1 test biên liên quan trong lead-catalog-drift.test.ts | ✅ | reverse-sources.md S36-S42; _evidence.md mục R1 |

## 8. Thực thể dữ liệu

Chi tiết cột + chỉ mục ở `srs/placement-test-reverse-erd.md`.

- `placement_test` — đề của một tổ chức: bản nháp, bản phát hành (snapshot), revision CAS, publishedRevision, publishedVersion, publishedAt, publishedBy, updatedAt. ✅ packages/db/src/schema/placement-test.ts:13-27
- `placement_test_audio` — metadata audio của tổ chức: id ngẫu nhiên, orgId, objectKey trong kho đối tượng, tên, kiểu MIME, dung lượng, createdAt; đánh chỉ mục theo orgId. ✅ packages/db/src/schema/placement-test.ts:35-51
- `organization` — chủ sở hữu bộ đề; khóa `orgId` tham chiếu bảng này (xóa tổ chức thì xóa đề/audio theo cascade). ✅ packages/db/src/schema/placement-test.ts:14-16,36-38
- `lead` (biên giới tính năng leads) — học viên để lại thông tin; các cột do feature này sử dụng: `source` mặc định 'profile', `placement` (tóm tắt kết quả ≤300), `submit_count`, `ip_hash`. ✅ packages/db/src/migrations/0057_exotic_vulture.sql:13-18
- Bộ đề gốc mẫu: `questions.json` + 5 mp3 trong `apps/web/public/placement-seed/`. ✅ apps/web/src/routes/_auth/placement-test/index.tsx:334-375

## 9. Luồng chính

Đồ thị chi tiết kèm mermaid ở `srs/placement-test-reverse-flows.md`; sơ đồ trạng thái ở `srs/placement-test-reverse-states.md`.

| Luồng | Tóm tắt | Nhãn |
|-------|---------|------|
| F1 | GV nạp màn soạn: điều hướng, kiểm tra quyền, tải trạng thái đề + audio, nhận trạng thái rỗng nếu chưa có nháp | ✅ |
| F2 | GV khởi tạo đề: nhập đề gốc (fetch seed + upload 5 mp3 + lưu nháp) hoặc tạo đề trống | ✅ |
| F3 | GV soạn và lưu nháp với CAS revision; xung đột 409 dẫn tới tải lại | ✅ |
| F4 | GV tải audio cho đoạn nghe: kiểm tra client → PUT kèm tiến trình → gắn audioId → nghe thử qua blob | ✅ |
| F5 | GV phát hành: tự lưu nháp → validate client → hộp thoại xác nhận → validate server + snapshot vN → dọn audio mồ côi | ✅ |
| F6 | Học viên mở trang công khai: nạp đề công khai (hoặc bảo trì) → cổng thông tin → tạo lead | ✅ |
| F7 | Học viên làm bài 2 phần: tự lưu cục bộ, giới hạn lượt nghe, xác nhận nộp khi còn câu trống | ✅ |
| F8 | Nộp bài: chấm client → màn kết quả → đồng bộ điểm vào lead → đăng ký/làm lại | ✅ |

## 10. Màn hình

| Màn hình | Thành phần chính | Nhãn | Nguồn (path:line) |
|----------|------------------|------|-------------------|
| MH-01 Màn soạn đề `/placement-test` | PageHead "Bài test đầu vào" + huy hiệu trạng thái; banner xung đột; banner lỗi phát hành; cảnh báo tổ chức lead | ✅ | apps/web/src/routes/_auth/placement-test/index.tsx:429-524 |
| MH-02 Trình soạn câu Phần 1 | thẻ câu: phân loại, cấp độ, nội dung, 4 đáp án, chọn đáp án đúng, xóa câu | ✅ | apps/web/src/components/placement-test/question-card.tsx:69-197 |
| MH-03 Trình soạn đoạn nghe | tiêu đề, cấp độ, số lượt nghe, trường audio, danh sách câu hỏi | ✅ | apps/web/src/components/placement-test/clip-card.tsx:124-225 |
| MH-04 Trường audio | nút "Tải audio lên"/"Thay audio"/"Nghe thử", trình phát xem trước, tên file, trạng thái "Chưa có file âm thanh" | ✅ | apps/web/src/components/placement-test/clip-audio-field.tsx:135-188 |
| MH-05 Bảng ngưỡng CEFR | "Ngưỡng điểm CEFR & Khóa học gợi ý", tổng số câu, thêm ngưỡng tới 8, các cột điểm tối thiểu/tối đa/CEFR/khóa đề xuất/xóa | ✅ | apps/web/src/components/placement-test/bands-editor.tsx:47-130 |
| MH-06 Hộp thoại phát hành | "Xác nhận phát hành bộ đề (vN)" + cảnh báo hiệu lực ngay + nút "Hủy"/"Xác nhận phát hành" | ✅ | apps/web/src/components/placement-test/publish-dialog.tsx:31-66 |
| MH-07 Trạng thái rỗng | "Chưa có bản nháp bộ đề kiểm tra đầu vào" + 2 nút khởi tạo | ✅ | apps/web/src/components/placement-test/seed-empty-state.tsx:17-55 |
| MH-08 Trang học viên `/kiem-tra-dau-vao/` | tiêu đề CEFR & IELTS, meta API, 5 bước: trang chủ → thông tin → Phần 1 → Phần 2 → kết quả | ✅ | apps/profile/public/kiem-tra-dau-vao/index.html:1-58; apps/profile/public/kiem-tra-dau-vao/test.js:52,352-384 |
| MH-09 Cổng thông tin | form thông tin học viên + chọn mục tiêu + honeypot + xác thực SĐT/ngày sinh | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:604-1129 |
| MH-10 Màn kết quả | CEFR ước tính, khóa gợi ý, thông điệp bảo mật đáp án, đăng ký, làm lại | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:1472-1644 |
| MH-11 Trạng thái bảo trì | "Bài kiểm tra đang bảo trì" khi chưa phát hành/API lỗi, không xóa bài dở | ✅ | apps/profile/public/kiem-tra-dau-vao/test.js:316-350 |

## 11. Ràng buộc

- RB-01: Feature gắn chặt một tổ chức lead duy nhất qua cấu hình `LEAD_ORG_ID` ở server; không có UI quản lý cấu hình này trong feature. ✅ apps/server/src/app.ts:90-96; apps/web/src/routes/_auth/placement-test/index.tsx:476-490
- RB-02: Trang học viên nằm ngoài app chính (host tĩnh riêng), liên lạc qua CORS + JSON; không thể dùng cookie phiên. ✅ apps/server/src/routes/public-placement-test.ts:28-37
- RB-03: Không i18n: mọi chuỗi người dùng viết trực tiếp trong nguồn tiếng Việt. ✅ reverse-gaps.md Negative-search N-06
- RB-04: Chấm điểm phía client là thiết kế chấp nhận (đáp án trong payload công khai); đã được ghi nhận như rủi ro nghiệp vụ trong plan #515 (D7) và giữ nguyên trong code. 🔵 packages/api/src/placement-test-contracts.ts:447-514; apps/profile/public/kiem-tra-dau-vao/grading.js:49-110; plans/261031-1242-515-placement-test-editor/plan.md
- RB-05: Giới hạn lượt nghe thi hành phía client (localStorage), không có cơ chế server xác thực lượt nghe. 🔵 apps/profile/public/kiem-tra-dau-vao/test.js:1302-1337; reverse-gaps.md OQ-05
- RB-06: Không rate-limit cho GET công khai của feature (khác với POST lead có rate-limit); chấp nhận theo plan #515 (non-goal). 🔵 reverse-gaps.md Negative-search N-02; plans/261031-1242-515-placement-test-editor/plan.md

## 12. Câu hỏi mở (OQ)

Tổng hợp đầy đủ tại `reverse-gaps.md` (10 OQ + negative-search + INF + GAP/CF). Tóm tắt: OQ-01 chính sách gỡ phát hành; OQ-02 lịch sử phiên bản đề; OQ-03 rủi ro lộ đáp án phía client; OQ-04 isLeadOrg chỉ cảnh báo; OQ-05 maxPlays theo localStorage; OQ-06 thang điểm chỉ đếm câu; OQ-07 ix bài làm dở giữa các thiết bị; OQ-08 chất lượng audio/kích thước gợi ý; OQ-09 số lượng câu tối thiểu cho độ tin cậy xếp lớp; OQ-10 đồng bộ lead khi người dùng chặn request.
