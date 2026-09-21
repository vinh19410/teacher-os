# Design Spec: assignment-create-5.html — "Thêm đề vào ngân hàng"

> Nguồn: Open Design project `f2f4d498-7ea3-403c-89e9-6ac3099ac79b`, artifact `assignment-create-5.html` (primary, cập nhật 2026-09-21 10:40, tên artifact "Tạo đề · đáp án chấm tự động").
> Lưu ý: v5 ≡ v4 về nội dung (diff 1 byte). Đây là bản thiết kế lớn thay cho v1–v3 (~40–48KB → 93KB).
> Spec này là hợp đồng hiển thị: copy tiếng Việt giữ nguyên từ thiết kế.

## 1. Bố cục tổng thể

- Breadcrumb: `Bài tập / Ngân hàng / Tạo mới`. H1: **"Thêm đề vào ngân hàng"**.
- Lead: "Soạn Writing, Reading, Listening hoặc Speaking theo phần thi IELTS. Reading và Listening khóa đáp án để chấm tự động. Đề lưu ngân hàng; giao lớp ở trang Lớp học."
- Grid 2 cột `1.45fr / 0.9fr` (≤920px xếp dọc):
  - **Trái**: card "Đề bài" (composer).
  - **Phải**: card "Ngân hàng" + paper "Xem trước phía học viên" (preview).
- **Sticky action bar** dưới cùng (blur, border-top): copy trạng thái + nút "Hủy" (secondary) + nút submit (primary).
- **Success card** thay thế form sau khi lưu (max-w 560px).

## 2. Composer "Đề bài" (cột trái)

### 2.1 Skill picker (Kỹ năng) — radiogroup chip
`Writing | Reading | Listening | Speaking`. Heading card đổi theo skill: "Writing Academic" / "Reading Academic" / "Listening" / "Speaking".

### 2.2 Part picker (label đổi theo skill)
- Writing: "Dạng bài" — `Task 1 · 150 từ`, `Task 2 · 250 từ`
- Reading: "Phần thi" — `Passage 1/2/3`
- Listening: "Phần thi" — `Section 1/2/3/4`
- Speaking: "Phần thi" — `Part 1 · Phỏng vấn`, `Part 2 · Cue card`, `Part 3 · Thảo luận`

### 2.3 Type picker (label đổi theo skill) — theo part đang chọn
Bảng type đầy đủ (id → dạng input đáp án, xem §2.6):

| Skill/Part | Types |
|---|---|
| W/task1 | Biểu đồ (chart), Bảng số liệu (table), Bản đồ (map), Quy trình (process) |
| W/task2 | Discuss both views, Opinion, Advantages, Problem / Solution |
| R/p1 | True/False/NG (tfng), Sentence completion (sent) |
| R/p2 | Matching headings (headings), Matching information (info) |
| R/p3 | Yes/No/NG (ynng), Multiple choice (mcq) |
| L/s1 | Form completion (form), Multiple choice (mcq1) |
| L/s2 | Map labelling (map), Matching (match2) |
| L/s3 | Multiple choice (mcq3), Flow-chart (flow) |
| L/s4 | Note completion (notes), Sentence completion (sent4) |
| S/part1 | Hometown, Work & study |
| S/part2 | Place, Person, Object |
| S/part3 | Cities, Education |

Mỗi type có **template mẫu** (title + prompt/passage/intro/items/transcript/cue) auto-apply khi chọn (trừ field user đã sửa — dirty flags, giữ nguyên pattern của trang hiện tại).

### 2.4 Fields chung
- **Tiêu đề** (input, required) — auto-fill từ type.title, dirty-flag.
- **Band mục tiêu** (chips): 6.0 / 6.5 / 7.0 / 7.5.
- **Nguồn đề** (input): auto-fill theo skill (vd "Cambridge IELTS 10, Test 2").
- **Số câu hỏi** (input number 1–40) — chỉ hiện với Reading/Listening; resize danh sách câu.
- **Hướng dẫn thêm (không bắt buộc)** (textarea) — ghi chú cho giáo viên.

### 2.5 Fields theo skill
- **Writing**: textarea "Nội dung đề" (required) + word count "N từ" + help theo task.
- **Reading**: textarea "Đoạn đọc" (required, min-h 200px) + word count + help.
- **Listening**:
  - **File nghe** (required khi ready): nút upload — "Đính file nghe / MP3 hoặc WAV · Section này khoảng 8–10 phút"; có file → tên file + "Sẽ phát cho học viên khi được giao". Link "Dùng file mẫu Cambridge 10" (set tên file mẫu) + "Gỡ file".
  - **Transcript (chỉ giáo viên)** textarea — "Dán lời thoại để đối chiếu khi chấm."
  - Q-editor đặt TRƯỚC transcript.
- **Speaking**:
  - Part 1/3: textarea "Câu hỏi giám khảo" (required) + help.
  - Part 2: input "Chủ đề cue card" (required) + textarea "You should say" (mỗi ý một dòng, help: "1 phút chuẩn bị, 1–2 phút nói").

### 2.6 Q-editor "Câu hỏi và đáp án đúng" (Reading/Listening)
- **Hướng dẫn đề** (textarea, min-h 96px) — vd "Questions 1–8\nDo the following statements agree…".
- **Danh sách câu (q-card)**: mỗi câu — số "Câu N" (N = qStart + index; qStart theo part: R p1/p2/p3 = 1/14/27, L s1..s4 = 1/11/21/31), nút "Xóa" (khi >1 câu), input stem "Nội dung câu hỏi phía học viên".
  - **MCQ** (mcq4: 4 opts A–D; mcq3: 3 opts A–C): grid input "Lựa chọn A/B/C/D".
  - **Đáp án đúng · học viên không thấy**: 
    - Dạng choice → chip radiogroup: tfng `[TRUE, FALSE, NOT GIVEN]`; ynng `[YES, NO, NOT GIVEN]`; mcq4 `[A,B,C,D]`; mcq3 `[A,B,C]`; roman (headings) `[i..viii]`; letter (info, map, match2) `[A..H]`.
    - Dạng text → 2 input: "Đáp án chấm tự động" + "Chấp nhận thêm, cách nhau bằng /" (alts).
- "Thêm câu" link + **key-scan** (mono, right-aligned): "1 FALSE · 2 TRUE · 3 —" (đáp án từng câu hoặc —).
- KIND map **type-id → kind của answer UI**: tfng→tfng, sent→text, headings→roman, info→letter, ynng→ynng, mcq→mcq4, form→text, mcq1→mcq3, map→letter, match2→letter, mcq3→mcq3, flow→text, notes→text, sent4→text. Lưu ý: type-id là id trong catalog (`mcq`, `mcq1`, `mcq3`); giá trị kind (`mcq4` = 4 lựa chọn A–D, `mcq3` = 3 lựa chọn A–C) chỉ quyết định UI đáp án — không dùng kind làm type-id. Id `map` trùng giữa W/task1 (Bản đồ) và L/s2 (Map labelling) — chấp nhận được vì q-editor chỉ hiện cho R/L. Tổng catalog: **4 skill · 12 part · 29 type** (W 4+4, R 2×3, L 2×4, S 2+3+2).

## 3. Card "Ngân hàng" (cột phải)

- Section "Ngân hàng" — H2 **"Chưa giao lớp"**.
- Note: "Đề này chỉ được thêm vào ngân hàng bài tập. Giao cho lớp và học viên ở trang **Lớp học**."
- **Grade banner** (chỉ Reading/Listening): đủ đáp án → "X/Y đáp án đã khóa. Học viên nộp sẽ được chấm tự động. Preview bên dưới không hiện đáp án."; thiếu → "Thiếu N đáp án. Chấm tự động cần khóa hết trước khi lưu sẵn sàng giao."
- **Trạng thái** chips: `Bản nháp | Sẵn sàng giao`.
- **"Đề {Skill} đã có"**: list item (title + tag status + source) — **filter theo skill đang chọn**; rỗng → "Chưa có đề {skill} trong ngân hàng."

## 4. Preview "Xem trước phía học viên"

Paper (bg surface-warm) — cập nhật live:
- Kicker mono "XEM TRƯỚC PHÍA HỌC VIÊN"; title = tiêu đề (fallback type.title).
- Spec: part.spec + "Band {band}"; auto (R/L): "{n} câu · 20 phút/~10 phút · Band".
- Writing: body = prompt (fallback "Đề sẽ hiện ở đây khi bạn soạn.").
- Reading: passage (fallback "Đoạn đọc sẽ hiện ở đây.") + intro (nếu có) + danh sách câu (số + stem; MCQ hiện opts "A  …"). **Không hiện đáp án.**
- Listening: hàng audio (icon + tên file hoặc "Chưa đính file nghe") + intro + câu hỏi như Reading.
- Speaking p2: cue preview "Describe {topic}." + "You should say:" + list points (mỗi dòng 1 ý).
- Speaking p1/3: body = câu hỏi giám khảo.
- Tags: Skill · Part · Type · Band · Nguồn (nếu có) · "Chấm tự động" (R/L) · "Có hướng dẫn thêm" (nếu có note) · Trạng thái.

## 5. Action bar — state machine

Copy trái (title/sub) theo thứ tự ưu tiên:
1. Thiếu tiêu đề → "Đặt tên đề rồi lưu vào ngân hàng. Chưa giao lớp."
2. Listening + ready + chưa có file → "Thiếu file nghe" / "Đính file hoặc dùng file mẫu trước khi lưu sẵn sàng giao."
3. R/L + ready + chưa đủ đáp án → "Thiếu đáp án chấm tự động" / "Khóa đáp án đúng cho mọi câu trước khi lưu sẵn sàng giao."
4. !canSave → "Thiếu nội dung đề" / "Soạn xong rồi lưu vào ngân hàng. Chưa giao lớp."
5. draft → "Lưu bản nháp" / "Bản nháp chưa hiện khi giao từ trang Lớp học." (R/L thiếu đáp án: "Bản nháp chưa đủ đáp án — chưa chấm tự động được.")
6. Sẵn sàng → "Sẵn sàng lưu vào ngân hàng" / R-L: "X/Y đáp án đã khóa. Chưa giao lớp." — khác: "Chưa giao lớp. Giao sau ở trang Lớp học."

Nút submit: disabled khi !canSave; label "Lưu bản nháp" (draft) / "Lưu vào ngân hàng" (ready).

### canSave (validation client)
- Luôn: `title.trim()`.
- Writing: `prompt.trim()`.
- Reading: `passage.trim()` + có ít nhất 1 stem; ready → mọi câu có stem + answer.
- Listening: có stem; ready → audioName + mọi câu có stem + answer.
- Speaking p2: `cueTopic.trim()`; p1/p3: `speakPrompt.trim()`.

### Lỗi field (sau submit, `has-error` border đỏ)
title / prompt / passage / key-field (stems thiếu hoặc ready thiếu đáp án) / audio (ready thiếu file) / cue-topic / speak.

## 6. Success card

- Icon check xanh. H2: "Đã thêm vào ngân hàng" (ready) / "Đã lưu bản nháp" (draft).
- Lead: ""{title}" chưa được giao lớp. Giao bài tập ở trang Lớp học khi cần."
- Meta rows: Kỹ năng · Phần thi (Part + Type label) · Band mục tiêu · Chi tiết (L: audioName|"Chưa đính file"; R/L: "N câu"; khác: type label) · Chấm điểm (chỉ R/L: "Tự động · X/Y đáp án đã khóa" hoặc "Chưa đủ đáp án · chưa chấm tự động") · Nguồn ("Không ghi nguồn" fallback) · Trạng thái · Giao lớp: "Chưa giao".
- CTA: "Tạo đề khác" (reset form) + link "Mở trang Lớp học".

## 7. Reset ("Hủy" / "Tạo đề khác")

Về mặc định: skill=writing, part=task2, type=discuss, band=7.0, status=ready, xóa dirty flags, xóa audio/note; form hiện lại, success ẩn.

## 8. Điểm thiết kế cần chú ý (khác trang hiện tại)

1. **4 kỹ năng** thay vì chỉ Writing (task1/task2) — kiến trúc preset 3 cấp skill → part → type.
2. **Q-editor + answer key** hoàn toàn mới (stem/opts/answer/alts, add/remove, số câu theo qStart).
3. **Audio metadata** (tên file) — KHÔNG có upload thật trong mock (file picker chỉ lấy tên; "file mẫu" set tên cứng). Chưa có consumer phát audio.
4. **Preview mở rộng**: câu hỏi, cue card, audio row, tags mới ("Chấm tự động").
5. **Bank list filter theo skill** (hiện tại: không filter).
6. **Grade banner** + **key-scan** mới.
7. Word count cho passage (mới), qcount resize (mới).
8. Speaking: 2 chế độ input (qa vs cue card) — mới hoàn toàn.

## Addendum 2026-09-21 — layout override

Plan [`260921-0400-assignment-create-single-column-preview`](../../260921-0400-assignment-create-single-column-preview/plan.md) đã hạ quyết định hiển thị trên trang tạo đề, override các section liên quan của spec này:

- **§1 (bố cục 2 cột) không còn**: trang tạo là **một cột** (`max-w-3xl`, chỉ composer); cột phải bị gỡ hẳn — không giao bài tại màn này.
- **§3 (card "Ngân hàng") không dựng lại trên trang tạo**: chips `Bản nháp | Sẵn sàng giao` dời vào sticky action bar, giữ đúng nhãn (E2E dependency).
- **§4 (preview inline) tách trang riêng `/assignments/preview`**: nút "Xem trước" ghi snapshot draft vào sessionStorage rồi redirect; teacher quay lại soạn không mất form.

Khi triển khai redesign 4-skill phải giữ các quyết định này; §1/§3/§4 chỉ còn giá trị tham khảo về copy/data model.

> **Cập nhật thứ tự 2026-09-21 (validation plan `260921-0351`, Q2 — user chốt):** plan redesign 4-skill (#218) thực hiện **trước** theo đúng §1/§3/§4 (bố cục v5 hai cột); các quyết định layout một cột ở addendum trên áp dụng khi plan `260921-0400` (#213) **rebase lên kết quả** sau đó. Trong lúc cook #218, addendum là tham chiếu cho #213 chứ không ràng buộc #218.
