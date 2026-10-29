# Tư vấn: chọn model AI theo tác vụ, tối ưu chi phí và giá subscription

Ngày: 2026-10-25. Bối cảnh: giai đoạn A0/A trong [project-roadmap](../../docs/project-roadmap.md); chi phí AI do hệ thống trả, tính vào gói subscription của giáo viên; LLM provider chưa chốt.

## Giả định và độ tin cậy

- Giá Claude lấy từ bảng giá trong skill `claude-api` (cache ngày 2026-10-06), USD / 1M token: Haiku 5.5 $0.10 in / $0.50 out (prompt ≤100K); Sonnet 5.5 $2 / $10; Opus 5.5 $4 / $20; Fable 5.1 $10 / $50. Cache read ≈ 0.1× giá input, Batch API giảm 50%.
- Giá speech-to-text lấy từ bài tổng hợp bên thứ ba, **cần kiểm lại trên trang giá của từng hãng trước khi chốt**: OpenAI gpt-4o-transcribe ≈ $0.006/phút (mini ≈ $0.003); Groq Whisper Large v3 Turbo ≈ $0.00067/phút; Deepgram Nova-3 ≈ $0.004–0.008/phút (nguồn mâu thuẫn).
- Số token mỗi tác vụ là **ước tính của tôi**, chưa đo trên dữ liệu thật. Quy đổi VND dùng ~25.500 đ/USD, chỉ để hình dung.
- Claude API nhận văn bản, ảnh, PDF nhưng không nhận audio, nên chấm Speaking cần thêm bước chuyển giọng nói thành văn bản (STT).

## 1. Model theo tác vụ

| Tác vụ | Model đề xuất | Lý do | Chi phí ước tính / lần |
|---|---|---|---|
| Chấm Writing (4 tiêu chí IELTS + sửa lỗi) | **Sonnet 5.5** (effort `medium`); Haiku 5.5 cho chế độ "chấm nhanh" | Độ chính xác band là giá trị cốt lõi; Sonnet đắt gấp ~17 lần Haiku nhưng vẫn chỉ ~$0.03 | Haiku ≈ $0.002 · Sonnet ≈ $0.027 · Opus ≈ $0.053 |
| Chấm Speaking | STT rẻ (Groq Whisper) + **Sonnet 5.5** chấm transcript | Claude không nhận audio; STT chiếm chi phí đáng kể nếu dùng hãng đắt | STT 12 phút: ≈ $0.008 (Groq) đến ≈ $0.07 (OpenAI); LLM ≈ $0.033 |
| Nhập đề bằng AI (PDF/ảnh → đề có cấu trúc) | **Sonnet 5.5**, chạy Batch | Cần giữ đúng cấu trúc passage/câu hỏi/đáp án; làm một lần, dùng lại nhiều lần | Sonnet ≈ $0.14 (Batch ≈ $0.07) · Haiku ≈ $0.007 · Opus ≈ $0.28 |
| Tạo bài tập (dictation, từ vựng, câu hỏi) | **Haiku 5.5**, nâng lên Sonnet nếu kiểm tra lỗi | Đầu ra ngắn, có quy tắc rõ, giáo viên duyệt lại | Haiku ≈ $0.002 · Sonnet ≈ $0.032 |
| Trợ giảng chat (có công cụ: xem lớp, giao bài) | **Haiku 5.5** mặc định, tự nâng lên Sonnet 5.5 khi nhiều bước hoặc công cụ lỗi | Phần lớn lượt chat đơn giản; prefix hệ thống cache được | Haiku ≈ $0.0006/lượt · Sonnet ≈ $0.011/lượt |
| Nháp báo cáo gửi phụ huynh | **Haiku 5.5**, chạy Batch được | Dữ liệu có sẵn, văn phong mẫu | ≈ $0.0006 |
| Giải thích đáp án cho học viên | **Haiku 5.5**, cache theo câu hỏi | Một câu hỏi giải thích một lần, dùng cho mọi học viên | gần như 0 sau lần đầu |

Không cần Fable 5.1 cho bất kỳ tác vụ nào ở trên. Opus 5.5 chỉ đáng thử cho chấm Writing nếu bộ đánh giá (mục 4) cho thấy chênh lệch band rõ so với Sonnet.

## 2. Ví dụ tổng chi phí một giáo viên (ước tính)

Giáo viên 30 học viên, mỗi tháng 120 bài Writing, 60 bài Speaking, 5 đề nhập bằng AI, 30 bài tạo bằng AI, 300 lượt chat, 30 báo cáo:

| Hạng mục | USD / tháng |
|---|---|
| Writing (Sonnet) | ≈ 3,2 |
| Speaking (Groq + Sonnet) | ≈ 2,4 |
| Nhập đề (Sonnet, Batch) | ≈ 0,35 |
| Tạo bài, chat, báo cáo (chủ yếu Haiku) | ≈ 1,0 |
| **Tổng** | **≈ 7 (khoảng 180 nghìn đồng)** |

Giáo viên 100 học viên: khoảng $25. Nếu dùng OpenAI cho STT thay Groq, Speaking tăng thêm ~$4 cho 60 bài.

## 3. Cách giữ chi phí thấp

1. **Cache rubric và hướng dẫn chấm** (phần cố định, ~3K token): đọc cache chỉ ~0,1× giá input. Đặt phần thay đổi (bài làm) sau điểm cache.
2. **Haiku trước, Sonnet khi cần**: định tuyến theo tác vụ như bảng trên; nâng cấp khi đầu ra không qua kiểm tra schema.
3. **Batch cho việc không gấp** (nhập đề, nháp báo cáo): giảm 50%.
4. **Giới hạn effort và `max_tokens`**: dùng `medium` hoặc thấp hơn cho chấm bài; chặn đầu ra dài bất thường. Lưu ý Sonnet 5.5 và Opus 5.5 không tắt được thinking (chỉ chỉnh effort).
5. **Chống trùng lặp**: băm nội dung bài/đề; đề nhập bằng AI nên dùng chung qua thư viện đề (admin library) để nhiều giáo viên không trả tiền nhập cùng một đề.
6. **Đầu ra có cấu trúc** (structured outputs) để không phải gọi lại khi parse lỗi. Không dùng `tool_choice` cưỡng bức trên Sonnet 5.5/Opus 5.5 (trả 400).
7. **Hạn mức cứng theo org** kèm cảnh báo ở 80% và 100%, ghi nhận `usage` từng lần gọi (nền tảng của A0).
8. **AI chỉ là bản nháp**: kết quả chấm lưu riêng (`ai_*`), giáo viên chốt điểm. Điều này cũng giảm rủi ro khi AI lệch band.

## 4. Chọn model bằng dữ liệu, không bằng cảm tính

Teacher OS đã có điểm và chú thích do giáo viên chấm (`quiz_attempt`, `quiz_attempt_annotation`). Dùng làm bộ đánh giá:

- Lấy 100–200 bài Writing/Speaking đã chấm, chạy Haiku, Sonnet, Opus với cùng rubric.
- Đo sai lệch band trung bình so với giáo viên (MAE), tỷ lệ lệch ≥1 band, và chất lượng nhận xét (giáo viên đánh giá mù).
- Chọn model rẻ nhất có MAE đạt ngưỡng chấp nhận (ví dụ ≤0,5 band). Đo lại mỗi khi đổi model hoặc rubric.
- Hạn chế đã biết: chấm Speaking từ transcript không đánh giá được phát âm; nên gắn nhãn "gợi ý, chưa đánh giá phát âm" hoặc thử mô hình nhận audio trực tiếp (ví dụ Gemini, giá audio chưa kiểm chứng) cho riêng tiêu chí này.

## 5. Thiết kế gói subscription và hạn mức

Dùng **credit AI** thay vì để giáo viên tự hiểu token. Quy ước 1 credit ≈ chi phí một lần chấm Writing (~$0,03):

| Tác vụ | Credit |
|---|---|
| Chấm Writing | 1 |
| Chấm Speaking (gồm STT) | 2 |
| Nhập đề bằng AI | 5 |
| Tạo bài tập bằng AI | 0,5 |
| Lượt chat trợ giảng | 0,2 (hoặc dùng thoải mái trong giới hạn hợp lý) |
| Nháp báo cáo, giải thích đáp án | 0,1 |

Nguyên tắc định giá: **chi phí AI không quá 25–30% giá gói** (chừa chỗ cho hạ tầng, hỗ trợ, lợi nhuận). Ví dụ minh họa, giá gói là giả định chờ bạn quyết:

| Gói | Giá giả định | Ngân sách AI (≤30%) | Credit gồm trong gói | Ghi chú |
|---|---|---|---|---|
| Dùng thử | 0 | $1 một lần | 30 | Hết là dừng, không tự trừ tiền |
| Cơ bản | 190.000 đ/tháng (~$7,5) | ~$2,2 | ~70 | Chấm Writing, tạo bài |
| Chuyên nghiệp | 490.000 đ/tháng (~$19) | ~$5,7 | ~190 | Thêm Speaking, nhập đề |
| Trung tâm (nhiều nhân sự) | tính theo số chỗ + credit gộp chung | theo giá | gộp theo org | Cần giai đoạn C để phân quyền và chia hạn mức |

Khi hết credit: ưu tiên **mua thêm gói credit** (giá mỗi credit cao hơn trong gói), hoặc hạ xuống chế độ Haiku "chấm nhanh" nếu muốn mềm hơn; chặn hẳn tác vụ đắt nhất (Speaking, nhập đề) trước. Với ví dụ ở mục 2 (≈ $7/tháng), gói Chuyên nghiệp chỉ vừa đủ cho giáo viên khoảng 30 học viên; giáo viên lớn hơn cần gói cao hơn hoặc mua thêm.

## 5b. Chốt credit theo gói (giá mục tiêu 200–500 nghìn đồng/tháng, 2026-10-25)

Thay cho bảng gói minh họa ở mục 5. Chi phí thực tế ~ $0,027 mỗi credit (Writing Sonnet), quy đổi ~690 đ/credit ở 25.500 đ/USD; ngân sách AI ≤ ~30% giá gói.

| Gói | Giá | Credit / tháng | Chi phí AI tối đa | Tỷ lệ trên giá |
|---|---|---|---|---|
| Dùng thử | 0 đ | 30 (một lần) | ~$0,8 | không áp dụng |
| Cơ bản | 200.000 đ | 70 | ~48.000 đ | ~24% |
| Chuyên nghiệp | 350.000 đ | 130 | ~90.000 đ | ~26% |
| Nâng cao | 500.000 đ | 200 | ~138.000 đ | ~28% |

Quy tắc đi kèm:

- **Bảng trừ credit:** Writing 1, Speaking 2, nhập đề bằng AI 5. Chat trợ giảng, nháp báo cáo, giải thích đáp án và tạo bài bằng Haiku (chi phí dưới $0,002 mỗi lần) không trừ credit nhưng có giới hạn công bằng (ví dụ 100 lượt mỗi ngày mỗi org). Khi tác vụ tự nâng lên Sonnet thì trừ 0,5 credit.
- **Hết credit:** chặn Speaking và nhập đề; Writing vẫn dùng được chế độ "chấm nhanh" bằng Haiku tới trần 30 lượt mỗi tháng; sau đó mời mua thêm.
- **Gói credit mua thêm:** 100 credit giá 149.000 đ (chi phí ~69.000 đ, biên ~50%). Credit mua thêm hết hạn sau 12 tháng; credit trong gói reset mỗi tháng, không cộng dồn.
- **Học viên vãng lai công khai (giai đoạn B):** có trần riêng theo org và theo địa chỉ, trừ vào credit của giáo viên, không có luồng chấm AI miễn phí.

Độ phủ thực tế (một học viên dùng AI ~4 credit mỗi tháng, tức 2 bài Writing và 1 bài Speaking): Cơ bản phục vụ ~17 học viên, Chuyên nghiệp ~32, Nâng cao ~50. Nếu giáo viên chấm AI mạnh tay hơn (4 Writing + 2 Speaking = 8 credit mỗi học viên), con số giảm một nửa. Kịch bản 30 học viên ở mục 2 (~$7, khoảng 260 credit) không vừa gói Nâng cao nếu giữ tỷ lệ chi phí ≤30%; giáo viên đó sẽ mua thêm credit hoặc đổi sang gói Trung tâm.

Giả định chưa kiểm chứng: tỷ lệ credit không dùng hết (có thể 30–40%), số credit mỗi học viên mỗi tháng, giá quy đổi USD/VND. Số liệu thực tế từ A0 (đo usage) nên dùng để chỉnh lại sau 1–2 tháng đầu.

## 6. Rủi ro cần lường trước

- **Dữ liệu học viên và audio gửi cho bên thứ ba**: cần điều khoản/đồng ý của giáo viên và học viên (đặc biệt học viên chưa thành niên), chính sách lưu giữ, và đối chiếu quy định bảo vệ dữ liệu cá nhân của Việt Nam. Chọn nhà cung cấp cho phép không dùng dữ liệu để huấn luyện.
- **Ràng buộc nhà cung cấp**: giữ một lớp trừu tượng (LLM, STT) để đổi nhà cung cấp mà không sửa nghiệp vụ.
- **Biến động giá**: giá trong báo cáo này sẽ lỗi thời; lưu bảng giá trong cấu hình, không hard-code, và tính credit theo chi phí thực tế ghi nhận.
- **Lạm dụng**: giới hạn kích thước file, số trang, tần suất gọi theo org; học viên vãng lai công khai (giai đoạn B) là bề mặt dễ bị lạm dụng nhất cho chấm AI.

## Câu hỏi còn mở

- Giá gói mục tiêu của giáo viên là bao nhiêu (để chốt số credit và biên lợi nhuận)?
- Ngưỡng sai lệch band chấp nhận được khi AI chấm là bao nhiêu, và AI có được hiển thị điểm cho học viên trước khi giáo viên chốt không?
- Chấp nhận STT + chấm transcript (không đánh giá phát âm) cho phiên bản đầu, hay cần đánh giá phát âm ngay?
- Chốt nhà cung cấp LLM và STT sau khi chạy bộ đánh giá ở mục 4.

## Nguồn

- Bảng giá Claude: skill `claude-api` (cache 2026-10-06).
- [OpenAI Transcribe & Whisper API Pricing (Oct 2026)](https://costgoat.com/pricing/openai-transcription)
- [Speech-to-Text API Pricing 2026: Per-Minute Rates Compared](https://convertaudiototext.com/blog/speech-to-text-api-pricing-2026)
- [6 Best Speech-to-Text APIs in 2026](https://www.cometapi.com/best-speech-to-text-apis/)
- [Gemini API Pricing (2026)](https://www.morphllm.com/gemini-api-pricing) (giá audio chưa xác minh)
