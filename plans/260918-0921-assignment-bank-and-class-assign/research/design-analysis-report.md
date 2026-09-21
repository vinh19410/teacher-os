# Báo cáo phân tích design — Assignment Bank & Giao bài trên lớp
Ngày: 18/09/2026 · 3 mockup HTML: `class-detail-assign.html` (v1), `class-detail-assign-2.html` (v2 — BẢN CHÍNH cho class-detail), `assignment-bank.html` (mới nhất, 16:06)

Ngữ cảnh đối chiếu: PR #205 đã hiện thực trang `/assignments/new` (từ `assignment-create-3.html`) với bảng `assignment_prompt` (id, orgId, title, genre [wt1|wt2], taskType/promptType, targetBand, source, content, additionalInstructions, status [draft|ready], createdAt/updatedAt), collection `assignmentPrompts`, `POST /api/assignments/prompts`.

---

## 0. Chrome chung của app (giống nhau ở cả 3 file)

- **Sidebar trái** (248px, surface `#f5f5f7`, sticky full-height), brand "T" + "Teacher OS". Nav:
  - (không nhóm): `Tổng quan`, `Học viên`, `Lịch dạy`, `Học phí`, `Bài tập`
  - Nhóm "Giảng dạy": `Lớp học`, `Syllabus`
  - Nhóm "Phụ huynh": `Báo cáo`
  - Footer: avatar "GV" · "Giáo viên" · meta "Workspace lớp"
  - Mục active: class-detail v1/v2 → **Lớp học**; assignment-bank → **Bài tập**.
- **Topnav** sticky blur: menu-toggle (mobile, aria-label "Mở menu"), logo, ô search, nút thông báo (aria-label "Thông báo").
- Mobile ≤920px: sidebar thành drawer + scrim, Escape/scrim click đóng menu; grid về 1 cột.
- Type scale: h1 28–40px, h2 22px, meta mono 12px, nút pill min-height 44px, card radius 18px, chip pill 36px. Accent `#0071e3` (chỉ dùng btn-primary).

---

## 1. File 1 — `class-detail-assign.html` (v1, 14:25) — "Giao bài tập"

### 1.1. Đặc điểm cấu trúc file (quan trọng)
File chứa **2 document HTML xếp chồng**:
- Document ngoài (dòng 1–316) bị **cắt cụt** giữa panel Buổi học, chèn lẫn **design notes** và 1 `<od-card type="task-brief">` + thẻ `<artifact identifier="class-detail-assign">`.
- Document trong (dòng 317–989) là **bản mockup hoàn chỉnh có JS đầy đủ**. Phân tích dưới đây lấy document trong làm chuẩn; các chi tiết chỉ có ở bản ngoài được ghi chú riêng (mục 1.8).

**Design notes nhúng trong bản ngoài (ý định thiết kế, nguyên văn):**
> "Trang chi tiết lớp giữ chrome Teacher OS (canvas trắng, surface `#f5f5f7`, SF Pro, accent `#0071e3` một lần trên mục Lớp học và một lần trên CTA giao). Không soạn đề ở đây — chỉ lấy đề sẵn sàng từ ngân hàng."

Kế hoạch nhúng: (1) Header lớp + KPI + tab **Bài tập** mở sẵn; (2) Cột trái: chọn đề sẵn sàng (ẩn bản nháp); (3) Cột phải: hạn nộp, học viên trong lớp (mặc định chọn hết), xem trước; (4) CTA **Giao bài tập**; xác nhận rồi hiện trong danh sách đã giao. "Prototype: chọn đề, hạn, học viên trong lớp này — không tạo đề mới."

od-card task-brief: summary "Bước giao bài trên trang chi tiết lớp: chọn đề ngân hàng, hạn nộp, học viên trong lớp." — Audience: "Giáo viên IELTS trên Teacher OS"; Deliverable: "Trang chi tiết lớp với bước giao bài"; Done means: "Chọn đề sẵn sàng, hạn, học viên; không soạn đề trên trang này".

### 1.2. Trang & điều hướng
- `<title>`: `Giao bài tập · IELTS Writing 7.0 — Nhóm tối`
- Topnav logo: `Chi tiết lớp`; search id `bank-search`, placeholder/aria-label **"Tìm đề trong ngân hàng"** (search này lọc both picker — xem JS).
- Breadcrumb: `Lớp học / IELTS Writing 7.0 — Nhóm tối` (link "Lớp học" + span tĩnh).
- Nằm ở: Sidebar **Lớp học** (active, aria-current="page") → trang chi tiết lớp → tab **Bài tập**.

### 1.3. Layout tổng thể
1. Crumb.
2. **Class hero card**: h1 `IELTS Writing 7.0 — Nhóm tối` + pill `IELTS`; meta: `Band 7.0 · Writing, Speaking · Online` · `Lịch: T3 & T5 · 19:00–20:30` · `Bắt đầu: 12/08/2026`. Actions bên phải: `+ Thêm học viên` (secondary), `Giao bài tập` (primary, id header-assign-btn).
3. **4 stat cards** (grid-4): `2` "học viên" · `1` "bài đang mở" (id stat-open, động) · `2` "đề sẵn sàng giao" · `T3 · T5` "lịch cố định".
4. **Tabs** (aria-label "Phần lớp học"): `Học viên` · `Buổi học` · `Bài tập` (active, aria-selected) · `Ghi chú`.
5. Panel tab — xem 1.4.
6. Tab Bài tập gồm **3 view** hoán đổi JS: `list` (danh sách đã giao) / `assign` (form giao) / `success` (xác nhận). **v1 khởi tạo ở view `assign`** (mở thẳng form).
7. Form giao: grid **1.2fr / 1fr** (trái = picker ngân hàng, phải = hạn nộp + học viên + preview) + **action-bar sticky đáy** (blur, border-top).
8. Mobile: grid về 1 cột; bảng đã giao ẩn cột 3 (Học viên).

### 1.4. Các panel tab (copy chính xác)
- **Học viên** (panel-roster): section-label `Học viên trong lớp`; 2 student-row: avatar `MA` · **Nguyễn Minh Anh** · `Band 6.5 · Writing` · tag `Ổn`; avatar `TV` · **Vũ Thảo Vy** · `Band 6.0 · Writing` · tag `Ổn`.
- **Buổi học**: section-label `Lịch học`, h2 `T3 & T5 · 19:00–20:30`; 4 hàng: `T3 · 15/09/2026` / `T5 · 17/09/2026` meta `19:00–20:30 · Đã học`; `T3 · 22/09/2026` / `T5 · 24/09/2026` meta `19:00–20:30 · Sắp tới`.
- **Ghi chú**: section-label `Ghi chú lớp`, h2 `Ghi chú nội bộ`; label `Ghi chú`; textarea nội dung mẫu `Nhóm tối, tập trung Task 2. Minh Anh cần siết coherence; Thảo Vy còn thiếu lexical cho band 6.5.`; nút `Lưu ghi chú` (secondary) + field-help ẩn `Đã lưu trên trang này.` (hiện khi bấm lưu — chỉ client).

### 1.5. Tab Bài tập — view LIST (v1: dùng bảng)
- Header hàng: section-label `Bài đã giao lớp này`; nút ghost `Giao thêm đề` (id list-assign-btn).
- Card bảng `assigned-table`, cột: **Đề | Hạn nộp | Học viên | Trạng thái**.
- Hàng render JS: tên đề (strong) · hạn `dd/mm/yyyy` (mono meta) · `N học viên` · tag `Đang mở` (v1 **luôn** hardcode "Đang mở", không có logic quá hạn).
- stat-open = `assigned.length`.

### 1.6. Tab Bài tập — view ASSIGN (form)
Header: section-label `Giao bài tập`; h2 **`Chọn đề từ ngân hàng`**; lead **`Đề soạn ở ngân hàng. Trang này chỉ giao cho học viên của lớp đang mở.`**

**Cột trái — card "Đề sẵn sàng" (bank-picker):**
- section-label `Đề sẵn sàng`; link ghost **`Thêm đề mới`** (id goto-bank, href `#` — không wire, ý nghĩa: sang trang tạo đề).
- Filter chips (role radiogroup, aria-label `Lọc dạng bài`): `Tất cả` (active mặc định, data-filter=all) · `Task 2` (task2) · `Task 1` (task1).
- Danh sách `prompt-list` (role radiogroup, aria-label `Chọn đề`) — các **prompt-card** (button, role radio):
  - strong = title đề; item-meta: tag **`Sẵn sàng`** hoặc **`Đã giao lớp này`** (nếu đề đã nằm trong danh sách đã giao của lớp) + meta = source.
  - Trạng thái: hover border đậm; **selected**: border `--fg` + nền surface + inset ring; focus-visible ring accent.
- field-help: **`Bản nháp không hiện ở đây. Sửa trong ngân hàng rồi mới giao.`**
- field-error (id prompt-error): **`Chọn một đề sẵn sàng trước khi giao.`**
- Empty state (khi filter ra 0): `Không có đề Task 1 sẵn sàng. Writing Task 1 — Chart đang là bản nháp trong ngân hàng.` (hardcode cho trường hợp filter Task 1).

**Cột phải — card "Giao cho lớp này" (assign-targets):**
- section-label `Giao cho lớp này`; h2 **`Hạn nộp và học viên`**.
- Field **Hạn nộp**: date input, `required`, **`min="2026-09-18"` (TODAY)**, **value mặc định `2026-09-25`**; field-error: `Chọn hạn nộp từ hôm nay trở đi.`
- Field **Nhắn học viên (không bắt buộc)**: textarea, placeholder **`Ví dụ: nộp trước buổi T5, lập dàn ý 4 đoạn.`**
- Khối **Học viên trong lớp**: section-label `Học viên trong lớp` + nút ghost toggle-all, nhãn động **`Bỏ chọn tất cả`** ⇄ **`Chọn tất cả`** (đủ/hết chọn). Mỗi học viên = label student-row: checkbox 18px (accent fg) + avatar + tên (strong) + meta band. **Mặc định chọn hết** học viên của lớp.
- field-error (id student-error): **`Chọn ít nhất một học viên.`**
- warn-note ẩn (id reassign-note), khi đề đã giao lớp: **`Đề này đã giao lớp này, hạn {dd/mm/yyyy}. Giao lại sẽ thêm lượt mới cho học viên đã chọn.`**

**Preview (student-preview, cột phải dưới):** khung "giấy đề" (surface-warm) — kicker mono uppercase **`Xem trước phía học viên`**; title mặc định `Chọn một đề`; spec mặc định `Academic · hạn 25/09/2026`; body mặc định **`Đề sẽ hiện khi bạn chọn từ ngân hàng.`**
Khi chọn đề: title = tên đề; spec = **`Academic · {words} từ · {minutes} phút · hạn {dd/mm/yyyy}`**; body = nội dung đề (pre-wrap); tags: `{genre}` · `Band {x}` · `{source}` · **`Có lời nhắn`** (chỉ khi ô note có nội dung).

**Action-bar (submit-bar) sticky đáy:**
- Trái (action-copy) — 4 trạng thái theo thứ tự ưu tiên:
  - `Chưa chọn đề` / `Chọn đề sẵn sàng, hạn nộp, rồi chọn học viên.`
  - `Chưa chọn học viên` / `Giao cho ít nhất một học viên trong lớp này.`
  - `Thiếu hạn nộp` / `Hạn phải từ hôm nay (18/09/2026) trở đi.`
  - `Giao cho {N} học viên` / `{tên đề} · hạn {dd/mm/yyyy}`
- Phải: `Hủy` (secondary) · **`Giao bài tập`** (primary, submit). Nút submit **disabled** (opacity .4) cho tới khi đủ: đã chọn đề + ≥1 học viên + hạn ≥ hôm nay.

### 1.7. View SUCCESS + JS chính (v1)
- Card success (max 560px): check tròn xanh; h2 **`Đã giao bài tập`**; lead JS: **`“{title}” đã giao cho lớp IELTS Writing 7.0 — Nhóm tối. Học viên thấy đề và hạn nộp.`**
- saved-meta (label → giá trị): `Lớp` → tên lớp · `Đề` → tên đề · `Hạn nộp` → dd/mm/yyyy · `Học viên` → `N người`.
- recipient-list: avatar + tên từng học viên.
- Nút: `Giao đề khác` (secondary — reset về đề mặc định p-discuss, chọn hết học viên, due 2026-09-25, xóa note, mở lại form) · `Xem bài đã giao` (ghost — về view list).
- Submit: unshift assignment `{id:"a-"+Date.now(), promptId, title, due, studentIds, status:"open"}` → success.
- JS khác: filter chips đổi `active`/aria-checked rồi render lại picker; click prompt-card chọn đề; change checkbox cập nhật selected + toggle-all label; due/note `change`/`input` re-render preview; **topnav search gõ → tự chuyển tab Bài tập + view assign và lọc picker** (query match trên title+source+genre, lowercase); `+ Thêm học viên` → chuyển tab Học viên; `fmtDate` iso → `dd/mm/yyyy`.

### 1.8. Chỉ có ở document ngoài (bản nháp đầu, tham khảo)
- Topnav logo `Lớp học`; search id `global-search`; stat 4 nhãn `lịch tối` (giá trị `T3/T5`); tabs aria-label `Mục lớp`; roster dạng **bảng** cột `Học viên | Mục tiêu | Trạng thái` (Mục tiêu = `Band 6.5 · Writing` / `Band 6.0 · Writing`, tag `Ổn`). → Các nhãn này bị thay ở bản trong/v2; **lấy bản trong làm chuẩn**.

### 1.9. Dữ liệu mẫu v1 (placeholder)
- STUDENTS: `st-1` Nguyễn Minh Anh (Band 6.5 · Writing, MA); `st-2` Vũ Thảo Vy (Band 6.0 · Writing, TV). CLASS `cl-1` [st-1, st-2].
- BANK (3 đề, implicit ready, đều task2): `p-discuss` "Writing Task 2 — Discuss both views" (Cambridge IELTS 10, Test 2, band 7.0, 250 từ, 40 phút); `p-opinion` "Writing Task 2 — Opinion" (Cambridge IELTS 11, Test 1, 7.0); `p-problem` "Writing Task 2 — Problem" (Cambridge IELTS 9, Test 4, 7.0). Nội dung đề tiếng Anh đầy đủ (đề IELTS thật).
- assigned: `a-1` = p-problem, due 2026-09-12, cả 2 học viên, status open.

---

## 2. File 2 — `class-detail-assign-2.html` (v2, 14:55) — BẢN CHÍNH

### 2.1. Khác biệt tổng quan so v1
- `<title>`: `Bài đã giao · IELTS Writing 7.0 — Nhóm tối`. **Khởi tạo ở view `list`** (mở trang thấy danh sách đã giao trước).
- Giữ nguyên toàn bộ chrome, hero, tabs, các panel, form giao bài, preview, action-bar, success (điểm khác trong success xem 2.4).
- File sạch (1 document), 740 dòng.

### 2.2. Thay đổi ở stat & header danh sách
- Stat card 3 đổi từ "đề sẵn sàng giao" thành: id `stat-submitted`, giá trị động **`{đã nộp}/{tổng}`** ban đầu `1/2`, nhãn **`đã nộp trên bài mở`**. Stat còn lại như v1 (học viên 2, bài đang mở 1 — id stat-open, lịch cố định T3 · T5).
- Header view list thêm meta tổng hợp id `assign-summary`: **`{done}/{total} đã nộp`**, hoặc **`Chưa giao bài`** khi lớp chưa có bài nào.

### 2.3. "Trạng thái nộp" — cốt lõi của v2 (thay bảng v1 bằng danh sách thẻ)
Danh sách `assigned-list` = card padding 0, mỗi bài giao là 1 `<article class="assign-item">`:

**Cấu trúc 1 item:**
- Head: `assign-item-title` = tên đề; meta mono = **`Hạn {dd/mm/yyyy} · {n}/{m} đã nộp`**; tag phải = trạng thái rollup.
- `sub-list`: mỗi học viên 1 `sub-row` = avatar + tên (strong) + thời điểm nộp (`meta num`, định dạng **`dd/mm/yyyy · HH:mm`** qua `fmtWhen`) hoặc text meta **`Chưa có bài nộp`** + tag trạng thái nộp.
- aria-label article: `{n} trên {m} đã nộp`.

**Trạng thái rollup cấp bài giao (`rowKind`):**
| Điều kiện | Nhãn | Màu tag |
|---|---|---|
| nộp đủ (submitted = tất cả) | **`Đã nộp hết`** | `tag.ok` — chữ xanh `--success #16a34a`, nền success-soft, border pha xanh |
| chưa đủ && due < TODAY | **`Quá hạn`** | `tag.danger` — chữ đỏ `--danger #dc2626`, nền danger-soft |
| còn lại | **`Đang mở`** | `tag` trung tính (chữ muted, viền border) |

**Trạng thái nộp cấp học viên (`studentSub`):**
| Điều kiện | Nhãn | Màu |
|---|---|---|
| submitted && ngày nộp > due | **`Đã nộp · trễ hạn`** | `tag.warn` (vàng warn-soft, chữ fg-2) + kèm timestamp |
| submitted | **`Đã nộp`** | `tag.ok` (xanh) + kèm timestamp |
| !submitted && due < TODAY | **`Chưa nộp · quá hạn`** | `tag.danger` (đỏ) |
| còn lại | **`Chưa nộp`** | `tag` trung tính |

**Mô hình submissions trong v2:** mỗi assignment có map `submissions: {studentId: {status:"submitted", at:"YYYY-MM-DDTHH:mm"} | {status:"missing"}}`. Giá trị status chỉ có **`submitted`** và **`missing`**. "Trễ hạn"/"quá hạn" là **derived** (so `at` vs `due`, và `due` vs TODAY), không phải enum riêng. TODAY hardcode `"2026-09-18"`.

- Dữ liệu mẫu: a-1 (p-problem, due 12/09/2026): st-1 submitted `2026-09-11T21:14:00` → tag `Đã nộp` + `11/09/2026 · 21:14`; st-2 missing + đã quá hạn → tag `Chưa nộp · quá hạn` + `Chưa có bài nộp`; rollup item = `Quá hạn` (đỏ), meta `Hạn 12/09/2026 · 1/2 đã nộp`.
- stat-open = số item chưa nộp đủ; stat-submitted/summary = tổng cộng dồn mọi item (`done/total`).
- **Empty state danh sách:** `Chưa giao bài nào cho lớp này.` (empty-note).
- CSS mới: `.tag.ok/.warn/.danger`, `.assign-item`, `.sub-list`, `.sub-row`; **bỏ** toàn bộ style bảng `assigned-table` của v1 (và bỏ rule ẩn cột 3 mobile).

### 2.4. Thay đổi ở luồng submit/success (v2)
- Submit tạo `submissions` khởi tạo `{status:"missing"}` cho từng học viên được chọn.
- Success lead: **`“{title}” đã giao cho lớp IELTS Writing 7.0 — Nhóm tối. Học viên thấy đề và hạn nộp. Chưa có bài nộp.`** (thêm câu cuối so v1).
- saved-meta hàng 4 đổi thành: `Đã nộp` → **`0/{N}`** (v1 là `Học viên` → `N người`).
- recipient-list: mỗi học viên kèm tag cuối dòng **`Chưa nộp`**.
- `setView` gọn: nút hero `Giao bài tập` ẩn khi ở view assign **hoặc** success (v1 viết vòng vo cùng hiệu lực).

### 2.5. Giữ nguyên từ v1 (xác nhận again)
Form giao (Chọn đề từ ngân hàng / Đề sẵn sàng + chips Tất cả·Task 2·Task 1 / Thêm đề mới / help "Bản nháp không hiện ở đây..." / lỗi "Chọn một đề sẵn sàng trước khi giao." / Hạn nộp min today value 2026-09-25 / Nhắn học viên placeholder / toggle tất cả / lỗi "Chọn ít nhất một học viên." / warn-note giao lại / preview 4 nhãn action-bar / nút Hủy + Giao bài tập disabled logic / success 2 nút). BANK 3 đề, STUDENTS, CLASS, search topnav lọc picker, `+ Thêm học viên` → tab roster, notes lưu giả.

---

## 3. File 3 — `assignment-bank.html` (16:06, mới nhất) — "Ngân hàng bài tập"

### 3.1. Trang & điều hướng
- `<title>`: `Ngân hàng bài tập · Teacher OS`. Topnav logo: **`Ngân hàng đề`**.
- Search topnav id bank-search, placeholder **`Tìm đề theo tiêu đề hoặc nguồn`**, aria-label `Tìm đề trong ngân hàng`.
- Breadcrumb: `Bài tập / Ngân hàng`. Sidebar **Bài tập active**; nav `Lớp học` link sang `class-detail-assign-2.html`.
- Nằm ở: section **Bài tập** → con "Ngân hàng".

### 3.2. Layout
- **Page head**: h1 **`Ngân hàng bài tập`**; lead **`Đề đã lưu sau khi soạn. Lọc theo dạng bài rồi giao cho lớp ở trang Lớp học.`**; CTA phải: link btn-primary **`Tạo đề mới`** → `assignment-create-3.html` (trang đã hiện thực ở PR #205).
- Grid **1.35fr / 0.95fr**:
  - **Trái**: card bộ lọc + danh sách đề (bank-list).
  - **Phải**: aside preview **sticky top 76px**.

### 3.3. Bộ lọc (filter-card, padding 18/20)
- **Block "Dạng bài"** (section-label id task-filter-label): chip-row radiogroup, chips:
  - **`Tất cả`** (all) · **`Task 1 · 150 từ`** (task1) · **`Task 2 · 250 từ`** (task2)
- **Block "Dạng đề"** (id genre-block, section-label `Dạng đề`): chips phụ thuộc task đã chọn:
  - task1 → **`Biểu đồ`** (chart) · **`Bảng số liệu`** (table) · **`Bản đồ`** (map) · **`Quy trình`** (process)
  - task2 → **`Discuss both views`** (discuss) · **`Opinion`** (opinion) · **`Advantages`** (advantage) · **`Problem / Solution`** (problem)
  - all → gộp: task1 (4) + task2 (4), luôn có chip đầu **`Tất cả dạng`** (all)
  - Khi đổi Dạng bài mà genre hiện tại không còn hợp lệ → tự reset genre về `all`.
- **Chân card**: dòng đếm id result-count (aria-live polite): **`Đang hiện <N> / <M> đề`** (N in đậm); nút ghost **`Xóa bộ lọc`** — chỉ hiện khi đang có bộ lọc (task ≠ all hoặc genre ≠ all hoặc query ≠ rỗng); bấm reset tất cả + xóa text search.
- Chip active: nền đen `--fg`, chữ trắng. Search khớp **title + source + genre** (lowercase includes).

### 3.4. Hàng đề (bank-row — button, role option, trong listbox aria-label `Đề trong ngân hàng`)
Grid `1fr auto`, min-height 72px, radius 12px:
- **Trái**: h3 = title; row-meta: tag `{genre}` · meta `{source}` · meta **`Thêm {dd/mm/yyyy}`** (ngày thêm).
- **Phải (row-aside)**: tag trạng thái + meta **`{Task 1|Task 2} · Band {x}`**.
- Trạng thái (`statusInfo`):
  | Điều kiện | Nhãn | Style |
  |---|---|---|
  | status = draft | **`Bản nháp`** | `tag.draft` — xám (chữ fg-2, nền surface) |
  | used > 0 | **`Đã dùng {N} lớp`** | `tag.used` — chữ fg-2, viền mặc định |
  | còn lại (ready, chưa dùng) | **`Sẵn sàng`** | `tag.ready` — xanh success |
- Tương tác: hover nền surface + viền đậm; **selected** (click) nền surface + viền `--fg`, đồng thời cập nhật preview; nếu item đang chọn bị lọc khỏi danh sách → tự chọn item đầu danh sách. Ban đầu chọn `p-discuss`.
- **KHÔNG có action per-row nào** (không edit / không delete / không nút giao trực tiếp) — hàng chỉ dùng chọn-xem-trước. Giao bài phải qua trang Lớp học.

### 3.5. Preview cột phải
Khung "giấy đề" như class-detail: kicker **`Xem trước phía học viên`**; title; spec **`Academic · {words} từ · {minutes} phút · Band {band}`**; body = nội dung đề; tags: `{genre}` · `Band {x}` · `{source}` · `{Task 1|Task 2}`. Dưới cùng **preview-note tĩnh** (không phụ thuộc selection): **`Đề này chưa giao lớp. Giao cho học viên ở trang Lớp học.`** — chữ "Lớp học" là link → `class-detail-assign-2.html`. Preview hiển thị cho cả đề draft.

### 3.6. Empty state
Khi lọc ra 0: ẩn danh sách, hiện card empty-card (canh giữa, padding 40px): h2 **`Không có đề khớp bộ lọc`**; p **`Thử dạng bài khác, hoặc xóa bộ lọc để xem toàn bộ ngân hàng.`**

### 3.7. Dữ liệu mẫu (8 đề — structural, phản ánh đúng schema)
| id | task | genre | title | source | band | từ/phút | status | used | added |
|---|---|---|---|---|---|---|---|---|---|
| p-discuss | task2 | Discuss both views | Writing Task 2 — Discuss both views | Cambridge IELTS 10, Test 2 | 7.0 | 250/40 | ready | 0 | 18/09/2026 |
| p-process | task1 | Quy trình | Writing Task 1 — Process | Cambridge IELTS 14, Test 2 | 6.5 | 150/20 | ready | 0 | 16/09/2026 |
| p-map | task1 | Bản đồ | Writing Task 1 — Map | Cambridge IELTS 13, Test 1 | 7.0 | 150/20 | ready | 1 | 14/09/2026 |
| p-opinion | task2 | Opinion | Writing Task 2 — Opinion | Cambridge IELTS 11, Test 1 | 7.0 | 250/40 | ready | 0 | 11/09/2026 |
| p-advantage | task2 | Advantages | Writing Task 2 — Advantages | Cambridge IELTS 8, Test 3 | 6.5 | 250/40 | ready | 1 | 09/09/2026 |
| p-chart | task1 | Biểu đồ | Writing Task 1 — Chart | Cambridge IELTS 10, Test 1 | 6.5 | 150/20 | **draft** | 0 | 08/09/2026 |
| p-table | task1 | Bảng số liệu | Writing Task 1 — Table | Cambridge IELTS 12, Test 3 | 7.0 | 150/20 | ready | 0 | 05/09/2026 |
| p-problem | task2 | Problem / Solution | Writing Task 2 — Problem | Cambridge IELTS 9, Test 4 | 7.0 | 250/40 | ready | 2 | 02/09/2026 |

Đủ nội dung prompt tiếng Anh cho cả 8. Title pattern cấu trúc: `Writing Task {1|2} — {Genre}`.

---

## 4. So sánh v1 → v2 (v2 là bản chuẩn)
| Khía cạnh | v1 | v2 |
|---|---|---|
| Title | Giao bài tập · … | **Bài đã giao · …** |
| View khởi tạo | `assign` (mở form) | **`list`** (mở danh sách) |
| Stat 3 | "đề sẵn sàng giao" = 2 (tĩnh) | **"đã nộp trên bài mở" = done/total (động)** |
| Danh sách đã giao | Bảng 4 cột (Đề/Hạn nộp/Học viên/Trạng thái) | **Thẻ assign-item + sub-row từng học viên** |
| Trạng thái bài giao | Luôn tag `Đang mở` | **`Đã nộp hết` (ok) / `Quá hạn` (danger) / `Đang mở` (neutral)** |
| Trạng thái học viên | không có | **`Đã nộp` (+giờ) / `Đã nộp · trễ hạn` / `Chưa nộp · quá hạn` / `Chưa nộp`** + `Chưa có bài nộp` |
| Mô hình assignment | `{…, status:"open"}` | **`{…, submissions:{stId:{status,at}}}`** (status submitted/missing; trễ hạn/quá hạn là derived vs TODAY) |
| Header list | chỉ label + nút | thêm **`{done}/{total} đã nộp`** / `Chưa giao bài` |
| Empty list | không có (tbody rỗng) | **`Chưa giao bài nào cho lớp này.`** |
| Success meta | `Học viên` = "N người" | **`Đã nộp` = "0/N"**; lead thêm "Chưa có bài nộp."; người nhận kèm tag `Chưa nộp` |
| fmtWhen | không | **dd/mm/yyyy · HH:mm** |
| Còn lại | — | giữ nguyên (form, picker, preview, action-bar, tabs, KPI khác) |

---

## 5. Đối chiếu chéo 3 file + với backend đã có (PR #205)

**Nhất quán / khớp:**
1. Trang Bank hiển thị đủ trường khớp `assignment_prompt`: title; task (task1/task2 ↔ genre wt1|wt2); genreId/genre (chart/table/map/process ↔ discuss/opinion/advantage/problem — đúng hệ taskType của trang create); band (6.5–7.0, nằm trong khoảng 6.0–7.5 của create page); source; prompt content; status draft/ready (`Bản nháp`/`Sẵn sàng`); `Thêm {date}` ↔ createdAt. → **Không cần migration schema; chỉ cần thêm derived `used`.**
2. Từ số/tời phút là **derived từ task** (Task 1: 150 từ/20 phút; Task 2: 250 từ/40 phút) — được encode luôn vào nhãn chip `Task 1 · 150 từ` / `Task 2 · 250 từ`. Không cần lưu DB.
3. Hai trang liên kết chặt: Bank → "Tạo đề mới" (`assignment-create-3.html`) và "Lớp học" (`class-detail-assign-2.html`); class-detail có link ghost "Thêm đề mới" (chưa wire href) + help text dẫn về ngân hàng.
4. Empty state picker ở class-detail ("Writing Task 1 — Chart đang là bản nháp") khớp p-chart là draft duy nhất trong bank — cùng vũ trụ dữ liệu.
5. "used" ở bank (p-problem used=2, p-map=1, p-advantage=1) là **số lớp đã dùng đề**, tức derived từ bảng assignment theo promptId — class-detail chỉ list 1 bài của lớp này nên used=2 khớp ý "đã dùng ở lớp khác + lớp này" (placeholder hợp lý).
6. Nhãn genre task2 ở class-detail (Discuss both views / Opinion / Problem / Solution) trùng nhãn genre bank.

**Khác biệt / cần lưu ý khi hiện thực:**
1. **Stat "đề sẵn sàng giao" = 2 (tĩnh) trong khi picker có 3 đề ready** (v1; v2 đã bỏ stat này) → khi làm theo v2 thì không còn vấn đề.
2. Placeholder search topnav khác nhau: class-detail "Tìm đề trong ngân hàng" vs bank "Tìm đề theo tiêu đề hoặc nguồn" — cùng hành vi lọc (title+source+genre).
3. Trên class-detail, search topnav lọc **picker trong form** và tự ép chuyển tab/view — hành vi đặc thù cần giữ hoặc đơn giản hóa.
4. Bank **không có** edit/delete/giao-ngay trên từng hàng (chỉ chọn để preview) — nếu cần sửa đề phải qua flow khác (ngoài scope 3 file này).
5. Bank không hiển thị `additionalInstructions`, `updatedAt` — chỉ hiện content chính. OK với thiết kế.
6. Tổng số đề trong count-line là tổng cả draft (M = BANK.length = 8); danh sách bank **hiển thị cả draft** (khác picker của class-detail chỉ hiện ready). Có primary CTA duy nhất "Tạo đề mới".
7. preview-note ở bank là copy tĩnh "Đề này chưa giao lớp..." dù đề đang chọn có thể đã dùng — dùng động theo `used` khi hiện thực sẽ đúng hơn.
8. Success screen hardcode tên lớp trong chuỗi JS — thực tế lấy theo lớp hiện tại.
9. v1 file là 2 document chồng (bản ngoài cụt + notes) — **bỏ qua bản ngoài**, lấy v2 cho mọi quyết định.

**Mô hình dữ liệu assignment ngầm định từ v2 (implementation-ready):**
```
assignment = {
  id, classId, promptId,
  title,            // snapshot tên đề lúc giao
  due,              // "YYYY-MM-DD", >= hôm nay khi tạo, required
  note?,            // lời nhắn học viên, optional
  studentIds: [],   // subset học viên của lớp
  submissions: { [studentId]: { status: "submitted", at: "YYYY-MM-DDTHH:mm" } | { status: "missing" } }
}
// Rollup derived client-side:
//   row: Đã nộp hết (đủ submitted) | Quá hạn (due < today && chưa đủ) | Đang mở
//   per-student: Đã nộp (submitted, at<=due) | Đã nộp · trễ hạn (at>due) | Chưa nộp · quá hạn (missing && due<today) | Chưa nộp
//   stat: bài đang mở = số item chưa nộp đủ; đã nộp = tổng submitted/total
```
Bank cần thêm endpoint/list: filter task + genre + q; trả `used` (đếm assignment riêng theo promptId — hay theo classId-distinct tùy hiểu "N lớp").

---

## 6. Kho copy text chuẩn (đối chiếu khi code)
**Bank:** Ngân hàng bài tập / Đề đã lưu sau khi soạn. Lọc theo dạng bài rồi giao cho lớp ở trang Lớp học. / Tạo đề mới / Dạng bài / Tất cả / Task 1 · 150 từ / Task 2 · 250 từ / Dạng đề / Tất cả dạng / Biểu đồ / Bảng số liệu / Bản đồ / Quy trình / Discuss both views / Opinion / Advantages / Problem / Solution / Đang hiện N / M đề / Xóa bộ lọc / Thêm {date} / Bản nháp / Đã dùng N lớp / Sẵn sàng / Task 1 · Band x / Không có đề khớp bộ lọc / Thử dạng bài khác, hoặc xóa bộ lọc để xem toàn bộ ngân hàng. / Xem trước phía học viên / Academic · N từ · M phút · Band x / Đề này chưa giao lớp. Giao cho học viên ở trang Lớp học. / Tìm đề theo tiêu đề hoặc nguồn / Ngân hàng đề / Bài tập / Ngân hàng.

**Class-detail (v2):** IELTS Writing 7.0 — Nhóm tối / IELTS / Band 7.0 · Writing, Speaking · Online / Lịch: T3 & T5 · 19:00–20:30 / Bắt đầu: 12/08/2026 / + Thêm học viên / Giao bài tập / học viên / bài đang mở / đã nộp trên bài mở / lịch cố định / Học viên · Buổi học · Bài tập · Ghi chú / Ổn / Đã học / Sắp tới / Lưu ghi chú / Đã lưu trên trang này. / Bài đã giao lớp này / N/M đã nộp / Chưa giao bài / Giao thêm đề / Chưa giao bài nào cho lớp này. / Hạn {date} · N/M đã nộp / Đã nộp hết / Quá hạn / Đang mở / Đã nộp / Đã nộp · trễ hạn / Chưa nộp · quá hạn / Chưa nộp / Chưa có bài nộp / Chọn đề từ ngân hàng / Đề soạn ở ngân hàng. Trang này chỉ giao cho học viên của lớp đang mở. / Đề sẵn sàng / Thêm đề mới / Tất cả · Task 2 · Task 1 (chips) / Sẵn sàng / Đã giao lớp này / Bản nháp không hiện ở đây. Sửa trong ngân hàng rồi mới giao. / Không có đề Task 1 sẵn sàng. Writing Task 1 — Chart đang là bản nháp trong ngân hàng. / Chọn một đề sẵn sàng trước khi giao. / Giao cho lớp này / Hạn nộp và học viên / Hạn nộp / Chọn hạn nộp từ hôm nay trở đi. / Nhắn học viên (không bắt buộc) / Ví dụ: nộp trước buổi T5, lập dàn ý 4 đoạn. / Học viên trong lớp / Bỏ chọn tất cả / Chọn tất cả / Chọn ít nhất một học viên. / Đề này đã giao lớp này trước đó. (+ bản động: Đề này đã giao lớp này, hạn {date}. Giao lại sẽ thêm lượt mới cho học viên đã chọn.) / Xem trước phía học viên / Chọn một đề / Đề sẽ hiện khi bạn chọn từ ngân hàng. / Có lời nhắn / Chưa chọn đề / Chọn đề sẵn sàng, hạn nộp, rồi chọn học viên. / Chưa chọn học viên / Giao cho ít nhất một học viên trong lớp này. / Thiếu hạn nộp / Hạn phải từ hôm nay (18/09/2026) trở đi. / Giao cho N học viên / Hủy / Đã giao bài tập / "…" đã giao cho lớp … Học viên thấy đề và hạn nộp. Chưa có bài nộp. / Lớp · Đề · Hạn nộp · Đã nộp 0/N / Giao đề khác / Xem bài đã giao / Tìm đề trong ngân hàng / Chi tiết lớp.

**Màu trạng thái (chỉ nơi encode state):** ok/ready = `#16a34a` trên nền xanh pha; warn = fg-2 trên nền vàng pha `#eab308`; danger = `#dc2626` trên nền đỏ pha; neutral tag = muted + border; draft = fg-2 trên `#f5f5f7`; chip active & selected card = đen `#1d1d1f`; primary = `#0071e3`.
