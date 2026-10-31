# Báo cáo Duyệt Nội dung Bài Kiểm tra Đầu vào (30 câu) — `apps/profile`

- **Issue:** [#511](https://github.com/vinh19410/teacher-os/issues/511)
- **Plan:** `plans/261031-0736-511-profile-placement-test/plan.md`
- **File cấu hình đề:** `apps/profile/public/kiem-tra-dau-vao/questions.json`
- **Trạng thái hiện tại (`status`):** `draft` *(chờ cô Đỗ Thị Thục Mỹ xác nhận trước khi chuyển sang `approved`)*
- **Ngày tạo bản nháp:** 2026-10-31

---

## 1. Bảng Ngưỡng Quy đổi Điểm → CEFR & Khóa học Đề xuất (D6)

| Tổng điểm (/30) | Mức CEFR ước tính | Mã khóa học (`LEAD_COURSES`) | Tên hiển thị trên Form Đăng ký |
|---|---|---|---|
| **0 – 8** | **A1** | `ielts-foundation` | IELTS Foundation (0–3.0) |
| **9 – 15** | **A2** | `ielts-first-step` | IELTS First Step (3.0–4.0) |
| **16 – 22** | **B1** | `ielts-pre` | Pre-IELTS (4.0–5.0) |
| **23 – 30** | **B2+** | `ielts-advanced` | IELTS Advanced (6.0–7.0+) |

> **Lưu ý:** Trên màn hình kết quả, khóa học được ghi rõ là **gợi ý tham khảo** dựa trên điểm Đọc – Ngữ pháp – Từ vựng & Nghe. Khi chuyển sang form đăng ký, học viên vẫn có thể đổi sang các khóa Tiếng Anh Giao Tiếp / Công Sở hoặc đặt lịch kiểm tra kỹ năng Nói 1-1 cùng cô Mỹ.

---

## 2. Phần 1: Vocab + Grammar (15 câu: 8 Grammar, 7 Vocab — A1 đến C1)

Phân bổ vị trí đáp án đúng (`answer`): `A (0): 6 câu`, `B (1): 4 câu`, `C (2): 3 câu`, `D (3): 2 câu` — trộn xen kẽ không theo quy luật lặp.

| Mã câu | Phân loại | CEFR | Nội dung câu hỏi (`prompt`) | Các lựa chọn (`A / B / C / D`) | Đáp án đúng | Chủ điểm kiến thức kiểm tra |
|---|---|---|---|---|---|---|
| `vg-01` | Grammar | A1 | My younger brother usually ______ to school by bicycle, but today he is taking the bus because of the rain. | A. go · **B. goes** · C. going · D. went | **B** (`1`) | Thì hiện tại đơn diễn tả thói quen với chủ ngữ số ít (*My younger brother*) đối lập với hành động tạm thời hôm nay. |
| `vg-02` | Vocab | A1 | Could you please speak a little more ______? I am still learning English and cannot catch every word. | **A. slowly** · B. heavily · C. brightly · D. narrowly | **A** (`0`) | Trạng từ chỉ cách thức cơ bản đi với động từ *speak*. |
| `vg-03` | Grammar | A1 | There aren't ______ empty seats left in the front row of the lecture hall. | A. much · B. some · **C. any** · D. a | **C** (`2`) | Lượng từ trong câu phủ định đi với danh từ đếm được số nhiều (*empty seats*). |
| `vg-04` | Vocab | A2 | Students who want to borrow reference books for the weekend must ______ them to the library desk by Monday morning. | **A. return** · B. remind · C. repair · D. replace | **A** (`0`) | Động từ thông dụng trong bối cảnh học đường (*return books to the library*). |
| `vg-05` | Grammar | A2 | While we ______ for the train at the central station last night, the power suddenly went out. | A. wait · B. have waited · C. are waiting · **D. were waiting** | **D** (`3`) | Thì quá khứ tiếp diễn (*were waiting*) diễn tả hành động đang diễn ra thì hành động khác cắt ngang (*went out*). |
| `vg-06` | Vocab | A2 | The community center offers a wide ______ of evening workshops, including photography, pottery, and public speaking. | **A. range** · B. border · C. height · D. piece | **A** (`0`) | Cụm từ cố định (*a wide range of* = đa dạng nhiều loại). |
| `vg-07` | Grammar | B1 | The new training program has made a ______ improvement in how clearly our interns structure their weekly reports. | A. notice · **B. noticeable** · C. noticeably · D. noticing | **B** (`1`) | Ngữ pháp 8 từ loại chức năng: tính từ (*noticeable*) đứng sau mạo từ *a* và trước danh từ *improvement*. |
| `vg-08` | Grammar | B1 | The quality of the vegetables sold at these weekend farmers' markets ______ significantly from season to season. | A. vary · B. varying · **C. varies** · D. have varied | **C** (`2`) | Kỹ thuật bắt Danh từ chính (Head-Noun): chủ ngữ chính là *The quality* (số ít, đứng trước giới từ *of*), không phải *vegetables* hay *markets* → chia *varies*. |
| `vg-09` | Vocab | B1 | To finish the group project on schedule, every team member needs to ______ a concerted effort over the next two weeks. | A. do · **B. make** · C. take · D. create | **B** (`1`) | Collocation chuẩn học thuật: *make a concerted effort* (nỗ lực đồng lòng). |
| `vg-10` | Vocab | B1 | Because of severe weather along the coast, the organizers decided to ______ the outdoor charity run until next Sunday. | **A. put off** · B. turn down · C. look after · D. bring up | **A** (`0`) | Cụm động từ (Phrasal verb): *put off* = trì hoãn (*postpone*). |
| `vg-11` | Grammar | B2 | Had the municipal council invested in flood drainage ten years ago, the downtown district ______ such severe disruption last month. | A. will not suffer · B. did not suffer · C. would not suffer · **D. would not have suffered** | **D** (`3`) | Đảo ngữ câu điều kiện loại 3 (*Had + S + V3/ed, S + would not have + V3/ed*) cho giả định trái với quá khứ (*last month*). |
| `vg-12` | Vocab | B2 | Although the two researchers used different survey methods, they arrived at remarkably similar conclusions that ______ the original hypothesis. | **A. reinforce** · B. exaggerate · C. postpone · D. scatter | **A** (`0`) | Từ vựng học thuật IELTS Reading/Writing: *reinforce a hypothesis* (củng cố giả thuyết). |
| `vg-13` | Grammar | B2 | The environmental policy, the long-term effects of ______ are still being debated by economists, will take effect in January. | A. that · B. what · **C. which** · D. whom | **C** (`2`) | Mệnh đề quan hệ không xác định có giới từ đứng trước đại từ quan hệ chỉ vật (*the long-term effects of which*). |
| `vg-14` | Grammar | C1 | Seldom ______ such a rapid shift in commuter behavior without a corresponding change in public transit fares. | A. urban planners have witnessed · **B. have urban planners witnessed** · C. witnessed urban planners · D. urban planners witnessed | **B** (`1`) | Đảo ngữ với trạng từ phủ định/hiếm khi đứng đầu câu (*Seldom + trợ động từ + S + V*). |
| `vg-15` | Vocab | C1 | While the committee praised the proposal's ambition, several members questioned whether its financial projections were truly ______ in a slowing economy. | **A. feasible** · B. arbitrary · C. obsolete · D. superficial | **A** (`0`) | Từ vựng C1 sắc thái học thuật/kinh tế: *feasible* (khả thi về mặt thực tiễn/tài chính). |

---

## 3. Phần 2: Listening (5 đoạn audio × 3 câu = 15 câu — A2 đến C1)

> **Lưu ý bảo mật đề thi:** Toàn bộ `transcript` dưới đây **chỉ lưu trong tài liệu duyệt nội dung này**, tuyệt đối không xuất hiện trong `apps/profile/public/kiem-tra-dau-vao/questions.json`.
>
> **Lưu ý kỹ thuật & bản quyền audio TTS:** Do môi trường agent không có `MINIMAX_API_KEY`, 5 file MP3 bản nháp (`apps/profile/public/kiem-tra-dau-vao/audio/clip-1.mp3` … `clip-5.mp3`, chuẩn MP3 mono 64 kbps, 24 kHz, mỗi file ~350–450 KB < 2 MB) được tổng hợp bằng giọng đọc tiếng Anh neural qua `edge-tts` + `ffmpeg`. Vì `edge-tts` dùng endpoint không chính thức để phục vụ bản nháp và kiểm thử, cô Mỹ vui lòng nghe duyệt cả 5 đoạn; cô có thể:
> 1. Duyệt dùng luôn hoặc yêu cầu tạo lại bằng dịch vụ TTS thương mại có bản quyền, hoặc
> 2. Tự thu âm theo đúng 5 transcript bên dưới và ghi đè vào `apps/profile/public/kiem-tra-dau-vao/audio/clip-1.mp3` … `clip-5.mp3` trước khi đổi `"status": "approved"`.

### Đoạn 1 (`clip-1`) — Level A2: Thông báo tại thư viện cộng đồng
- **File audio:** `apps/profile/public/kiem-tra-dau-vao/audio/clip-1.mp3`
- **Giọng đọc nháp:** `en-GB-SoniaNeural` (độc thoại hướng dẫn viên thư viện, tốc độ `-8%`, ~65 giây)
- **Giới hạn nghe:** Tối đa 2 lần (`maxPlays: 2`)

**Transcript:**
> "Good morning, everyone, and welcome to the Oakwood Community Library. Before you head upstairs, please listen carefully to a few changes to our services this week. Starting today, the entire second floor is temporarily closed while technicians repair the main air-conditioning system. We know many of you use the second-floor carrels for exam preparation, so we have set up twenty quiet study desks in Room one-oh-four on the ground floor, right next to the garden entrance. Please note that group discussions are not permitted in Room one-oh-four, though you are still welcome to use the ground-floor café for group work. If you need any reference books that are usually kept on the second floor, simply write the title on a request slip at the main reception lobby, and a staff member will fetch them for you within fifteen minutes. Finally, a reminder about our weekend hours: on Saturday we will open at nine a.m. as usual, but we will close at five p.m. instead of six p.m. for routine electrical testing. Thank you for your patience, and enjoy your study session."

**Câu hỏi & Đáp án:**
1. **`l-01` (A2):** Why is the second floor of the library closed this week?
   - A. New bookshelves are being installed.
   - **B. The air-conditioning system is being repaired.** *(Đáp án đúng: `1`)*
   - C. A children's art exhibition is being set up.
   - D. The study tables are being repainted.
2. **`l-02` (A2):** Where can visitors use quiet study desks during the renovation?
   - A. In the ground-floor café
   - B. In the basement archive room
   - **C. In Room 104 next to the garden entrance** *(Đáp án đúng: `2`)*
   - D. In the main reception lobby
3. **`l-03` (A2):** What time does the library close on Saturday?
   - A. At 4:30 p.m.
   - **B. At 5:00 p.m.** *(Đáp án đúng: `1`)*
   - C. At 6:00 p.m.
   - D. At 8:00 p.m.

---

### Đoạn 2 (`clip-2`) — Level B1: Hội thoại tư vấn khóa kỹ năng thuyết trình
- **File audio:** `apps/profile/public/kiem-tra-dau-vao/audio/clip-2.mp3`
- **Giọng đọc nháp:** Hội thoại 2 giọng `en-US-AriaNeural` (tư vấn viên) & `en-US-GuyNeural` (học viên), tốc độ `-5%`, ~70 giây
- **Giới hạn nghe:** Tối đa 2 lần (`maxPlays: 2`)

**Transcript:**
> **Advisor:** "Hello, welcome to the Professional Skills Center. How can I help you today?"
> **Participant:** "Hi! I'm interested in signing up for the Practical Presentation Skills workshop starting next month, and I'd like to check the schedule options."
> **Advisor:** "Certainly. We run two evening sections for the six-week course: one on Tuesday evenings and another on Thursday evenings, both from six-thirty to eight-thirty p.m. Both sections are taught by our senior communication coach and have the exact same tuition fee."
> **Participant:** "That's great to hear. I'll definitely take the Thursday evening section then. My department holds a regular project review meeting every Tuesday evening that often runs past six, so Thursday is much safer for me. How large are the classes?"
> **Advisor:** "Because every participant gives live practice talks each week, we cap each workshop group at a maximum of twelve participants. Right now, there are still three spots left in the Thursday group."
> **Participant:** "Perfect, twelve is a very comfortable group size. Do I need to buy a textbook or take a placement test before the first class?"
> **Advisor:** "No textbook is required—all handouts are provided in class. However, before attending the first session, every participant must record and upload a short two-minute self-introduction audio clip to our student portal. The instructor listens to those recordings ahead of time to tailor the feedback for week one."

**Câu hỏi & Đáp án:**
4. **`l-04` (B1):** Why does the man prefer the Thursday evening class over the Tuesday class?
   - A. It is taught by a different instructor.
   - B. It is held closer to his apartment.
   - **C. He has a regular team meeting on Tuesday evenings.** *(Đáp án đúng: `2`)*
   - D. The Thursday class has a lower tuition fee.
5. **`l-05` (B1):** What is the maximum number of participants in each workshop group?
   - A. 8 participants
   - **B. 12 participants** *(Đáp án đúng: `1`)*
   - C. 15 participants
   - D. 20 participants
6. **`l-06` (B1):** What must participants complete before attending the first session?
   - **A. A short two-minute self-introduction audio clip** *(Đáp án đúng: `0`)*
   - B. A written grammar test on the website
   - C. A five-page reading assignment on body language
   - D. A payment for printed textbooks at the front desk

---

### Đoạn 3 (`clip-3`) — Level B1: Hướng dẫn chuyến khảo sát khu bảo tồn đất ngập nước
- **File audio:** `apps/profile/public/kiem-tra-dau-vao/audio/clip-3.mp3`
- **Giọng đọc nháp:** `en-AU-NatashaNeural` (độc thoại hướng dẫn viên sinh thái, tốc độ `-4%`, ~70 giây)
- **Giới hạn nghe:** Tối đa 2 lần (`maxPlays: 2`)

**Transcript:**
> "Good morning, everyone. I'm delighted to have you here at the Riverbend Wetland Reserve for today's ecology field survey. Before we collect our sampling kits, I need to tell you about one adjustment to our morning schedule. Because the overnight rain raised the water level along the boardwalk trail, the rangers are inspecting the wooden planks for another forty minutes. Instead of starting on the boardwalk as printed on your sheet, we will visit the water-testing laboratory first to calibrate our pH meters and examine yesterday's sediment samples, and then head out to the boardwalk trail at ten-thirty. When we do walk onto the wooden trail, please bring your binoculars, waterproof notebooks, and reusable water bottles, but leave any camera tripods in the storage lockers here at the visitor center. The boardwalk is narrow, and tripods block the path for other research groups. In the afternoon, you'll work in pairs around the reed marsh until three p.m. Please make sure you pack up your equipment on time and meet at three-fifteen sharp at the east gate next to the bicycle shelter, where our return bus will pick us up—not at the north parking lot where we arrived this morning."

**Câu hỏi & Đáp án:**
7. **`l-07` (B1):** What change has been made to the morning schedule?
   - A. The boat tour has been cancelled due to high wind.
   - **B. The group will visit the water-testing laboratory before the boardwalk trail.** *(Đáp án đúng: `1`)*
   - C. Lunch will be served an hour earlier at the visitor center.
   - D. The bird-watching session has been moved to the afternoon.
8. **`l-08` (B1):** Which item does the guide remind participants NOT to bring onto the wooden trail?
   - A. Binoculars
   - B. Reusable water bottles
   - **C. Camera tripods** *(Đáp án đúng: `2`)*
   - D. Waterproof notebooks
9. **`l-09` (B1):** Where should participants meet at 3:15 p.m. for the return bus?
   - A. At the north parking lot by the ticket booth
   - B. At the wooden bridge near the reed marsh
   - C. Inside the laboratory lecture room
   - **D. At the east gate next to the bicycle shelter** *(Đáp án đúng: `3`)*

---

### Đoạn 4 (`clip-4`) — Level B2: Thảo luận học thuật về dự án khảo sát không gian xanh đô thị
- **File audio:** `apps/profile/public/kiem-tra-dau-vao/audio/clip-4.mp3`
- **Giọng đọc nháp:** Hội thoại 2 giọng `en-GB-RyanNeural` (giảng viên hướng dẫn) & `en-GB-SoniaNeural` (sinh viên), tốc độ `-2%`, ~75 giây
- **Giới hạn nghe:** Tối đa 2 lần (`maxPlays: 2`)

**Transcript:**
> **Tutor:** "Thanks for sending over the draft of your urban green-space study. You've collected nearly two hundred resident questionnaires across three city parks, which is an impressive start. How do you feel about the initial findings?"
> **Student:** "Well, when we cross-checked the demographic breakdown last night, we noticed a serious limitation in our dataset. Because we distributed the paper questionnaires inside the parks between nine and eleven a.m. on weekdays, almost seventy percent of our respondents were retired residents. Working commuters and university students were barely represented."
> **Tutor:** "That's a classic time-of-day sampling bias, and it's good that you caught it before writing your final conclusions. You don't need to discard the data you already have, nor do you need to extend the deadline by another month. Instead, I'd suggest conducting brief five-minute intercept interviews near the two commuter train exits bordering those parks between five p.m. and seven p.m. over the next three evenings. That will give you a balanced comparison group of working-age residents."
> **Student:** "That makes a lot of sense—and we can use the exact same core questions so the responses are directly comparable. Should we wait until those evening interviews are done before editing the report?"
> **Tutor:** "You can start right away on the methodology section. Revise that section first so it explicitly documents the weekday-morning sampling bias and explains the two-stage collection strategy you used to correct it."

**Câu hỏi & Đáp án:**
10. **`l-10` (B2):** What limitation did the students find in their initial questionnaire data?
    - A. Too few questionnaires were returned by local residents.
    - **B. Most responses came from retired residents visiting parks on weekday mornings.** *(Đáp án đúng: `1`)*
    - C. Several questions about cycling lanes were accidentally left out.
    - D. The online survey link stopped working after the first three days.
11. **`l-11` (B2):** What does the tutor suggest the students do next to balance their sample?
    - **A. Conduct short interviews near commuter train exits between 5 p.m. and 7 p.m.** *(Đáp án đúng: `0`)*
    - B. Send printed questionnaires to local primary schools.
    - C. Replace the survey with automated pedestrian counters at park gates.
    - D. Extend the survey deadline by another four weeks.
12. **`l-12` (B2):** Which section of the report do the students agree to revise first?
    - A. The historical overview of city parks
    - B. The budget comparison between districts
    - **C. The methodology section explaining sampling bias** *(Đáp án đúng: `2`)*
    - D. The appendix of maps and photographs

---

### Đoạn 5 (`clip-5`) — Level C1: Bài giảng về kiến trúc lựa chọn và hình thành thói quen bền vững
- **File audio:** `apps/profile/public/kiem-tra-dau-vao/audio/clip-5.mp3`
- **Giọng đọc nháp:** `en-US-ChristopherNeural` (độc thoại bài giảng đại học, tốc độ `0%`, ~75 giây)
- **Giới hạn nghe:** Tối đa 2 lần (`maxPlays: 2`)

**Transcript:**
> "In today's lecture on behavioral economics and environmental policy, we examine why public information campaigns—despite raising awareness—so rarely produce durable changes in everyday habits. Survey after survey confirms that most urban citizens already understand the environmental cost of single-use packaging or high-energy appliances. The bottleneck is seldom a lack of knowledge or distrust of public statistics; rather, high awareness does not automatically overcome the cognitive friction of daily routines. When people are rushed or mentally fatigued, they rely on habitual shortcuts rather than deliberate cost-benefit calculations. This is where choice architecture becomes relevant. Consider a landmark field study conducted across several workplace cafeterias. Researchers did not ban meat dishes, alter prices, or post moralizing posters. Instead, they simply redesigned the menu board so that low-carbon, plant-based meals were presented as the standard daily special at eye level, while other options remained available upon request. Selection of the sustainable option rose by over forty percent without restricting individual freedom of choice. Yet we must end with an important caveat: default nudges are not a silver bullet. Longitudinal follow-ups show that when users perceive a default setting as manipulative, covert, or opaque, psychological reactance sets in, and the intervention rapidly loses its effectiveness. Transparency, therefore, is an essential condition for ethical choice architecture."

**Câu hỏi & Đáp án:**
13. **`l-13` (C1):** According to the lecturer, why do information campaigns alone rarely produce lasting behavioral change?
    - A. People generally distrust statistics published by public agencies.
    - **B. High awareness does not automatically overcome the friction of daily routines.** *(Đáp án đúng: `1`)*
    - C. Most campaigns focus too heavily on financial penalties rather than rewards.
    - D. Media coverage tends to fade before citizens understand the core message.
14. **`l-14` (C1):** What did the cafeteria study demonstrate about changing the default option?
    - A. Diners complained when low-carbon meals were listed at the top of the menu.
    - B. Price discounts were twice as effective as changing menu layout.
    - **C. Placing plant-based dishes as the standard daily special increased their selection without restricting choice.** *(Đáp án đúng: `2`)*
    - D. Calorie labels had a stronger effect on staff than on students.
15. **`l-15` (C1):** What caution does the lecturer raise at the end of the talk?
    - **A. Default nudges can lose effectiveness if users perceive them as manipulative or opaque.** *(Đáp án đúng: `0`)*
    - B. Behavioral interventions are too expensive for small municipalities to test.
    - C. Laboratory experiments on habit formation cannot be replicated in workplaces.
    - D. Digital reminders always cause fatigue within the first week.

---

## 4. Hướng dẫn Duyệt & Phát hành cho Cô Mỹ

1. Kiểm tra 30 câu hỏi, đáp án, bảng quy đổi CEFR (mục 1–3) và nghe thử 5 đoạn audio trên trang preview `/kiem-tra-dau-vao/`.
2. Nếu cần chỉnh sửa câu hỏi, ngưỡng điểm hoặc thay file `.mp3` tự thu âm:
   - Cập nhật `apps/profile/public/kiem-tra-dau-vao/questions.json` (và tăng `"version"` nếu muốn xóa tiến độ làm thử cũ trên trình duyệt).
   - Thay file `.mp3` tương ứng trong `apps/profile/public/kiem-tra-dau-vao/audio/`.
3. Khi đã xác nhận duyệt toàn bộ nội dung:
   - Đổi `"status": "draft"` thành `"status": "approved"` trong `apps/profile/public/kiem-tra-dau-vao/questions.json`.
   - Ghi ngày xác nhận duyệt dưới đây và chạy `pnpm --filter profile build`.

- **Trạng thái duyệt:** `[ ] Đã duyệt (Approved)`
- **Người duyệt:** Cô Đỗ Thị Thục Mỹ
- **Ngày duyệt:** *(chờ xác nhận)*
