---
feature: student-practice
type: reverse-srs
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
confidence_summary: "spec: ✅ 114 / 🔵 0 / 🟡 4; tổng toàn assembly: ✅ 245 / 🔵 5 / 🟡 18"


---

# student-practice — Đặc tả đảo ngược (reverse-SRS) — draft

Feature "student-practice" trong tài liệu này = chu trình học viên luyện từ vựng theo
SRS spaced repetition: xem tổng quan → vào bộ từ → phiên học từ mới (Learn) → phiên ôn
theo lịch lặp (Review) → nhận gợi ý bộ từ của giáo viên → tự đăng ký khóa học từ vựng
thư viện → phát âm thanh từ.

> Quy ước nhãn — mỗi mệnh đề mang nhãn riêng: ✅ = khẳng định bởi code/test, có cite `path:line`; 🔵 = suy luận từ ≥2 bằng chứng code; 🟡 = phỏng đoán nghiệp vụ/why, bắt buộc kèm OQ tương ứng (Mục 12). Tên endpoint/hàm/bảng chỉ xuất hiện ở cột Truy vết và các file nguồn/evidence, không nằm trong mệnh đề FR/BR.

## Mục 0 — Nguồn soạn thảo (draft provenance)

- Soạn từ mã nguồn develop @ d6c0f6b5, batch 7 của /code-to-srs; đọc tĩnh, không chạy test.
- Phạm vi gồm HAI phân hệ cùng feature (quyết định điều phối sau audit — OQ-01 đã chốt):
  (A) chu trình SRS từ vựng của học viên — phần lõi đặc tả FR-01..FR-22;
  (B) catalog luyện đề IELTS #378 phase 10 — phân hệ FR-23..FR-30, tái sử dụng máy attempt
  chung của luồng giao bài (đặc tả đầy đủ thuộc feature student-quiz — ở đây chỉ điểm khác biệt).
- complexity_flag: state-machine (vocab_card: state new/review × level 1-5 × isWarning).

### 0.1 Bảng tài nguyên S (đầy đủ ở reverse-sources.md)

| S-id | Tài nguyên | Loại |
|---|---|---|
| S1 | API luyện từ vựng học viên (routes/vocab.ts) | code |
| S2 | Kernel route học viên (routes/student.ts) | code |
| S3 | Mount `/api/student` (app.ts) | code |
| S4 | Bộ lập lịch SRS (scheduler.ts) | code |
| S5 | Máy trạng thái phiên ôn (review-session.ts) | code |
| S6 | Máy trạng thái phiên học (learn-session.ts) | code |
| S7 | Sinh đề minigame (quiz-generator.ts) | code |
| S8 | Luật gõ từ (quiz-rules.ts) | code |
| S9 | Nguồn random crypto (rng.ts) | code |
| S10 | Định dạng giờ/khoảng (format.ts) | code |
| S11 | Ngày Việt Nam (vietnam-date.ts) | code |
| S12 | Barrel SRS (srs/index.ts) | code |
| S13 | Hợp đồng Zod phần từ vựng (contracts.ts) | code |
| S14 | Cấp phát thẻ + pool (vocab-provision.ts) | code |
| S15 | Schema DB từ vựng (schema/vocab.ts) | code |
| S16 | Schema thư viện từ vựng (schema/vocab-library.ts) | code |
| S17 | Migration 0036 (4 bảng lõi) | migration |
| S18 | Migration 0037 (3 bảng thư viện + audio_url) | migration |
| S19 | Migration 0038 (vocab_suggestion) | migration |
| S20 | Migration 0039 (recreate vocab_card, word_id đa hình) | migration |
| S21 | Migration 0040 (thêm mô tả khóa thư viện) | migration |
| S22 | Trang `/practice` → redirect | client route |
| S23 | Trang tổng quan từ vựng | client route |
| S24 | Trang chi tiết bộ từ | client route |
| S25 | Route phiên học (validateSearch mode) | client route |
| S26 | Trang danh mục khóa học | client route |
| S27 | Trang chi tiết khóa học | client route |
| S28 | `/vocab` cũ (redirect) | client route |
| S29 | `/vocab/*` cũ (redirect) | client route |
| S30 | Bộ chuẩn hóa redirect legacy | client lib |
| S31 | View phiên học (engine + phím + dialog) | client component |
| S32 | Panel phản hồi từng câu | client component |
| S33 | Overlay khích lệ 5 câu khó | client component |
| S34 | Tổng kết phiên | client component |
| S35 | Đồng hồ đếm ngược | client component |
| S36 | Thẻ bài học (trạng thái + bắt đầu từ đây) | client component |
| S37 | Nút phát âm | client component |
| S38 | CTA khóa học trên overview | client component |
| S39 | Danh sách gợi ý | client component |
| S40 | Prompt gõ từ | client component |
| S41 | Repo truy vấn client | client lib |
| S42 | Cấu hình query client | client lib |
| S43 | Test API từ vựng (16 test) | test |
| S44 | Test catalog luyện đề (biên giới) | test |
| S45 | E2E chu trình SRS | e2e |
| S46 | E2E điều hướng/practice | e2e |
| S47 | Test scheduler + vectors | test |
| S48 | Test phiên ôn | test |
| S49 | Test phiên học | test |
| S50 | Test sinh đề | test |
| S51 | Test luật gõ + vectors | test |
| S52 | Test định dạng | test |
| S53 | Test ngày VN | test |
| S54 | Test schema/migration | test |
| S55 | Test view phiên học | test |
| S56 | Conformance vectors (level-vectors.json) | fixture |
| S57 | API tự luyện đề (routes/student-practice.ts) | code |
| S58 | Trang catalog theo kỹ năng ($skill.tsx) | client route |
| S59 | Trang làm đề luyện ($testId.tsx) | client route |
| S60 | Catalog component (skill-catalog.tsx) | client component |
| S61 | Bộ lọc catalog (practice-filters.tsx) | client component |
| S62 | Nút lịch sử (history-button.tsx) | client component |
| S63 | Repo hooks student (repos/student.ts) | client lib |
| S64 | Repo quiz dùng chung (repos/quiz.ts) | client lib |
| S65 | View làm bài dùng chung (quiz-take-view.tsx) | client component |
| S66 | Thư viện band IELTS (ielts-band.ts) | code |
| S67 | Mapper media attempt (media-response.ts) | code |
| S68 | Test catalog component (practice-catalog.test.tsx) | test |
| S69 | Schema attempt dùng chung (schema/quiz-attempt.ts) | code |

### 0.2 Liên kết

- Nguồn chi tiết: [reverse-sources.md](reverse-sources.md)
- Khoảng trống & câu hỏi mở: [reverse-gaps.md](reverse-gaps.md)
- Bằng chứng thô: [_evidence.md](_evidence.md)
- Luồng: [srs/student-practice-reverse-flows.md](srs/student-practice-reverse-flows.md)
- Máy trạng thái: [srs/student-practice-reverse-states.md](srs/student-practice-reverse-states.md)
- Mô hình dữ liệu: [srs/student-practice-reverse-erd.md](srs/student-practice-reverse-erd.md)
- Use cases: [usecases/student-practice-reverse-usecase-index.md](usecases/student-practice-reverse-usecase-index.md)

### 0.3 Tài liệu nghiệp vụ hiện có

- Không có tài liệu feature nào trong repo cho phạm vi này (plan `existing_doc = null`). ✅ (reverse-plan.json)
- Mã nguồn nhiều lần dẫn chiếu tài liệu đặc tả gốc `docs/srs-spec.md` (§1, §3b, §5) nhưng
  tập tin này không tồn tại trong repo — xem OQ-02. ✅ (nội dung comment) + 🟡 (số phận tài liệu)

## Mục 1 — Phạm vi

- Phân hệ A — SRS từ vựng: tổng quan luyện từ vựng; chi tiết bộ từ; cấp phát thẻ lần đầu;
  phiên Learn; phiên Review; ghi kết quả + xếp lịch SRS; gợi ý bộ từ (đồng ý/ẩn); danh mục +
  chi tiết khóa học từ vựng thư viện; phát âm thanh (kho media + proxy xa); redirect legacy
  `/vocab`. ✅ apps/server/src/routes/vocab.ts:1-1245
- Phân hệ B — luyện đề IELTS (#378 phase 10): catalog đề theo kỹ năng; mở đề/làm bài/nộp;
  xem điểm tự chấm hoặc Band; đề luyện không thuộc bài tập lớp. ✅ apps/server/src/routes/student-practice.ts:118-142, apps/server/src/routes/student.ts:1993-2021
- Ngoài phạm vi (chỉ nhắc khi liên quan): quản lý bộ từ/gợi ý phía giáo viên (feature
  vocab-hub); kho thư viện phía admin; vòng đời attempt đầy đủ + màn hình summary/bảng điểm
  lớp (feature student-quiz — phân hệ B chỉ ghi điểm khác biệt); upload tài liệu; placement
  test; lịch sử học tập phase 11 (chỉ cross-ref). ✅ apps/server/src/app.ts:433-442 (chỉ đăng ký route luyện tập/từ vựng, không có route phase 11)

## Mục 2 — Actor

- **Học viên (student)**: duy nhất một actor thao tác. Đăng nhập session student; mọi route
  yêu cầu auth (401 nếu thiếu) và mọi route đều bọc trong kernel học viên. ✅ apps/server/src/routes/vocab.ts:311-322, apps/server/src/routes/vocab.test.ts:264-284
- **Giáo viên**: không thao tác trong feature này nhưng là nguồn dữ liệu (tạo bộ từ trong lớp,
  gửi gợi ý) — chỉ xuất hiện như điều kiện tiền đề. ✅ packages/db/src/schema/vocab.ts:173 (teacher_id trên gợi ý)
- **Hệ thống bên ngoài**: máy chủ phát âm của nhà cung cấp khóa thư viện (bị giới hạn miền
  cho phép, chỉ HTTPS) — bị động, không đăng nhập. ✅ apps/server/src/routes/vocab.ts:167-176


## Mục 3 — Yêu cầu chức năng (FR)

| FR | Yêu cầu | Điều kiện / Giới hạn | Truy vết |
|---|---|---|---|
| FR-01 | Cổng vào luyện tập: mở mục luyện tập đưa học viên về trang đọc mặc định, từ đó chọn tab từ vựng. | Chỉ chuyển hướng khi vào gốc `/practice`; không đổi URL khác. | ✅ apps/student/src/routes/_auth/practice/index.tsx:1-13 |
| FR-02 | URL `/vocab` cũ tự chuyển về trang từ vựng mới. | Chuẩn hóa đích chống mở trang ngoài (open-redirect); mọi đường con cũng về cùng đích. | ✅ apps/student/src/routes/_auth/vocab/index.tsx:1-11, apps/student/src/routes/_auth/vocab/$.tsx:1-11, apps/student/src/lib/legacy-vocab-redirect.ts:1-32; e2e apps/e2e/specs/student-practice.spec.ts:232-237 |
| FR-03 | Tổng quan hiển thị 5 chỉ số: từ mới còn lại, số từ đến hạn, chuỗi ngày liên tiếp, số đã thuộc, số thành thạo. | Từ mới = tổng từ trừ số đã vào lịch; "đã thuộc" tính từ mức 2 trở lên; "thành thạo" là mức 5; số đến hạn chỉ đếm thẻ đã học (đang ở trạng thái ôn) có hạn ≤ hiện tại. | ✅ apps/server/src/routes/vocab.ts:562-633, apps/server/src/routes/vocab.ts:543-545; e2e apps/e2e/specs/vocab-srs.spec.ts:537-555 |
| FR-04 | Tổng quan hiển thị đồng hồ đếm ngược đến lần ôn gần nhất và đếm "N từ sắp đến hạn". | Cửa sổ "sắp đến hạn" = 1 giờ kể từ lần ôn gần nhất; đồng hồ tick mỗi giây, hết giờ tự tải lại dữ liệu; ẩn khi không có thẻ future. | ✅ apps/server/src/routes/vocab.ts:617-630 (cửa sổ 3.600.000 ms khai báo dòng 58), apps/student/src/components/vocab/vocab-countdown.tsx:12-51, apps/student/src/routes/_auth/practice/vocabulary/index.tsx:216-227 |
| FR-05 | Tổng quan hiển thị dự báo số ôn cho 7 ngày và tỉ lệ nhớ (%). | Dự báo nhóm theo ngày Việt Nam, hôm nay + 6 ngày sau; % nhớ = tỉ lệ lượt trả lời không "chưa nhớ" làm tròn nửa lên. | ✅ apps/server/src/routes/vocab.ts:645-664, apps/server/src/routes/vocab.ts:666-691 |
| FR-06 | Danh sách bộ từ trên tổng quan gắn nhãn nguồn: "Gợi ý", "Khóa", "Lớp" và trạng thái bài học (mới / đang học / hoàn thành), có bộ "Bắt đầu từ đây". | Một bộ vừa là lớp vừa là gợi ý thì hiển thị nguồn lớp (ưu tiên cao nhất); "bắt đầu từ đây" = bộ mới đầu tiên theo thứ tự sắp xếp. | ✅ apps/server/src/lib/vocab-provision.ts:201-247, apps/student/src/components/vocab/vocab-lesson-card.tsx:15-90 |
| FR-07 | Danh sách gợi ý bộ từ của giáo viên hiển thị với nút đồng ý / ẩn. | Chỉ gợi ý chưa trả lời; bận xử lý một gợi ý thì khóa các nút khác. | ✅ apps/student/src/components/vocab/vocab-suggestion-list.tsx:93-108, apps/student/src/routes/_auth/practice/vocabulary/index.tsx:55-82 |
| FR-08 | Đồng ý gợi ý: ghi nhận trạng thái đã đồng ý rồi mở trang bộ từ tương ứng. | Gọi lại lần nữa khi đã đồng ý → trả về kết quả như cũ (idempotent); gợi ý không tồn tại hoặc đã ẩn → lỗi không tìm thấy. | ✅ apps/server/src/routes/vocab.ts:744-816 |
| FR-09 | Ẩn gợi ý: ghi nhận trạng thái đã ẩn. | Gợi ý đã đồng ý thì không cho ẩn nữa → lỗi xung đột (thông báo gốc API: "cannot dismiss accepted suggestion"). | ✅ apps/server/src/routes/vocab.ts:818-885 |
| FR-10 | Điều kiện mở bộ từ: học viên có enrollment đang hoạt động với lớp sở hữu bộ từ, HOẶC đã đồng ý gợi ý của bộ từ đó, HOẶC (riêng bộ thư viện) đã từng cấp thẻ. | Bộ từ khác tổ chức hoặc không thỏa điều kiện → lỗi không tìm thấy (không lộ sự tồn tại). | ✅ apps/server/src/lib/vocab-provision.ts:81-108, apps/server/src/lib/vocab-provision.ts:374, apps/server/src/routes/vocab.ts:903-909 |
| FR-11 | Mở bộ từ lần đầu tự cấp thẻ cho toàn bộ từ của bộ (lazy provisioning). | Chèn theo lô tối đa 10 thẻ; thẻ đã tồn tại thì bỏ qua (không nhân đôi); mốc lịch đầu tiên neo theo thời điểm tạo bộ từ (bộ lớp/gợi ý) hoặc mốc cố định của khóa thư viện. | ✅ apps/server/src/lib/vocab-provision.ts:368-594 (mốc: 419-431 org, 520-532 thư viện), test race apps/server/src/routes/vocab.test.ts:304-321 |
| FR-12 | Trang bộ từ hiển thị hai hành động: "Bắt đầu học (N)" và "Ôn tập (N)" cùng câu thông báo đợt ôn tiếp theo. | N = số từ mới còn / số thẻ đến hạn; đếm 0 thì nút vô hiệu với chú giải nguyên nhân; câu nhắc khoảng cách dùng định dạng phút/giờ/ngày/tuần/tháng. | ✅ apps/student/src/routes/_auth/practice/vocabulary/$deckId.tsx:78-176, apps/student/src/components/vocab/vocab-lesson-card.tsx (định dạng) packages/api/src/srs/format.ts:5-13 |
| FR-13 | Vào phiên: tải dữ liệu phiên gồm hàng đợi từ mới (sắp theo hạn rồi theo mã), pool ôn (chỉ thẻ đã học, sắp theo hạn), dự báo, chuỗi ngày, đồng hồ. | Chỉ nhận từ cùng trang (chặn Sec-Fetch-Site cross-site từ nguồn lạ); trả cả danh sách thẻ đã cấp. | ✅ apps/server/src/routes/vocab.ts:887-916, apps/server/src/lib/vocab-provision.ts:592-756 |
| FR-14 | Phiên học từ mới đi theo chuỗi bước: lật thẻ → chọn nghĩa (hoặc nghe-chọn) → gõ từ (hoặc chọn từ). | Không được sang bước luyện khi chưa lật thẻ intro (chặn kèm thông báo); lộ trình bước cố định theo bộ sinh ban đầu. | ✅ packages/api/src/srs/learn-session.ts:15-83, packages/api/src/srs/learn-session.ts:194-230 |
| FR-15 | Hoàn tất mọi bước của một từ trong phiên học → ghi một kết quả học ("tốt" nếu đúng ngay lần đầu ở mọi bước có chấm) và xếp lịch lại. | Từ học xong luôn về mức 1, trạng thái chuyển sang ôn, lần ôn đầu sau 1 ngày; ghi log idempotent theo mã do client sinh. | ✅ packages/api/src/srs/learn-session.ts:376-411, packages/api/src/srs/scheduler.ts:70-79, apps/server/src/routes/vocab.ts:1046-1161 |
| FR-16 | Phiên ôn chỉ chứa thẻ đến hạn; nếu không còn thẻ đến hạn, học viên vẫn có thể ôn sớm toàn bộ thẻ theo thứ tự hạn gần nhất. | Ôn sớm do hành động "Ôn tập" khi đếm bằng 0 — xem BR-04 về việc không ghi lịch. | ✅ packages/api/src/srs/review-session.ts:96-119 |
| FR-17 | Ghi từng câu trả lời ôn: đúng/sai + thời gian trả lời, idempotent theo mã client sinh. | Thời gian kẹp tối đa 1 giờ (không từ chối); thẻ không thuộc học viên → không tìm thấy; thẻ chưa học (còn trạng thái mới) → 409 VOCAB_CARD_NOT_DUE (diễn giải từ mã lỗi + comment "phải qua Learn" — không phải chuỗi người dùng nhìn thấy); thẻ ôn chưa đến hạn → 200 im lặng, không ghi log; mã log đã tồn tại thuộc học viên khác → xung đột. | ✅ apps/server/src/routes/vocab.ts:918-1044, packages/api/src/contracts.ts:3585-3593 |
| FR-18 | Xếp lịch sau mỗi câu ôn theo 5 mức ghi nhớ (1-5). | Đúng: +1 mức; sai ở mức 2-4: −1 mức; sai ở mức 5 lần đầu: bật cảnh báo và ôn lại sau 1 ngày; sai tiếp khi đang cảnh báo: rớt về mức 1; đúng khi đang cảnh báo: hạ 1 mức và tắt cảnh báo. | ✅ packages/api/src/srs/scheduler.ts:27-65, packages/db/src/schema/vocab.ts:84-94 (bất biến warning chỉ ở mức 5) |
| FR-19 | Khoảng cách ôn chuẩn theo mức: 1, 3, 7, 14, 30 ngày; đang cảnh báo thì 1 ngày; ngày hiển thị chỉ để trình bày, bộ lập lịch chỉ đọc mốc tuyệt đối. | Sai ở mức 1 giữ mức 1. Đếm số lần "rớt" (lapse) tăng khi sai ở mức ≥2. | ✅ packages/api/src/srs/scheduler.ts:1-7, packages/api/src/srs/scheduler.ts:27-65, packages/db/src/schema/vocab.ts:91-93 |
| FR-20 | Minigame 4 lựa chọn: sinh 3 phương án nhiễu ưu tiên từ cùng bộ, thiếu mới lấy từ bộ khác; các kiểu câu khả dụng phụ thuộc dữ liệu từ (có audio → nghe; từ ngắn → gõ). | Kiểu tự-đánh-giá (self-check) chỉ được chọn khi không đủ điều kiện kiểu khác (hạng C). | ✅ packages/api/src/srs/quiz-generator.ts:104-163, packages/api/src/srs/quiz-generator.ts:165-206, packages/api/src/srs/quiz-generator.ts:244-271 |
| FR-21 | Gõ từ: chuẩn hóa đầu vào (Unicode NFC, bỏ hoa/thường, chuẩn hóa dấu nháy/gạch nối) rồi so khớp; dấu tiếng Việt vẫn có ý nghĩa; gợi ý chữ cái đầu khi mức ≤2, không gợi ý ở mức 5; giới hạn 30 ký tự (code points). | Từ quá dài hoặc chứa ký tự không hợp lệ thì không ra kiểu gõ. | ✅ packages/api/src/srs/quiz-rules.ts:4-61 |
| FR-22 | Tiện nghi phiên: tự-đánh-giá tự chuyển sau 240 ms; Enter nộp/Escape thoát; sai 5 câu liên tiếp hiện overlay khích lệ; bỏ qua khi lỗi phát âm không bị phạt; quên một thẻ: lần "chưa nhớ" thứ nhất thẻ được đẩy lại giữa hàng đợi (vị trí 4-5); lần thứ hai thẻ bị loại khỏi phần còn lại của phiên (đếm vào số thẻ hoàn thành). | Sai trong phiên học thì từ bị đẩy xuống cuối hàng đợi để học lại trong phiên. | ✅ packages/api/src/srs/review-session.ts:55, packages/api/src/srs/review-session.ts:183-286, packages/api/src/srs/review-session.ts:296-316, packages/api/src/srs/review-session.ts:368-371, packages/api/src/srs/learn-session.ts:279-302, apps/student/src/components/vocab/vocab-session-view.tsx:279-334 |
| FR-23 | Phân hệ B — catalog luyện đề theo 4 kỹ năng: đọc, nghe, viết, nói (không có Dictation); mục thứ năm trên menu luyện tập là Vocabulary trỏ về phân hệ A. | Vào slug kỹ năng sai → về đọc; menu con: Reading → Listening → Writing → Speaking → Vocabulary. | ✅ packages/api/src/contracts.ts:347-355, packages/api/src/contracts.ts:2235, apps/student/src/routes/_auth/practice/$skill.tsx:8-15, apps/student/src/routes/_auth/practice/$skill.tsx:31-38; e2e apps/e2e/specs/student-practice.spec.ts:190-202 |
| FR-24 | Catalog phân trang 12 đề/trang; lọc theo bộ sưu tập (khớp chính xác) và tìm theo tiêu đề không phân biệt hoa/thường (ký tự % hoặc _ của học viên không thành ký tự đại diện); sắp mới nhất trước. | Trang < 1 hoặc kỹ năng lạ → từ chối 400. | ✅ apps/server/src/routes/student-practice.ts:229-281, apps/server/src/routes/student-practice.ts:343-364, packages/api/src/contracts.ts:2238; test apps/server/src/routes/student-practice.test.ts:386-417 |
| FR-25 | Chỉ hiện đề "sẵn sàng" của cùng tổ chức; đề nháp, đề tổ chức khác, hoặc đề không có phần → xử lý như đề không tồn tại (không lộ sự tồn tại). | Điều kiện bắt buộc cả ở catalog lẫn mở đề. | ✅ apps/server/src/routes/student-practice.ts:32-43, apps/server/src/routes/student-practice.ts:44-90, apps/server/src/routes/student-practice.ts:251-259; test apps/server/src/routes/student-practice.test.ts:349-385, apps/server/src/routes/student-practice.test.ts:492-503 |
| FR-26 | Thẻ đề hiển thị: số phần, bộ sưu tập, nhóm đề, thời lượng (phút), và kết quả gần nhất của chính học viên — đã chấm → "Band x.x", tự chấm → "đúng/tổng", chưa có → không hiển thị (Viết/Nói chưa chấm → "Đã nộp — Đang chờ giáo viên chấm" ở client). | Kết quả gần nhất = lượt đã nộp muộn nhất. | ✅ apps/server/src/routes/student-practice.ts:118-142, apps/server/src/routes/student-practice.ts:282-309, apps/server/src/routes/student-practice.ts:318-341, packages/api/src/contracts.ts:2241-2253, apps/student/src/components/practice/skill-catalog.tsx:53-69 |
| FR-27 | Bắt đầu luyện: tạo lượt làm riêng (không gắn bài tập lớp) với bản chụp đề gộp đủ mọi phần theo thứ tự; mở lại khi đang có lượt dở → tiếp tục lượt đó; nộp rồi vẫn làm lại được (không chặn). | Route ghi duy nhất của phân hệ; cùng bộ bảo vệ CSRF/JSON/giới hạn body với domain quiz. | ✅ apps/server/src/routes/student-practice.ts:208-221, apps/server/src/routes/student-practice.ts:412-470; test apps/server/src/routes/student-practice.test.ts:438-491, apps/server/src/routes/student-practice.test.ts:504-536 |
| FR-28 | Màn làm đề luyện dùng lại máy làm bài chung với bài giao lớp (cross-ref feature student-quiz): khung giấy lấy từ phần đầu, câu hỏi gộp đủ mọi phần, đề Nói lộ ghi chú hướng dẫn, lượt đã nộp ở tab khác → thẳng trang tổng kết. | Practice không có hạn nộp và không có lượt giao; làm lại được nên không chặn khi chưa có lượt dở. | ✅ apps/server/src/routes/student-practice.ts:144-214, apps/server/src/routes/student-practice.ts:367-410; apps/student/src/routes/_auth/learn/quizzes/practice/$testId.tsx:6-40, apps/student/src/lib/repos/quiz.ts:32-48 |
| FR-29 | Điểm luyện đề: tự chấm xem ngay đúng/tổng sau nộp; Viết/Nói do giáo viên chấm theo tiêu chí IELTS → hiển thị "Band" trung bình; kết quả luyện KHÔNG xuất hiện trong bảng điểm lớp và không ghi nhận vào bài tập nào. | Đề Viết luyện vẫn vào hàng chờ chấm của giáo viên với nhãn "Luyện tập". | ✅ apps/server/src/routes/student-practice.ts:118-142, packages/api/src/lib/ielts-band.ts:143-152; test apps/server/src/routes/student-practice.test.ts:574-675, apps/server/src/routes/student-practice.test.ts:676-758; e2e apps/e2e/specs/student-practice.spec.ts:159-178 |
| FR-30 | Kỹ năng chưa có đề sẵn sàng → thông báo trống "Giáo viên chưa có đề luyện tập cho kỹ năng này". | Hiển thị thay danh sách; không lỗi. | ✅ apps/student/src/components/practice/skill-catalog.tsx:176-181; e2e apps/e2e/specs/student-practice.spec.ts:180-186 |

## Mục 4 — Yêu cầu phi chức năng (NFR)

| NFR | Yêu cầu | Truy vết |
|---|---|---|
| NFR-01 | Bảo vệ ghi (CSRF): từ chối 403 nếu Origin không nằm trong danh sách cho phép; 415 nếu body không phải JSON; 413 nếu body vượt 4096 byte. | ✅ apps/server/src/routes/vocab.ts:311-322 |
| NFR-02 | Dữ liệu phiên chặn yêu cầu cross-site: 403 `FORBIDDEN_ORIGIN` khi Sec-Fetch-Site = cross-site và Origin lạ. | ✅ apps/server/src/routes/vocab.ts:888-897 |
| NFR-03 | Ghi kết quả nguyên tử: log + cập nhật thẻ trong cùng một batch DB; chạy lại khi mạng rớt trả lại đúng kết quả lần trước (race replay). | ✅ apps/server/src/routes/vocab.ts:979-1026; test apps/server/src/routes/vocab.test.ts:421-539 |
| NFR-04 | Giới hạn D1 (100 bind param): chèn thẻ chia lô ≤10 (≤90 tham số); truy vấn chia lô 50. | ✅ apps/server/src/lib/vocab-provision.ts:24-30 |
| NFR-05 | Ngẫu nhiên (xáo trộn, chọn nhiễu, vị trí đẩy lại) dùng nguồn crypto, không dùng Math.random. | ✅ packages/api/src/srs/rng.ts:1-57 |
| NFR-06 | Ngày logic theo múi giờ Việt Nam (Asia/Ho_Chi_Minh) qua Intl; chuỗi ngày ISO neo UTC khi cộng ngày. | ✅ packages/api/src/vietnam-date.ts:27-38; test packages/api/src/vietnam-date.test.ts:1-262 |
| NFR-07 | Hợp đồng API là Zod `.strict()` (từ chối trường lạ) — client cũ gửi trường mới phải bị chặn; deploy worker + student cùng lúc. | ✅ packages/api/src/contracts.ts:3089-3095 (chú thích release train) |
| NFR-08 | Proxy âm thanh an toàn: chỉ HTTPS + miền cho phép; tối đa 3 lần redirect qua miền cho phép; timeout 10 giây; tối đa 5 MB; đúng kiểu `audio/*`; gắn header `nosniff` + CSP `sandbox`; cache riêng tư 1 ngày; mọi thất bại upstream trả đồng nhất 404 (không lộ chi tiết). | ✅ apps/server/src/routes/vocab.ts:167-287 |
| NFR-09 | Hiệu năng client: cache React Query staleTime 60 giây; trang khóa học phân trang 12 khóa/trang với ô tìm kiếm debounce. | ✅ apps/student/src/lib/query-client.ts:39-50, apps/student/src/routes/_auth/practice/vocabulary/courses/index.tsx:44-57, packages/api/src/contracts.ts:2238 |
| NFR-10 | Tiện dụng: điều hướng phím trong phiên (Enter/Escape), testid ổn định cho e2e; e2e phủ 3 viewport không tràn ngang. | ✅ apps/student/src/components/vocab/vocab-session-view.tsx:302-334; apps/e2e/specs/student-practice.spec.ts:190-238 |


## Mục 5 — Quy tắc nghiệp vụ (BR)

- **BR-01.** Thang ghi nhớ 5 mức; khoảng chuẩn 1, 3, 7, 14, 30 ngày theo mức 1-5. ✅
  packages/api/src/srs/scheduler.ts:1-7; vectors packages/api/src/srs/vectors/level-vectors.json:1-1024
- **BR-02.** Cảnh báo (warning) chỉ tồn tại ở mức 5; mọi chuyển đổi không được vi phạm bất biến này. ✅
  packages/db/src/schema/vocab.ts:84-94; packages/api/src/srs/scheduler.ts:27-65
- **BR-03.** Một từ học xong trong phiên học luôn quay về mức 1 với lần ôn sau 1 ngày, bất kể trả lời tốt thế nào trong phiên. ✅
  packages/api/src/srs/scheduler.ts:70-79; packages/api/src/contracts.ts:3595-3607 (chú thích gradeGood)
- **BR-04.** Ôn sớm (không đến hạn) là luyện tự do: server vẫn nhận câu trả lời nhưng KHÔNG ghi log và KHÔNG đổi lịch của thẻ. 🟡 (thiết kế "ephemeral" — OQ-04)
  apps/server/src/routes/vocab.ts:962-977; test apps/server/src/routes/vocab.test.ts:626-657
- **BR-05.** "Đến hạn" chỉ tính thẻ đã học (đang ở trạng thái ôn) với mốc ≤ hiện tại; thẻ mới chưa học không bao giờ xuất hiện trong pool ôn. ✅
  apps/server/src/routes/vocab.ts:617-619; packages/api/src/srs/review-session.ts:96-119
- **BR-06.** Chuỗi ngày đếm theo ngày Việt Nam liên tiếp có ít nhất một lượt luyện; chuỗi còn "sống" nếu ngày hôm qua có luyện và hôm nay chưa; mốc hôm qua có luyện, trước đó gián đoạn thì chuỗi = số ngày liên tiếp tính từ hôm qua. ✅
  apps/server/src/routes/vocab.ts:666-686; test apps/server/src/routes/vocab.test.ts:540-625
- **BR-07.** % nhớ = lượt trả lời không "chưa nhớ" trên tổng số lượt, làm tròn nửa về xa số 0; không có lượt nào thì không hiển thị. ✅
  apps/server/src/routes/vocab.ts:688-691; packages/api/src/srs/scheduler.ts:86-88
- **BR-08.** Ưu tiên nguồn bộ từ khi trùng: Lớp > Gợi ý > Thư viện; sắp xếp danh sách theo thời điểm tạo bộ từ, rồi thứ tự trong khóa, rồi mã. ✅
  apps/server/src/lib/vocab-provision.ts:201-247
- **BR-09.** Mốc lịch thẻ mới cấp: bộ lớp/gợi ý neo theo thời điểm tạo bộ từ; bộ thư viện neo theo thời điểm thẻ đầu tiên của học viên (thiếu thì dùng mốc cố định của thư viện); công thức đánh số thứ tự chỉ phục vụ sắp xếp, không phải thời gian thật. 🟡 (ý nghĩa nghiệp vụ của mốc cố định — OQ-06)
  apps/server/src/lib/vocab-provision.ts:419-431, apps/server/src/lib/vocab-provision.ts:520-532
- **BR-10.** Cấp thẻ là một lần duy nhất per (học viên, từ): mở lại bộ từ không tái tạo hay đổi lịch thẻ cũ. ✅
  apps/server/src/lib/vocab-provision.ts:368-594 (INSERT OR IGNORE + unique); test apps/server/src/routes/vocab.test.ts:304-321
- **BR-11.** Sai trong phiên học: từ quay lại cuối hàng đợi của phiên để học lại; đúng ngay lần đầu ở mọi bước mới tính là kết quả "tốt". ✅
  packages/api/src/srs/learn-session.ts:279-302, packages/api/src/srs/learn-session.ts:376-411
- **BR-12.** Trong phiên ôn, một thẻ bị "chưa nhớ" chỉ được tính tối đa 2 lần: lần "chưa nhớ" thứ nhất thẻ được chen lại ở vị trí 4 hoặc 5 của hàng đợi; lần thứ hai thẻ bị LOẠI khỏi phần còn lại của phiên (đếm vào số thẻ hoàn thành). ✅
  packages/api/src/srs/review-session.ts:253-286, packages/api/src/srs/review-session.ts:368-371
- **BR-13.** 5 câu khó liên tiếp → overlay khích lệ, học viên đóng để tiếp tục; không ảnh hưởng điểm/lịch. ✅
  packages/api/src/srs/review-session.ts:55, packages/api/src/srs/review-session.ts:183-247; apps/student/src/components/vocab/wrong-streak-overlay.tsx:12-40
- **BR-14.** Lỗi phát âm/từ khóa không có âm thanh: học viên bỏ qua qua lượt, không tính sai, không đổi lịch. ✅
  packages/api/src/srs/review-session.ts:296-316, packages/api/src/srs/learn-session.ts:317-338
- **BR-15.** Gợi ý đã đồng ý không thể ẩn; gợi ý đã ẩn không thể đồng ý (báo không tìm thấy); đồng ý lặp lại là vô hại. ✅
  apps/server/src/routes/vocab.ts:773-796, apps/server/src/routes/vocab.ts:857-865
- **BR-16.** Mã định danh bộ từ do người dùng khai báo không được phép dùng tiền tố dành riêng của thư viện (libcourse-/libdeck-/libword-). ✅
  packages/api/src/contracts.ts:3137-3147
- **BR-17.** Kỹ năng luyện (nghe-nghĩa-gõ-chọn) thuộc tập kỹ năng luyện tập chung của học viên; một ngày luyện từ vựng cũng được tính vào lịch sử luyện theo ngày. ✅
  packages/api/src/contracts.ts:347-355, packages/api/src/contracts.ts:2296-2306

## Mục 6 — Ma trận lỗi

Mã lỗi giữ nguyên giá trị hợp đồng ("từ vựng hợp đồng"). Wording UI trích nguyên văn từ component.

| Mã / tình huống | HTTP | Điều kiện | Wording / hiển thị | Truy vết |
|---|---|---|---|---|
| E-01 — chưa đăng nhập | 401 | Thiếu session student trên mọi route | (API thuần) | ✅ apps/server/src/routes/vocab.test.ts:264-270 |
| E-02 — Origin không cho phép (ghi) | 403 | POST nhưng Origin ngoài danh sách | (API thuần) | ✅ apps/server/src/routes/vocab.ts:311-314, apps/server/src/routes/vocab.test.ts:271-284 |
| E-03 — sai kiểu nội dung | 415 | POST body không phải JSON | (API thuần) | ✅ apps/server/src/routes/vocab.ts:315-318 |
| E-04 — body quá lớn | 413 | Body > 4096 byte | (API thuần) | ✅ apps/server/src/routes/vocab.ts:319-322 |
| E-05 — `FORBIDDEN_ORIGIN` | 403 | session-data qua cross-site + Origin lạ | (API thuần) | ✅ apps/server/src/routes/vocab.ts:888-897 |
| E-06 — `VOCAB_DECK_NOT_FOUND` | 404 | Bộ từ không tồn tại / không truy cập được | "Không tìm thấy bộ từ vựng" | ✅ apps/server/src/routes/vocab.ts:903-909, apps/student/src/routes/_auth/practice/vocabulary/$deckId.tsx:46-63 |
| E-07 — body/JSON sai | 400 | answer / learn-commit parse lỗi | (API thuần) | ✅ apps/server/src/routes/vocab.ts:922-931 |
| E-08 — `VOCAB_CARD_NOT_FOUND` | 404 | Thẻ không thuộc học viên (IDOR) | (API thuần) | ✅ apps/server/src/routes/vocab.ts:937-943, apps/server/src/routes/vocab.ts:1062-1068, apps/server/src/routes/vocab.test.ts:366-385 |
| E-09 — trùng mã log | 409 | clientLogId đã tồn tại thuộc HỌC VIÊN KHÁC (chống truy chéo học viên; trùng clientLogId của chính học viên là replay vô hại) | (API thuần, "log id conflict") | ✅ apps/server/src/routes/vocab.ts:945-960 |
| E-10 — `VOCAB_CARD_NOT_DUE` | 409 | Gửi câu trả lời ôn cho thẻ CHƯA HỌC (còn trạng thái mới) | (API thuần; comment: phải qua Learn; thẻ ôn chưa đến hạn nhận 200 im lặng, không ghi log) | ✅ apps/server/src/routes/vocab.ts:967-977, packages/api/src/contracts.ts:3102-3116, apps/server/src/routes/vocab.test.ts:626-657 |
| E-11 — `LIBRARY_COURSE_NOT_FOUND` | 404 | Khóa thư viện không tồn tại | (API thuần) | ✅ apps/server/src/routes/vocab.ts:461-469 |
| E-12 — `VOCAB_SUGGESTION_NOT_FOUND` | 404 | Đồng ý gợi ý không tồn tại hoặc đã ẩn | (API thuần) | ✅ apps/server/src/routes/vocab.ts:773-781, apps/server/src/routes/vocab.ts:845-853 |
| E-13 — `VOCAB_SUGGESTION_ALREADY_ACCEPTED` | 409 | Ẩn gợi ý đã đồng ý | (API thuần) | ✅ apps/server/src/routes/vocab.ts:857-865 |
| E-14 — thiếu kho media | 503 | Word có audio key nhưng server chưa cấu hình kho media | "media storage unavailable" | ✅ apps/server/src/routes/vocab.ts:1183-1190 |
| E-15 — `VOCAB_AUDIO_NOT_FOUND` | 404 | Không có âm thanh; hoặc upstream lỗi/hết hạn/đúng mime/sai miền (đồng nhất, chống dò) | (API thuần) | ✅ apps/server/src/routes/vocab.ts:177-287, apps/server/src/routes/vocab.ts:1211-1243 |
| E-16 — lỗi tải tổng quan | — | fetch overview thất bại | "Không tải được dữ liệu từ vựng. Vui lòng thử lại." | ✅ apps/student/src/routes/_auth/practice/vocabulary/index.tsx:96-100 |
| E-17 — lỗi mở gợi ý | — | POST accept thất bại | "Không thể mở bộ từ gợi ý. Vui lòng thử lại." | ✅ apps/student/src/routes/_auth/practice/vocabulary/index.tsx:61-63 |
| E-18 — lỗi ẩn gợi ý | — | POST dismiss thất bại | "Không thể ẩn gợi ý. Vui lòng thử lại." | ✅ apps/student/src/routes/_auth/practice/vocabulary/index.tsx:77-79 |
| E-19 — lỗi lưu kết quả | — | POST answer/commit lỗi mạng | "Không lưu được kết quả học do lỗi kết nối..." + nút "Thử lại" / "Bỏ qua" | ✅ apps/student/src/components/vocab/vocab-feedback-panel.tsx:92-118 |
| E-20 — bộ từ biến mất giữa phiên | — | Refetch dữ liệu phiên thất bại do deck bị xóa | Dialog "Bộ từ đã bị xoá hoặc thay đổi" → dừng phiên | ✅ apps/student/src/components/vocab/vocab-session-view.tsx:524-551 |
| E-21 — danh mục rỗng | — | Không khóa học khớp tìm kiếm | "Không tìm thấy khóa học từ vựng phù hợp." | ✅ apps/student/src/routes/_auth/practice/vocabulary/courses/index.tsx:104-115 |
| E-22 — khóa học không tồn tại | — | Vào khóa sai mã | "Không tìm thấy bài học phù hợp." | ✅ apps/student/src/routes/_auth/practice/vocabulary/courses/$courseId.tsx:180-190 |
| E-23 — tham số catalog sai | 400 | Kỹ năng lạ hoặc trang < 1 trên GET catalog | "invalid skill" / "invalid page" | ✅ apps/server/src/routes/student-practice.ts:236-245, apps/server/src/routes/student-practice.test.ts:386-395 |
| E-24 — chưa đăng nhập (luyện đề) | 401 | Route practice thiếu session student | (API thuần) | ✅ apps/server/src/routes/student-practice.test.ts:431-437 |
| E-25 — `test not found` | 404 | Đề nháp / tổ chức khác / không có phần / snapshot hỏng (cả GET quiz lẫn POST start) | (API thuần — không lộ tồn tại) | ✅ apps/server/src/routes/student-practice.ts:374, apps/server/src/routes/student-practice.ts:400-403, apps/server/src/routes/student-practice.ts:429; test apps/server/src/routes/student-practice.test.ts:492-503, apps/server/src/routes/student-practice.test.ts:563-573 |
| E-26 — body start sai | 400 | POST attempts JSON lỗi hoặc không khớp hành động rỗng | "invalid json" / "invalid body" | ✅ apps/server/src/routes/student-practice.ts:421-424 |
| E-27 — bảo vệ ghi luyện đề | 403 / 415 | Origin lạ → 403; Content-Type không phải JSON → 415 (cùng bộ bảo vệ domain quiz) | (API thuần) | ✅ apps/server/src/routes/student-practice.ts:212-221, apps/server/src/routes/student-practice.test.ts:504-536 |
| E-28 — lỗi bắt đầu luyện | — | POST start thất bại | Toast "Không bắt đầu được bài luyện tập" + mô tả lỗi | ✅ apps/student/src/routes/_auth/practice/$skill.tsx:92-101 |

## Mục 7 — Thước đo thành công

| SM | Thước đo | Bằng chứng |
|---|---|---|
| SM-01 | Học xong từ mới → thẻ vào lịch: đồng hồ hiện "1d 0h"/"23:59" và câu "Đợt ôn tiếp theo sau 1d". | ✅ apps/e2e/specs/vocab-srs.spec.ts:359-486 |
| SM-02 | Sau khi ôn hết, số đến hạn về 0 (testid đếm đến hạn cập nhật). | ✅ apps/e2e/specs/vocab-srs.spec.ts:537-555 |
| SM-03 | Chuỗi ngày hiển thị "1 ngày" khi học viên có lượt luyện hôm nay; xóa bộ từ không làm mất chuỗi. | ✅ apps/e2e/specs/vocab-srs.spec.ts:488-665 |
| SM-04 | Vector hội chuẩn (đáp án, learn-commit, gõ từ, đủ điều kiện, gợi ý, khoảng, bước học, hàng đợi) khớp byte-đối-byte qua script kiểm tra. | ✅ packages/api/package.json:12, packages/api/src/srs/vectors/level-vectors.json:1-1024 |
| SM-05 | % nhớ tăng khi học viên trả lời tốt liên tiếp (metric server sẵn có). | 🟡 chưa có ngưỡng nghiệp vụ — OQ-09 |
| SM-06 | Điều hướng bàn phím tới trang từ vựng + không tràn ngang ở 3 viewport + redirect legacy hoạt động. | ✅ apps/e2e/specs/student-practice.spec.ts:190-238 |
| SM-07 | Luyện đề: mở đề seed → nộp → điểm "2/2" hiển thị ngay; bài luyện KHÔNG lọt bảng điểm lớp. | ✅ apps/e2e/specs/student-practice.spec.ts:120-178 |

## Mục 8 — Thực thể nghiệp vụ

Chi tiết đủ ở ERD; ở đây chỉ vai trò nghiệp vụ.

| Thực thể | Vai trò nghiệp vụ | Truy vết |
|---|---|---|
| Bộ từ của tổ chức | Bộ từ giáo viên tạo trong lớp hoặc gửi gợi ý; nguồn "Lớp"/"Gợi ý" | ✅ packages/db/src/schema/vocab.ts:22-51 |
| Từ trong bộ từ | Từ + nghĩa + âm thanh (kho media hoặc URL xa) | ✅ packages/db/src/schema/vocab.ts:61-82 |
| Thẻ SRS của học viên | Trạng thái ghi nhớ per (học viên, từ): mức 1-5, cảnh báo, trạng thái mới/ôn, hạn ôn tuyệt đối, số lần rớt | ✅ packages/db/src/schema/vocab.ts:84-124 |
| Nhật ký luyện | Mỗi lượt trả lời/học: mã client sinh làm khóa, đáp án đúng/sai, thời gian, snapshot từ + nghĩa tại thời điểm luyện | ✅ packages/db/src/schema/vocab.ts:126-157 |
| Gợi ý bộ từ | Lời mời của giáo viên cho học viên: chờ / đã đồng ý / đã ẩn + thời điểm phản hồi | ✅ packages/db/src/schema/vocab.ts:159-203 |
| Khóa học thư viện | 20 khóa dùng chung toàn hệ thống: khóa → bộ → từ (kèm âm thanh URL) | ✅ packages/db/src/schema/vocab-library.ts:1-83, packages/db/src/migrations/0037_cheerful_gambit.sql:1-48 |
| Đề luyện tập (phân hệ B) | Đề IELTS giáo viên soạn trong tổ chức; chỉ bản "sẵn sàng" lộ cho học viên; ghép từ nhiều phần đề | ✅ apps/server/src/routes/student-practice.ts:32-90 |
| Lượt làm bài dùng chung | Bảng lượt làm bài chung với bài giao lớp, phân biệt bằng mode; luyện đề không gắn bài tập lớp | ✅ packages/db/src/schema/quiz-attempt.ts:28-66 |


## Mục 9 — Luồng (danh mục)

Đặc tả đủ (sequence + activity) ở srs/student-practice-reverse-flows.md.

| F-id | Luồng | Một dòng |
|---|---|---|
| F1 | Xem tổng quan luyện từ vựng | Tải 5 chỉ số + gợi ý + danh sách bộ từ + dự báo |
| F2 | Vào bộ từ — cấp thẻ + dữ liệu phiên | Kiểm tra truy cập, cấp thẻ lần đầu, trả hàng đợi |
| F3 | Phiên học từ mới (Learn) | Lật thẻ → minigame → ghi kết quả per từ |
| F4 | Phiên ôn tập (Review) | Pool đến hạn → trả lời → xếp lịch lại |
| F5 | Gợi ý bộ từ của giáo viên | Đồng ý / ẩn gợi ý |
| F6 | Khóa học từ vựng thư viện | Danh mục → chi tiết → mở bộ (cấp thẻ) |
| F7 | Phát âm thanh | Kho media nội bộ hoặc proxy nguồn xa |
| F8 | Duyệt catalog luyện đề và bắt đầu đề | Lọc kỹ năng/bộ sưu tập/tìm kiếm → start attempt |
| F9 | Làm và nộp đề luyện, xem điểm | Resume/retake qua máy attempt chung → tự chấm hoặc chờ Band |

## Mục 10 — Màn hình

- `/practice` — redirect về luyện đọc (FR-01).
- `/practice/vocabulary` — tổng quan: 5 thẻ chỉ số, đồng hồ đếm ngược, danh sách gợi ý, lưới bộ từ + CTA khóa học (S23, S35, S36, S38, S39).
- `/practice/vocabulary/courses` — danh mục khóa học: tìm kiếm debounce, phân trang 12/trang (S26).
- `/practice/vocabulary/courses/:courseId` — chi tiết khóa: các bộ theo khóa, auto-scroll tới bộ "Bắt đầu tại đây" (S27).
- `/practice/vocabulary/:deckId` — chi tiết bộ từ: nút Bắt đầu học / Ôn tập, câu nhắc đợt ôn tiếp theo (S24).
- `/practice/vocabulary/:deckId/session?mode=learn|review` — phiên học/ôn: prompt minigame, panel phản hồi, overlay khích lệ, tổng kết (S25, S31, S32, S33, S34, S40).
- `/vocab`, `/vocab/*` — legacy, redirect (S28, S29, S30).
- `/practice/:skill` — catalog luyện đề theo kỹ năng: tiêu đề + kicker, nút Lịch sử, bộ lọc, lưới thẻ đề (S58, S60, S61, S62).
- `/learn/quizzes/practice/:testId` — làm đề luyện: view làm bài dùng chung, tự chuyển tổng kết khi đã nộp (S59, S65).

## Mục 11 — Ràng buộc

- Deploy "release train": hợp đồng Zod `.strict()` chặn trường lạ → client và worker phải lên cùng phiên bản. ✅ packages/api/src/contracts.ts:3089-3095
- Giới hạn 100 tham số bind của D1 → lô chèn ≤10 thẻ, truy vấn lô 50. ✅ apps/server/src/lib/vocab-provision.ts:24-30
- Âm thanh xa: chỉ 2 miền cho phép đã khai báo, HTTPS, ≤3 redirect, ≤5 MB, timeout 10 giây. ✅ apps/server/src/routes/vocab.ts:167-176
- Server không giữ trạng thái phiên: hàng đợi/pool do client điều phối; server chỉ xác thực từng lượt ghi độc lập (idempotent). ✅ packages/api/src/srs/learn-session.ts:1-14, packages/api/src/srs/review-session.ts:1-14 (đầu module)
- Phân hệ B tái sử dụng bảng lượt làm bài chung với bài giao lớp (mode phân biệt practice/giao;
  không gắn lượt giao; CHECK DB ép assignment ⇒ assignment_id, practice ⇒ test_id) — ✅ packages/db/src/schema/quiz-attempt.ts:28-66;
  nộp bài đi qua endpoint submit dùng chung —
  apps/server/src/routes/student.ts:1919
- Không có catalog i18n: mọi wording là literal tại component (R2). ✅ negative-search trong reverse-gaps.md
- Ngày logic theo Asia/Ho_Chi_Minh. ✅ packages/api/src/vietnam-date.ts:27-29
- Bảng thẻ được recreate ở migration 20 (word_id đa hình trỏ cả từ tổ chức và từ thư viện). ✅ packages/db/src/migrations/0039_ambiguous_prowler.sql:1-2
- Biến môi trường/binding: kho media (R2-compatible), session auth — chỉ tên binding, không có secret trong repo. ✅ apps/server/src/routes/vocab.ts:1183-1190

## Mục 12 — Câu hỏi mở (OQ)

| OQ | Câu hỏi | Bối cảnh | Ảnh hưởng nếu sai |
|---|---|---|---|
| OQ-01 | `student-practice.ts` (catalog luyện đề IELTS) có thuộc feature "student-practice" không, hay là feature riêng chỉ chung tên route? | Plan source ghi tên file này; mã là catalog luyện đề #378, tách bạch với SRS từ vựng | Sai phạm vi: thiếu/đặc tả nhầm cả chu trình luyện đề |
| OQ-02 | Tài liệu gốc `docs/srs-spec.md` (được dẫn §1/§3b/§5 trong code) nằm ở đâu? | Comment code + vectors README dẫn liên tục nhưng file không có trong repo | Không đối chiếu được quy tắc gốc với mã; rủi ro lệch chuẩn ngầm |
| OQ-03 | Mã lỗi `VOCAB_WORD_NOT_FOUND` chỉ dùng ở API giáo viên; phía học viên không bao giờ trả. Có route học viên nào định dùng không? | contracts khai báo trong nhóm lỗi vocab | Ma trận lỗi thừa/thiếu |
| OQ-04 | Ôn sớm không ghi log/đổi lịch là chủ ý "luyện tự do" hay hạn chế tạm thời? Học viên luyện sớm có nên được ghi nhận vào streak/retention? | vocab.ts từ chối ghi khi chưa đến hạn (BR-04) | Đổi hợp đồng answer + metrics chuỗi ngày |
| OQ-05 | Cửa sổ "sắp đến hạn" 1 giờ: tại sao 3.600.000 ms? Có yêu cầu nghiệp vụ về nhắc "sắp đến hạn" không? | hằng số UPCOMING_WINDOW_MS | Nhầm thông báo nhắc học |
| OQ-06 | Mốc lịch cố định của bộ thư viện (thời điểm epoch cố định) khi thẻ đầu chưa có: ý đồ là đồng bộ cả khóa hay chỉ fallback an toàn? | BR-09 | Lịch ôn cả khóa dồn một ngày ngoài ý muốn |
| OQ-07 | Hàng đợi từ mới không giới hạn số lượng (lấy toàn bộ sắp theo hạn): bộ từ vài trăm từ thì phiên có quá dài? | selectNewCards không cap | UX phiên quá dài; cân nhắc cap theo ngày |
| OQ-08 | Nhãn "Thành thạo (L5) · Nhớ" — chữ "Nhớ" có phải một trạng thái nghiệp vụ riêng hay chỉ trang trí nhãn? | overview stat label | Nhầm hai khái niệm mức 5 và "nhớ" |
| OQ-09 | % nhớ (retention) hiện tính trên toàn bộ lượt luyện không phân hạn: có cần theo cửa sổ thời gian (7/30 ngày) như thước đo SRS chuẩn? | BR-07, SM-05 | Thước đo không phản ánh khả năng ghi nhớ dài hạn |
| OQ-10 | Ôn sớm khi hết thẻ đến hạn (fallback toàn bộ pool): nghiệp vụ có khuyến khích ôn sớm không, hay chỉ để "có gì đó để làm"? | FR-16, BR-04 | Học viên hiểu nhầm ôn sớm vẫn đếm tiến độ |
| OQ-11 | Gợi ý chữ cái đầu chỉ áp dụng mức ≤2: ngưỡng này theo tài liệu gốc hay chọn tay? | quiz-rules typingHint | Hỗ trợ học viên lệch mức |
| OQ-12 | Tự-đánh-giá (self-check) không có chấm tự động: học viên có thể tự bấm "nhớ" sai — có cần đối chiếu với kết quả gõ/chọn sau đó? | quiz-generator hạng C | Độ tin cậy của mức 5 thấp hơn kỳ vọng |
| OQ-13 | Phân hệ B định vị là "tự luyện ngoài điểm lớp": mục tiêu nghiệp vụ gốc (AI đề xuất đề? gợi ý theo band?) chưa có tài liệu xác nhận — hiện chỉ có catalog tĩnh theo kỹ năng. | #378 phase 10; e2e + comment hợp đồng | Sai kỳ vọng lộ trình (đề xuất cá nhân hóa) khi lập kế hoạch tiếp |
| OQ-14 | Gợi ý bộ từ của GV: ngoài danh sách trên tổng quan có kế hoạch kênh nhắc khác (notification/badge) không? Mục tiêu "kéo học viên vào bộ từ mới" chưa có tài liệu. | vocab_suggestion chỉ hiển thị tại tổng quan | Thiếu kênh chạm học viên; gợi ý bị bỏ lỡ |
| OQ-15 | Phát âm hiện chỉ trong màn làm bài: trang chi tiết bộ từ có cần nút nghe thử từng từ không? | vocab-pronunciation-buttons dùng trong prompt; trang deck không có | UX học từ thiếu nghe thử ngoài phiên |
