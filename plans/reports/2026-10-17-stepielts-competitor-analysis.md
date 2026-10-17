# Phân tích đối thủ: stepielts.com/student (Step IELTS)

Ngày: 2026-10-17 · Người phân tích: ZCode (RE skill `reverse-engineer-anything`)

## Cách thu thập bằng chứng

| Nguồn | Phương pháp | Ghi chú giới hạn |
|---|---|---|
| Runtime portal học viên | AppleScript `execute javascript` trên tab nền Chrome thật đã login (tài khoản free "Miễn phí") | Quan sát DOM/URL; synthetic event không mở được popup từ điển (isTrusted) — cơ chế "tra từ" xác nhận qua trang /huong-dan |
| REA static | `rea analyze-javascript-application` trên 21 JS chunks Next.js tải từ CDN | Evidence `ev_c7c18214a6fa0dab33b5da067be979202cd7b647c303ba13ff6e7824da95ef77`, bundle sha256 `ae0a4603…`, 322 modules, coverage **partial** (3 chunk lớn bị resource constraint; Next.js RSC giữ phần lớn logic phía server — bundle không phải toàn bộ app) |
| Repo Teacher OS | Explore agent đọc `apps/student`, `apps/web`, `packages/api/src/contracts.ts` | Đầy đủ tính năng student app hiện tại |

Không tác động phụ: không nộp bài, không tiêu quota AI/mocktest, không submit khảo sát; tab phân tích đã đóng.

## Step IELTS là gì

Next.js App Router + Server Actions, Supabase (storage ảnh cover/audio), Cloudflare. Model **hybrid**: tự luyện freemium cho học viên lẻ + trung tâm Step IELTS xếp lớp (khi có lớp, lịch + bài tập hiện ở Tổng quan).

## Tính năng Step IELTS phía học viên (quan sát được)

### Kho nội dung tự luyện (điểm mạnh lớn nhất)
- **Reading 351 bài** (22 trang): filter theo Passage 1/2/3, nguồn (Cambridge C10–C19, "Forecast" theo quý, Actual Test, Collection, Step IELTS), dạng câu hỏi (TFNG/YNNG, Matching Headings/Information/Features, Gap Filling, Map-Diagram Label, MCQ 1/nhiều đáp án), tìm kiếm; mỗi bài hiện các dạng câu hỏi có trong đề + "Best score".
- **Listening 498 bài** (32 trang): filter Section 1–4, nguồn; "audio giọng bản xứ, chữa bài có transcript".
- **Writing 365 đề** (23 trang): filter Task 1/2, nguồn, dạng biểu đồ, dạng đề (Discussion, Agree-Disagree, Two-Part, Adv-Disadv, Positive-Negative), **chủ đề**; "Band cao nhất" mỗi đề.
- **Speaking 284 topic** (Part 1: 95, Part 2: 68, Part 3: 121): theo Forecast Q3; mỗi topic hiện "Tiến độ x/y câu".
- **Từ vựng 30 bộ**: mỗi bộ 3 chế độ riêng (Flashcard / Quiz / Writing) với % tiến độ từng chế độ; một số bộ sinh từ chính bài đọc (VD `[C16T4] Roman tunnels · 40 cặp từ`).

### Chế độ làm bài
- **Popup chọn chế độ mỗi bài**: 📚 Luyện tập (đồng hồ đếm **lên**, Reading được tra từ điển, Listening có nút điều khiển) vs 📝 Thi thật (đồng hồ đếm ngược **đổi màu**, Reading lẻ 20'/full 60', Writing Task1 20'/Task2 40', **hết giờ tự nộp**, **không tra từ**, **audio phát 1 lần không tua**).
- Reading practice: split passage|câu hỏi, **🚩 đánh dấu từng câu**, bôi đen → chuột phải **Tra nghĩa / Bôi vàng (highlight) / Ghi chú (giấy nhớ)**.
- Sau nộp: điểm + đáp án + **"Xem giải thích" từng câu** (cách tìm keyword, đối chiếu); Listening nghe lại kèm transcript.

### Writing có "giàn giáo" (scaffold) từng đề
- Panel **HƯỚNG DẪN VIẾT BÀI**: ý chính 2 đoạn thân bài (EN+VN), model answer chia Mở bài/Thân bài 1/Thân bài 2/Kết bài với cấu trúc Main idea–Explain–Example, mục **Từ vựng & Collocation** (~20 mục: EN—nghĩa VN + ví dụ + dịch).
- Ô viết theo từng phần (Introduction/Body 1/Body 2/Conclusion), đếm từ live "Số từ: 0 / tối thiểu 250".
- Nút **✨ Chấm điểm**: AI trả band + "đoạn sửa highlight" + giải thích lỗi theo 4 tiêu chí.

### Speaking
- **🎙 Micro check** (thanh sóng nhảy để test mic), nghe đề bằng loa, ghi âm, nghe lại, **lời thoại tự động** (transcript), AI chấm 4 tiêu chí Phát âm / Ngữ pháp / Từ vựng / Trôi chảy.

### Thi thử (Mocktest)
- Flow 3 bước: Khảo sát (7 câu: mục tiêu IELTS — xét tuyển/du học/việc làm…, "Band mục tiêu của bạn là?") → Làm bài (mỗi phần 1 lần) → Kết quả: **band từng kỹ năng + overall**, xem lại từng phần.

### Lịch sử & tiến độ (analytics học viên)
- 🔥 **Chuỗi ngày học** (streak) + số bài trong 7 ngày.
- **Heatmap chăm chỉ** kiểu GitHub theo tháng/tuần, bấm tuần để xem thống kê.
- Bảng tuần: mỗi ngày × {Reading, Listening, Writing, Speaking, Từ vựng, Thời gian}.
- Tab lịch sử chi tiết theo từng kỹ năng, xem lại từng lượt làm.

### Tổng quan & lịch (khi có lớp)
- Mỗi lớp **3 vòng tiến độ: Lớp học / Chuyên cần / Bài tập**; **banner cam nhắc bài chưa hoàn thành** (bấm nhảy tới).
- Lịch học dạng **calendar tháng**, ngày có buổi được tô, bấm xem chi tiết.

### Account & monetization
- Hồ sơ + **bảng hạn mức**: free được Reading/Listening/Vocab vô hạn; AI chấm Writing 30 lượt, Speaking 15 lượt, Mocktest 1 lượt (cấp 1 lần).
- **Gói Pro**: 70k/tháng, 189k/3T (63k), 344k/6T (57k); thanh toán **chuyển khoản QR, tự kích hoạt**.
- **"Có mã từ giáo viên?"** — nhập mã mở khoá AI chấm + thi thử.

### Phía giáo viên (/admin + guide)
- Gói quản lý lớp: **Lớp nhỏ 130k/tháng (≤20 HV)**, **Lớp lớn 450k/tháng (≤100 HV)**; "mở trung tâm riêng" tự tạo không cần duyệt.
- Tạo lớp **tự sinh buổi** (số buổi, thứ, giờ, khai giảng), thêm HV bằng tên/email, **Gia hạn khoá / Đổi lịch học**.
- **Điểm danh** từng buổi: Có mặt / Đi muộn / Vắng + ghi chú.
- **"Giao cho lớp"** ngay trên thẻ bài bất kỳ trong kho → học viên thấy ở Tổng quan; xem tiến độ từng HV.
- **Soạn bài** 4 kỹ năng (Listening: upload MP3 + text có chỗ trống `[N]` + đáp án).
- **Nhận xét học viên** + toggle **"Cho phụ huynh xem"** (role phụ huynh tồn tại).
- **Thẻ Pro cho học viên**: mua bulk 70k → 65k (từ 20 thẻ) → 55k (từ 100 thẻ), thẻ chưa dùng không hết hạn, phát mã cho HV.
- Dashboard số liệu giáo viên (giờ, ca, ngày, lớp, học viên; KPI tích luỹ + biểu đồ ngày/6 tháng) + Lịch dạy.

### Platform
- **PWA "⬇️ Cài ứng dụng"**, widget **"Báo lỗi / Góp ý🐞"** (endpoint `/api/bao-loi`), trang **/huong-dan** đầy đủ + nút ? nổi, hỗ trợ Zalo/Facebook.

## So sánh với Teacher OS student app

| Nhóm | Step IELTS | Teacher OS hiện tại | Họ hơn? |
|---|---|---|---|
| Kho nội dung tự luyện | 1.500+ bài/đề built-in, filter đa chiều | Không có (bài tập do giáo viên ra) | ✋ rõ rệt |
| Chế độ thi thật | Đếm ngược, tự nộp, khóa audio, cấm tra từ | Take screen **không có timer** | ✋ |
| Đánh dấu câu 🚩 | Có, từng câu | Không | ✋ |
| Từ điển/highlight/ghi chú khi đọc | Có (selection menu) | Không | ✋ |
| Audio Listening | Player 1-lần (thi) / thoải mái (luyện) + transcript | **Chỉ tên file text** (gap lớn) | ✋✋ |
| Giải thích từng câu | Mặc định từng câu (keyword methodology) | "Note giáo viên" optional, reveal sau nộp | ✋ |
| Writing scaffold | Model answer + ý chính EN/VN + collocations theo đề | Chỉ đề + min words | ✋ |
| Chấm Writing/Speaking | **AI theo quota**, band + đoạn sửa + 4 tiêu chí | Giáo viên chấm tay (band 4 tiêu chí + annotation inline) | ✋ (AI) / ≡ (độ sâu chấm tay Teacher OS tốt) |
| Speaking | Ghi âm trong app + transcript + AI phát âm | Upload file media | ≡ mỗi bên một kiểu |
| Analytics học viên | Streak + heatmap + bảng tuần/thời gian | Không có | ✋ |
| Mocktest full 4 skill | Survey 7 câu + band overall | Full Test Builder (preset slot) — không survey, không overall view | ✋ một phần |
| Từ vựng | Flashcard + quiz + writing mode | Không có | ✋ |
| Lịch học | Calendar tháng riêng | Chỉ danh sách buổi trong class detail | ✋ nhẹ |
| Bài tập lớp | Giao từ kho, tiến độ từng HV | Assignment per class, autosave/resume, verdict, chống double-submit | ≡ (Teacher OS sâu hơn về attempt) |
| Học phí/thanh toán | Mua gói Pro (QR tự kích hoạt) | Invoice + VietQR + Bank Hub SePay, phân biệt đã đóng/còn lại | Teacher OS tốt hơn (uso case trung tâm) |
| Onboarding | Survey trong mocktest | Wizard onboarding 4 bước riêng | ≡ |
| Phụ huynh | Role xem nhận xét | Không | ✋ |
| Monetization SaaS | Sub giáo viên + thẻ Pro HV + quota | Chưa có | ✋ |
| PWA / báo lỗi / guide | Có cả 3 | Không | ✋ nhẹ |
| Multi-org | Không thấy | Org switcher + x-student-org-id | Teacher OS hơn |

## Đề xuất "copy" (ưu tiên theo giá trị/công sức)

### P1 — rẻ, làm ngay được trong kiến trúc hiện có
1. **Timer cho quiz take screen**: chế độ "Thi thật" per assignment (đếm ngược, tự nộp khi hết giờ; ẩn note/gợi ý). Không cần schema mới nhiều — thêm config thời lượng vào assignment + client countdown.
2. **🚩 Flag câu trước nộp**: client state + cảnh báo "còn câu đánh dấu chưa xem lại" khi nộp (Teacher OS đã có guard câu trống — mở rộng).
3. **Listening audio player + transcript**: Teacher OS đã có media pipeline R2 cho Speaking — tái dùng cho Listening assignment (teacher upload MP3 khi soạn; transcript hiển thị sau nộp). Đây là gap lớn nhất hiện tại.
4. **Explanation per question**: thêm field `explanation` vào question schema (Zod contract), render ở màn review sau nộp, teacher soạn khi ra đề.
5. **Trang Lịch sử làm bài**: tổng hợp attempts theo kỹ năng/thời gian (data đã có — chỉ thiếu view) + streak đơn giản.
6. **PWA + widget Báo lỗi/Góp ý + trang hướng dẫn**: manifest + endpoint `/api/feedback` + trang guide tĩnh.

### P2 — trung bình
7. **AI pre-grade Writing** (band + lỗi + 4 tiêu chí draft) trước khi giáo viên chấm — reuse server + LLM API; hiển thị như "gợi ý chấm sơ bộ", giáo viên vẫn chấm cuối. Mở đường monetization quota sau này.
8. **Writing scaffold AI-generate**: khi teacher tạo writing assignment, AI sinh sẵn ý chính/model answer/collocations (giữ editing tay). Giảm gánh nặng nội dung so với mô hình "1.500 đề built-in" của Step IELTS.
9. **Highlight + ghi chú trong reading paper** (selection → menu nhỏ), lưu per attempt.
10. **Từ vựng flashcard gắn assignment**: deck tự sinh từ đề reading (AI trích cặp từ), 3 chế độ học/quiz/viết với % tiến độ.
11. **Mocktest survey + overall band view** cho Full Test (Teacher OS đã có full test builder; thiếu bước khảo sát mục tiêu + màn kết quả tổng hợp 4 kỹ năng + so band mục tiêu từ onboarding — dữ liệu onboarding đã có!).

### P3 — chiến lược
12. **Kho bài dùng chung trong org** (shared assignment library + filter/search như Step IELTS) — hiện assignment là per-teacher; đưa về library chia sẻ để org tích luỹ nội dung.
13. **Role phụ huynh** xem nhận xét + tiến độ con (Teacher OS đã có tuition/invoice — phụ huynh là stakeholder tự nhiên).
14. **Monetization SaaS** (khi sẵn sàng): sub giáo viên theo sĩ số lớp + quota AI; tham chiếu giá đối thủ 130k/450k/tháng, thẻ Pro 55–70k.

## Teacher OS đang tốt hơn (giữ và dẫn đầu)
Autosave/resume attempt + keepalive, chống double-submit cross-tab, annotation inline trên essay, diagram/map pin overlay, verdict chi tiết, hệ thống học phí/invoice + VietQR/Bank Hub, multi-org, notification mời lớp, onboarding wizard.

## Chưa quan sát được (unknowns)
- Màn kết quả AI chấm thật (tốn lượt — không chạy), flow thi thử thật, UI flashcard chi tiết (event tổng hợp không mở được), toàn bộ /admin ngoài trang goi-cua-toi, parent view thật tế.
- Bundle client không chứa logic server (Next.js RSC) — REA coverage partial, các kết luận phía teacher dựa trên guide + trang goi-cua-toi.

## File bằng chứng thô
`/tmp/stepielts/` — page-*.json (DOM từng trang), rea-bundle-evidence.json (REA Evidence), all-srcs.txt, bundle/ (21 chunks).
