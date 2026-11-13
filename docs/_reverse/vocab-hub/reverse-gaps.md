---
feature: vocab-hub
type: reverse-gaps
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-gaps — vocab-hub

Khoảng trống, câu hỏi mở, tìm-kiếm-phủ-định — draft

Mục lục: (1) OQ tra ngược về spec Mục 12; (2) R3 negative-search — MỌI khẳng
định "không tồn tại" trong assembly đều có lệnh + kết quả thật dưới đây; (3)
GAP — thứ mã nguồn không trả lời được; (4) INF — suy luận nhiều bằng chứng;
(5) CF — mâu thuẫn nội bộ phát hiện và cách xử.

## Câu hỏi mở (tra chéo spec Mục 12)

OQ-01..OQ-11 liệt kê ở vocab-hub-reverse-spec.md Mục 12. Ba OQ trọng nhất:
OQ-01 (srs-spec.md bị trích nhưng không tồn tại), OQ-02 (đường đổi tên bộ từ
không UI), OQ-03 (tạo bộ từ thất bại im lặng).

## R3 — Tìm-kiếm-phủ-định (negative-search)

Mỗi mục = khẳng định phủ định + lệnh đã chạy + kết quả thật (đếm dòng/cây rút
gọn). Chạy tại gốc repo @ d6c0f6b5.

### #1 — docs/srs-spec.md không tồn tại

```bash
ls docs/srs-spec.md; grep -rn "srs-spec" --include="*.ts" --include="*.md" packages/db/src/schema plans docs | head -20
```
Kết quả: `ls: cannot access 'docs/srs-spec.md': No such file or directory`;
grep trả 13 hit: packages/db/src/schema/vocab.ts:85 (§1), :127 (§5),
plans/261019-0323-vocab-independent-hub/plan.md:69, plans/261017-1950-student-vocab-srs-game/
{plan.md:21,28, phase-01-srs-engine-core.md:10,27,48,60, phase-02-schema-migration-contracts.md:10,
phase-04-session-engines-quiz-generator.md:10}, plans/journals/2026-10-17-plan-student-vocab-srs-game-
port-flinto-issue-359.md:11, plans/261019-0648-student-full-vocab-courses/plan.md:42.
→ Spec Mục 0.3 🟡 OQ-01 (kết luận giữ nguyên: docs/srs-spec.md KHÔNG tồn tại).

### #2 — Không UI gọi hành động đổi tên bộ từ

```bash
grep -rn "renameVocabDeck\|rename-vocab-deck" apps/web/src apps/server/src packages/api/src
```
Kết quả: đúng 2 hit — apps/web/src/lib/data-actions.ts:298 (khai báo),
apps/web/src/lib/repos/kernel.ts:317 (ánh xạ). Route xử lý là
routes.post("/decks/rename") tại apps/server/src/routes/vocab-teacher.ts:176
(không khớp mẫu grep trên). Không component nào import/gọi. → FR-19 ✅ (đường chết).

### #3 — Chỉ MỘT mount vocab trên kernel

```bash
grep -n "vocab" apps/server/src/routes/kernel.ts
```
Kết quả: 4 hit — 141-142 (import), 3515-3516 (chú thích #359 "single mount"),
3517 (route("/kernel/vocab", ...)), 3520 (mount sau). Không có "/api/vocab"
thứ hai. → Mục 11 ✅.

### #4 — Không phân trang / lọc danh sách bộ từ phía máy chủ

```bash
grep -n "limit\|offset\|page" apps/server/src/routes/vocab-teacher.ts
grep -n "limit\|offset\|page" apps/server/src/routes/snapshot.ts
```
Kết quả thật: vocab-teacher.ts 15 hit — TẤT CẢ đều là `.limit(1)` của các
tra cứu một dòng để trả 404 (dòng 93, 152, 226, 287, 356, 366, 395, 451, 472,
511...), không cái nào nằm trong truy vấn danh sách; snapshot.ts 0 hit. Hai
truy vấn danh sách thật — GET decks/:id/words (vocab-teacher.ts:83-133) và
danh sách deck của snapshot (snapshot.ts:386-410) — không có limit/offset:
trả toàn bộ. Phân trang DUY NHẤT trong cụm là xem trước từ thư viện
(vocab-library.ts:168-174, default 20 / max 50). → FR-02/FR-18, OQ-04.

### #5 — Không có catalog i18n cho vocab

```bash
find apps/web/src -iname "*i18n*" -o -iname "*locale*" -o -iname "*translation*" | grep -v node_modules
grep -rn "useTranslation\|t(" apps/web/src/components/vocab/*.tsx | grep -v "it(" | head
```
Kết quả: find rỗng; grep không có hit i18n nào trong 8 component vocab — mọi
chuỗi là literal. → NFR-07 ✅.

### #6 — Route giáo viên không tạo/sửa thẻ hay nhật ký

```bash
grep -cn "insert(vocabCard)" apps/server/src/routes/vocab-teacher.ts
grep -cn "insert(vocabReviewLog)" apps/server/src/routes/vocab-teacher.ts
grep -cn "update(vocabCard)\|update(vocabReviewLog)" apps/server/src/routes/vocab-teacher.ts
grep -cn "delete(vocabCard)" apps/server/src/routes/vocab-teacher.ts
grep -cn "delete(vocabReviewLog)" apps/server/src/routes/vocab-teacher.ts
```
Kết quả lần lượt: 0, 0, 0, 2, 0 — KHÔNG có insert/update thẻ hay nhật ký nào
ở route giáo viên (2 hit delete(vocabCard) nằm trong lô xoá tường minh của
FR-06/FR-09, đúng như spec mô tả; nhật ký không bị xoá 0 hit củng cố BR-05). →
BR-13 ✅.

### #7 — Không skip/todo/only trong test vocab

```bash
grep -rn "\.skip\|\.todo\|\.only\|it.skip\|describe.skip" apps/server/src/routes/vocab-teacher.test.ts apps/server/src/routes/vocab-library.test.ts packages/db/src/schema/vocab.test.ts packages/db/src/seed/vocab-library.test.ts apps/web/src/components/vocab/vocab-hub.test.tsx apps/web/src/components/vocab/vocab-library-dialog.test.tsx apps/e2e/specs/vocab-hub-suggestion.spec.ts apps/e2e/specs/vocab-library-clone.spec.ts apps/e2e/specs/vocab-srs.spec.ts
```
Kết quả: 0 hit. Tất cả test đều bật.

### #8 — Không breadcrumb cho /vocab

```bash
grep -n "vocab" apps/web/src/components/layout/app-shell.tsx
```
Kết quả: 0 hit (ROUTE_CRUMBS từ :31 không có mục /vocab; tiêu đề trang đến từ
component tự render). → Mục 10, OQ-09.

### #9 — Không công tắc ẩn/hiện mục Từ vựng

```bash
grep -n "vocab" apps/web/src/components/layout/sidebar.tsx
```
Kết quả: hit :103 (mục) và :201 (map active-key) — KHÔNG có biến điều kiện/flag nào
bọc mục này (so sánh: một số mục khác trong cùng file có điều kiện role/flag).
grep thêm `grep -rn "features\." apps/web/src/components/layout/sidebar.tsx`
→ 0 hit liên quan vocab. → FR-01 ✅.

### #10 — Không biến môi trường cấu hình riêng cho vocab

```bash
grep -rn "VOCAB_" apps/server/src apps/web/src packages/db/src packages/api/src | grep -v test | grep -v "\.test\."
```
Kết quả: chỉ hằng số tên vùng lỗi/định danh (VOCAB_ERROR_CODES,
VOCAB_DECK_NOT_FOUND...); không có process.env.* riêng của vocab ngoài
MEDIA_* dùng chung (media-store.ts). Trần và cấu hình đều là hằng số mã nguồn.

## GAP — Mã nguồn không trả lời được

- **GAP-1.** Ý định nghiệp vụ của srs-spec.md (mất) — nội dung §1/§5 thuật toán
  5 cấp độ chỉ còn suy ra từ schema + test. 🟡 OQ-01.
- **GAP-2.** Nhánh đua tranh 500 của gửi gợi ý (vocab-teacher.ts:440-453) không
  có test kích hoạt; chưa chứng minh được trên môi trường thật. Đã ghi E-25.
- **GAP-3.** Hiển thị ghi chú gợi ý phía học viên — nằm ngoài mã feature này
  (student-practice); chỉ xác nhận được trường dữ liệu và mã lỗi đã tồn tại
  (vocab.ts:861). 🟡 OQ-07.
- **GAP-4.** Độ sẵn sàng của CDN âm thanh thư viện (URL mochidemy trong test là
  dữ liệu giả lập) — không đo được từ mã. 🟡 OQ-08.
- **GAP-5.** Quy mô tối đa thực tế của hub (bao nhiêu bộ từ là quá nhiều cho
  bản chụp) — không có benchmark trong repo. 🟡 OQ-04.

## INF — Suy luận từ ≥2 bằng chứng (không phải factcode)

- **INF-1.** Mục tiêu sản phẩm của hub là "bộ công cụ chuẩn bị bài giảng từ
  vựng cho giáo viên, gán cho học viên theo 3 kênh (lớp/gợi ý/thư viện)" —
  INF từ: mô hình tiếp cận 3 nguồn (vocab-provision.ts:72-108) + huy hiệu
  nguồn 5 loại trên UI (progress-tab.tsx:38-46) + luồng gợi ý có ghi chú.
- **INF-2.** Trần 50/500 của nhân bản tồn tại để bảo vệ bản chụp và D1 (không
  phải giới hạn thương mại) — INF từ: kiểm 2 lần phía server (vocab-library.ts:246-257,281-292)
  + client chặn trước đúng cùng ngưỡng (library-dialog.tsx:14-15) + không có
  config/billing liên quan.
- **INF-3.** Thẻ libword-* được bảo vệ vì học viên học TRỰC TIẾP khóa thư viện
  qua bản sao bộ từ của giáo viên — INF từ: BR-11 (2 điểm loại trừ trong xoá)
  + migration 0039 bỏ FK để thẻ sống qua vòng đời bộ từ + mô hình tiếp cận
  "thư viện có thẻ" (vocab-provision.ts:168-197).
- **INF-4.** Tab "Tiến độ" tách khỏi bản chụp vì dữ liệu là per-student và
  cần mốc thời gian hôm-nay (không thể cache org-wide) — INF từ: endpoint riêng
  đòi studentId (vocab-teacher.ts:498-504) + bản chụp chỉ có dữ liệu org
  (snapshot.ts:386-410) + học viên được chọn runtime trên UI (progress-tab.tsx:129-138).

## CF — Mâu thuẫn nội bộ đã xử

- **CF-1.** Tiêu đề trang tab "Bộ từ vựng" vs. chữ gợi ý "Ví dụ: Topic 1..." —
  không mâu thuẫn; chỉ ghi chú R2: tiêu đề nhóm là "Từ vựng SRS"
  (vocab-deck-list.tsx:178) còn tab là "Bộ từ vựng" (index.tsx:31-35).
- **CF-2.** Migration 0036 ban đầu đặt class_id NOT NULL + FK word_id trên
  thẻ; 0038/0039 lần lượt gỡ — đọc theo thứ tự thời gian nên spec chỉ mô tả
  trạng thái cuối (0039). Không ghi trạng thái trung gian vào ERD. ✅
  0036_bored_infant_terrible.sql (soát lại toàn văn) vs 0038/0039.
- **CF-3.** Test e2e gợi ý (S43) mô tả học viên "accept" gợi ý — thuộc
  student-practice; xử: giữ ở ranh giới FR-23, không đặc tả hành vi accept
  trong feature này. apps/e2e/specs/vocab-hub-suggestion.spec.ts:1-523.

## R1 — Đào test + tình trạng git khi soạn

- Lệnh đếm: `grep -c "^  it(" <file>` và `grep -n "it(" <file>`. Kết quả khớp
  spec Mục 7: vocab-teacher.test.ts 5 it; vocab-library.test.ts 6;
  schema/vocab.test.ts 3; seed/vocab-library.test.ts 7; vocab-hub.test.tsx 2;
  vocab-library-dialog.test.tsx 3; e2e 3+3+3. Tổng 35 khối test tham chiếu
  trực tiếp hành vi vocab-hub (5+6+3+7+2+3+3+3+3). ✅
- Git status tại thời điểm soạn (2026-11-12): KHÔNG file nguồn vocab nào dirty
  — dirty chỉ có .gitignore, biome.json, apps/server/src/routes/admin-library-audio.test.ts
  (feature #413 admin — khác feature) và các file __tmp__materials-check__*
  của agent song song. Lệnh: `git status --porcelain | grep -i vocab` → chỉ
  1 dòng admin-library-audio (không thuộc vocab-*). Nghĩa là mọi line-number
  trong assembly trỏ vào mã clean @ d6c0f6b5. ✅
