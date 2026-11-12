---
feature: student-history
type: reverse-srs
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: "develop d6c0f6b5"
confidence_summary: "spec: 93 check-xanh / 4 vong-xanh / 8 vang | toan bo assembly: 199 check-xanh / 16 vong-xanh / 26 vang (dem theo quy tac loai tru dong giai thich)"
---

# Reverse-SRS — Lịch sử học tập phía học viên (student-history, phase 11 #378)

## 0. Nguồn và phạm vi

### 0.1 Bảng nguồn tóm tắt

| ID | Đường dẫn | Vai trò |
|----|-----------|---------|
| S1 | apps/server/src/routes/student-history.ts | Route API lịch sử (3 GET), gom dữ liệu |
| S2 | apps/student/src/routes/_auth/history.tsx | Trang `/history` học viên |
| S3 | apps/e2e/specs/student-history.spec.ts | e2e 2 kịch bản luồng lịch sử |
| S4 | apps/server/src/routes/student-history.test.ts | Unit test API (8 test) |
| S5-S9 | apps/student/src/components/history/* | HistoryList, MonthHeatmap, WeekTable, WritingReview, nhãn kỹ năng |
| S10-S13 | apps/student/src/components/history/*.test.tsx | Test component 4 bộ |
| S14-S15 | apps/student/src/components/practice/history-button.tsx, apps/student/src/routes/_auth/practice/$skill.tsx | Nút vào lịch sử từ trang luyện tập |
| S16 | packages/api/src/contracts.ts | Hợp đồng zod dùng chung (history domain) |
| S17 | apps/student/src/lib/repos/student.ts | Client repo: header org + 4 hook truy vấn |
| S18-S20 | apps/student/src/components/layout/student-nav.tsx, apps/server/src/app.ts, apps/server/src/routes/student.ts | Nav, mount route, guard học viên + endpoint summary |
| S21-S27 | packages/db/src/schema/{quiz-attempt,assignment-test,assignment-test-part (S23 = export cùng file S22),assignment-prompt,class-assignment,vocab,student}.ts | Bảng dữ liệu nguồn (read-model) |
| S28-S31 | packages/api/src/vietnam-date.ts, packages/api/src/lib/ielts-band.ts, apps/server/src/lib/{assignment-visibility,quiz-grade}.ts | Hàm trợ giúp ngày VN, band IELTS, hiển thị assignment, suy ra điểm |
| S32 | apps/server/src/routes/vocab.ts | Route từ vựng (đối chứng streak) |
| S33-S35 | apps/server/src/routes/student-auth-otp.test.ts, apps/student/src/lib/repos/quiz.ts, docs/_reverse/reverse-plan.json (student-practice là cross-ref không ID — Mục 6 reverse-sources.md) | Bằng chứng guard, repo quiz, kế hoạch reverse, cross-ref |

Đặc điểm quyết định phạm vi: **không có bảng/migration riêng cho lịch sử** — toàn bộ dữ liệu được suy ra lúc đọc từ `quiz_attempt` (status `submitted`) và `vocab_review_log` (chỉ phiên `review`) (S1, S21, S26; kiểm chứng âm chi tiết ở `_evidence.md`).

### 0.2 Liên kết tài liệu hiện hành

- Kế hoạch reverse: `docs/_reverse/reverse-plan.json:424-433` (slug `student-history`, 3 nguồn, `existing_doc: null`, confidence `high`, không complexity flags).
- Không có đặc tả gốc #378 trong `docs/` (GAP-7) — bộ tài liệu đảo ngược này là nguồn tham chiếu duy nhất của phase 11.

### 0.3 Tài liệu trong bộ này

- `reverse-sources.md` — danh mục nguồn chi tiết S1-S35.
- `reverse-gaps.md` — OQ-01..OQ-14, GAP-1..GAP-7, INF-1..INF-4.
- `_evidence.md` — bảng bằng chứng, kiểm chứng âm (negative searches), chú thích R1.
- `srs/student-history-reverse-flows.md` — F1..F7.
- `srs/student-history-reverse-states.md` — 3 máy trạng thái.
- `srs/student-history-reverse-erd.md` — ERD dữ liệu nguồn.
- `usecases/student-history-reverse-usecase-index.md` + `usecases/uc-01.md`..`uc-06.md`.

Quy ước nhãn: ✅ code khẳng định tường minh (cite `đường-dẫn:line` trong giới hạn dòng của file); 🔵 suy luận từ ≥2 bằng chứng (ghi cả 2 cite); 🟡 phỏng đoán nghiệp vụ — bắt buộc sinh OQ tương ứng, không bao giờ nâng thành ✅. Ngôn ngữ nghiệp vụ tiếng Việt; định danh kỹ thuật chỉ ở cột Nguồn; chuỗi người dùng trích nguyên văn (R2: repo không có i18n catalog — `_evidence.md` NEG-04).

## 1. Tổng quan

Lịch sử học tập là trang học viên `/history` tổng hợp **mọi bài đã hoàn thành**: bài tự luyện, bài trong lớp (assignment) và phiên ôn từ vựng, trình bày theo ngày (heatmap tháng), theo tuần (bảng theo kỹ năng) và dạng danh sách có lọc/phân trang (S1:404-411, S2:157-161).

- Phase 11 (issue #378) là **read-model thuần**: 3 route GET, không ghi dữ liệu, không bảng riêng (S1:404-411; INF-1).
- Dữ liệu nguồn: `quiz_attempt` (mode `practice` lẫn `assignment`, chỉ `status='submitted'`) và `vocab_review_log` (chỉ `sessionKind='review'`) (S1:230-333, S1:186-220).
- Ranh giới ngày theo **giờ Việt Nam** (Asia/Ho_Chi_Minh) ở cả client lẫn SQL (S28:8-20; S1:182-184; INF-2).
- Điểm hiển thị suy ra tại chỗ: tự chấm "đúng/tổng", giáo viên chấm "Band x.x", chưa chấm → "—" kèm chip "Đã nộp — Đang chờ giáo viên chấm" (S1:120-156; S5:17-21).
- Hợp đồng zod `.strict()` chia sẻ server/client trong `packages/api/src/contracts.ts` (S16:2295-2389).

Phạm vi **không bao gồm** (out of scope): Dictation và Mock test — hợp đồng ghi chú tường minh "KHÔNG có Dictation/Mock test — hai loại này chưa có dữ liệu thật" (S16:2298); hành động chấm bài của giáo viên và nội dung chi tiết đề (thuộc bộ reverse `student-practice`, xem Mục 12).

## 2. Yêu cầu chức năng

| ID | Yêu cầu | Điều kiện | Nguồn (truy vết) |
|----|---------|-----------|------------------|
| FR-01 | ✅ Menu học viên có mục "Lịch sử" dẫn tới `/history` | Cần session học viên để vào route `_auth` | S18:22, S18:45-51, S3:134-135 |
| FR-02 | ✅ Trạng thái trang nằm trên URL: `?week=` (ngày ISO), `?skill=`, `?page=` | Tham số sai định dạng → coi như không có (fallback mặc định) | S2:29-42 |
| FR-03 | ✅ Mở trang tải đồng thời: lịch sử tháng hiện tại, tháng trước, tuần đang chọn, danh sách | staleTime 30s, không tự refetch khi đổi tab trong 30s | S2:76-86, S17:653-720 |
| FR-04 | ✅ 3 thẻ thống kê: "{streak} ngày liên tiếp", "Thời gian học … phút trong tháng này", "Ngày có học … trong tháng này" | Tính từ dữ liệu 2 tháng gộp (FR-05) và tháng hiện tại | S2:181-221 |
| FR-05 | ✅ Chuỗi ngày liên tiếp (streak) tính phía client trên dữ liệu tháng hiện tại + tháng trước | Vòng lặp qua ngày gộp, dừng ở ngày không hoạt động | S2:96-118, S2:104-111 |
| FR-06 | ✅ Khi không có hoạt động: tiêu đề "Chưa có hoạt động nào" + CTA "Bắt đầu luyện tập" dẫn `/practice` | Chỉ khi cả dữ liệu trống và không lỗi | S2:165-178, S2:147-150 |
| FR-07 | ✅ Heatmap tháng: mỗi ô ngày là button, nhãn ARIA "Ngày dd/mm: N bài", màu theo 5 mức đếm, ngày tương lai bị vô hiệu, ô của tuần đang chọn có aria-pressed | Ô 0 bài vẫn bấm được để chọn tuần | S6:15-21, S6:83-98, S11:19-40, S11:61-84 |
| FR-08 | ✅ Bấm ô ngày → đặt `?week=` thành Thứ Hai của tuần chứa ngày đó | Bảng tuần nạp theo tuần mới | S6:42-59, S28:43-46, S3:148-151 |
| FR-09 | ✅ Bảng tuần: 7 hàng ngày Thứ 2 → CN, mỗi kỹ năng một cột đếm, cột thời gian cuối "1h 06m"/"36m"/"—", ngày hiện tại kèm "Hôm nay", hàng "Tổng" cuối bảng (tổng mỗi kỹ năng + tổng phút) | Ngày tương lai hiển thị "—" | S7:8-13, S7:31-38, S7:48-64, S7:75-79, S7:97-113, S13:24-56 |
| FR-10 | ✅ Mô tả panel "Tuần theo kỹ năng": "Tuần này" hoặc "Tuần từ dd/mm" khi khác tuần hiện tại | So sánh với Thứ Hai tuần này | S2:257-269 |
| FR-11 | ✅ Danh sách hoạt động là bảng cột "Ngày / Bài / Điểm / Thời gian / Trạng thái" | Ngày hiển thị dd/mm | S5:128-140, S10:75-88 |
| FR-12 | ✅ Tabs kỹ năng: "Tất cả", Reading, Listening, Writing, Speaking, "Từ vựng" | Nhãn kỹ năng tiếng Anh giữ nguyên, từ vựng tiếng Việt | S5:70-76, S9:1-11, S10:110-119 |
| FR-13 | ✅ Đổi tab kỹ năng → về trang 1 và cập nhật URL | Gộp vào một lần thay search params | S2:272-292, S2:90-92 |
| FR-14 | ✅ Phân trang: nút "Trước"/"Sau", nhãn "Trang x / y", 20 dòng/trang | Phân trang tính trong bộ nhớ ở server sau khi gom và lọc | S5:197-222, S16:2305, S1:526-545 |
| FR-15 | ✅ Dòng entry hiển thị: ngày dd/mm, tiêu đề bài, điểm (hoặc "—"), thời gian phút, chip trạng thái | Điểm null hiển thị "—" | S5:128-165, S10:75-88 |
| FR-16 | ✅ Chip trạng thái: `auto` → "Tự chấm"; `graded` → "Đã chấm"; `awaiting` → "Đã nộp — Đang chờ giáo viên chấm"; entry từ vựng → "Đã ôn" | `awaiting` dùng chung cho practice và assignment (#478) | S5:14-21, S5:34, S10:85-107 |
| FR-17 | ✅ Nút "Xem nhận xét" (đổi thành "Ẩn nhận xét" khi mở) chỉ với entry `graded` có kỹ năng Writing (kể cả bài ghép) và có mã attempt | Chỉ khi entry thỏa mọi điều kiện xem lại | S5:39-46, S5:165-179, S10:129-182 |
| FR-18 | ✅ Khối nhận xét Writing: "Band tổng", điểm từng tiêu chí IELTS theo part, bài luận highlight ghi chú, nhận xét giáo viên dạng trích dẫn | Dữ liệu từ summary attempt đã nộp | S8:10-16, S8:47-74, S12:53-73 |
| FR-19 | ✅ Lỗi tải nhận xét → "Không tải được nhận xét của giáo viên. Vui lòng thử lại."; bài chưa có grade → "Giáo viên chưa chấm bài này." | Loading hiển thị spinner | S8:23-29, S8:75-79, S12:75-94 |
| FR-20 | ✅ Trang luyện tập có nút vào lịch sử kèm số đếm "(N)", dẫn tới `/history?skill=<kỹ năng hiện tại>` | N đếm bằng tổng số entry danh sách (tải trang 1 đủ để lấy total) | S14:1-25, S15:61-68, S15:118-126, S3:175-192 |
| FR-21 | ✅ GET lịch sử tháng: tháng không truyền → tháng hiện tại giờ VN; tháng sai định dạng → lỗi 400; trả danh sách ngày chỉ gồm ngày có hoạt động thuộc tháng yêu cầu | Cửa sổ quét 31 ngày từ đầu tháng | S1:425-444, S4:418-436 |
| FR-22 | ✅ GET lịch sử tuần: tuần không truyền → tuần hiện tại; tự chuẩn về Thứ Hai; ngày không hợp lệ → lỗi 400; trả 7 đếm theo kỹ năng + 7 giá trị phút | Cả mảng đếm ngày và mảng phút đều đúng 7 phần tử theo hợp đồng | S1:450-498, S16:2331-2348, S4:438-466 |
| FR-23 | ✅ GET danh sách: kỹ năng ngoài danh sách → lỗi 400; số trang nhỏ hơn 1 hoặc không nguyên → lỗi 400; trả danh sách dòng kèm số trang, tổng số trang và tổng số dòng; cửa sổ dữ liệu từ 2020-01-01 kéo dài ~30 năm | Phân trang trong bộ nhớ sau khi lọc | S1:505-551, S4:468-531 |
| FR-24 | ✅ Nguồn entry: bài làm đã nộp (cả tự luyện lẫn trong lớp) + nhật ký ôn từ phiên ôn; bài làm dở, bài học viên khác bị loại | Join đề luyện tập và bài trong lớp theo 2 nhánh riêng | S1:230-333, S1:186-220, S4:399-416 |
| FR-25 | ✅ Gộp kết quả 3 nguồn, sắp mới nhất lên đầu; mã entry tiền tố `attempt-`/`vocab-`; đếm ngày = số lượt nộp + số thẻ ôn | Từ vựng gom theo ngày trước rồi mới gộp | S1:335-355, S1:362-402 |
| FR-26 | ✅ Chuẩn hoá kỹ năng: mục Grammar được gộp vào Writing trong lịch sử (#533); lọc Writing bao gồm cả bài ghép có phần Writing (#574) | Entry bài ghép kèm cờ đánh dấu có phần Writing | S1:158-180, S1:308-311, S1:531-538, S16:2373-2375 |
| FR-27 | ✅ Điểm suy ra: tự chấm "đúng/tổng" (bài Writing có điểm máy kèm " · Band x.x"); giáo viên chấm → "Band x.x" (lấy trung bình rồi làm tròn 0.5); chưa chấm → null | Writing chỉ hiện band máy khi có điểm thành phần > 0 | S1:120-156, S29:143-152, S31:12-26, S4:468-513 |
| FR-28 | ✅ Thời lượng = khoảng bắt đầu → nộp bài, làm tròn phút, không âm; entry từ vựng mang tổng phút các thẻ đã ôn trong ngày | Giá trị âm (đồng hồ lệch) bị kẹp về 0 | S1:113-118, S1:335-348 (343), S4:468-513 |
| FR-29 | ✅ Mọi route lịch sử yêu cầu phiên học viên: 401 "UNAUTHORIZED" khi chưa đăng nhập; 403 "STUDENT_NOT_LINKED" khi chưa ghép tài khoản; chọn tổ chức qua header org | Guard tự gắn trong router lịch sử | S1:413-419, S20:121-134, S20:169-170, S20:181, S33:160-198, S4:561-566 |
| FR-30 | ✅ Nhận xét Writing lấy từ endpoint xem lại bài nộp (summary attempt) | Chỉ tải khi mở khối nhận xét | S8:18, S34:192, S34:259-261, S20:2228 |

## 3. Yêu cầu phi chức năng

| ID | Yêu cầu | Nguồn |
|----|---------|-------|
| NFR-01 | ✅ Giới hạn quét: tối đa 500 attempt mỗi nguồn và 2000 nhóm ngày từ vựng mỗi lần gom | S1:85-86, S1:210 |
| NFR-02 | ✅ Bộ nhớ đệm truy vấn 30 giây cho cả 4 hook lịch sử | S17:653-720 |
| NFR-03 | ✅ Truy vấn attempt có index riêng phục vụ lịch sử (org, học viên, mode, thời gian nộp) — chú thích "History phase 11" | S21:91-97 |
| NFR-04 | ✅ Ranh giới ngày theo Asia/Ho_Chi_Minh độc lập múi giờ máy chủ; SQL gom ngày cộng +7 giờ | S28:8-20, S1:182-184, S4:399-416 |
| NFR-05 | ✅ Hợp đồng schema kiểm tra nghiêm (chặn field thừa) chia sẻ cho server và app học viên | S16:2309-2388 |
| NFR-06 | ✅ Khả dụng chuyển tầng (a11y): nhãn ARIA ô ngày, role tab cho kỹ năng, aria-pressed ô tuần đang chọn | S6:90, S5:70-76, S11:76-83 |
| NFR-07 | ✅ Phase 11 không ghi DB — mọi route GET, không INSERT/UPDATE | S1:404-411 (INF-1) |
| NFR-08 | ✅ Che phủ kiểm thử: 8 unit test API + 2 kịch bản e2e + 4 bộ test component | S4, S3, S10-S13 |
| NFR-09 | ✅ Trang `/history` (S2) chưa có file test riêng — chỉ e2e và test component con che phủ | NEG-05 `_evidence.md` |

## 4. Quy tắc nghiệp vụ

- **BR-01** ✅ Một ngày của học viên là ngày giờ VN: bài nộp 23:30 giờ VN vẫn thuộc ngày VN đó dù máy chủ chạy UTC — có test biên 16:30Z/17:30Z. Nguồn: S28:8-20, S1:101-111, S4:399-436.
- **BR-02** ✅ Chỉ bài **đã nộp** (`status='submitted'`, thời gian nộp khác null) được tính; bài làm dở không xuất hiện. Nguồn: S1:230-333, S4:399-416.
- **BR-03** 🟡 Từ vựng chỉ đếm phiên **ôn** (phiên ôn); phiên **học** (học từ mới) không tính — code ghi chú tường minh nhưng lý do nghiệp vụ không có tài liệu. → OQ-02. Nguồn: S1:202-204.
- **BR-04** ✅ Đơn vị đếm: 1 lượt nộp bài = 1, một phiên ôn Đếm theo **số thẻ đã ôn trong ngày** (gom nhóm theo ngày trước). Nguồn: S1:352-355, S1:186-220.
- **BR-05** ✅ Nhóm ngày từ vựng thực hiện ngay trong truy vấn SQL theo ngày VN. Nguồn: S1:182-184, S1:186-220.
- **BR-06** ✅ Trạng thái entry suy ra: có điểm giáo viên + thời điểm chấm → `graded`; Writing/Speaking chưa chấm → `awaiting`; còn lại → `auto`. Nguồn: S1:120-156, S16:2371.
- **BR-07** ✅ Mục Grammar được đổi nhãn thành Writing trong lịch sử (#533) — comment và test cùng khẳng định. Nguồn: S1:158-180 (160-166), S4:468-513.
- **BR-08** ✅ Tuần bắt đầu Thứ Hai (chuẩn ISO); tham số tuần phải trùng Thứ Hai hoặc bị chuẩn về Thứ Hai của ngày truyền lên. Nguồn: S28:43-46, S1:454-459, S3:196-199.
- **BR-09** 🟡 Bài trong lớp chỉ hiện khi đã tới hạn (`available_at` null hoặc ≤ thời điểm xem — lọc tại thời điểm đọc, không phải thời điểm nộp). Lý do chọn lọc-tại-lúc-đọc chưa tài liệu hoá. → OQ-05. Nguồn: S1:312, S30:9-16.
- **BR-10** 🟡 Attempt trỏ đề tự luyện đã bị xoá KHÔNG xuất hiện trong lịch sử — dòng bị loại hẳn vì không còn kỹ năng để xếp; attempt vẫn xem được qua route xem lại bài nộp. Chính sách giữ/dọn sau xoá đề chưa ghi. → OQ-04. Nguồn: S1:251-253, S1:262-268, S1:279-317.
- **BR-11** 🔵 Chuỗi ngày liên tiếp có **hai nguồn tính khác nhau**: trang lịch sử tính client trên 2 tháng gần nhất, còn tổng quan từ vựng tính server trên toàn bộ nhật ký (không lọc phiên). Nguồn: S2:96-118, S32:603-611, S32:670-685. → OQ-03.
- **BR-12** ✅ Thời lượng không âm: kẹp về 0 khi thời gian nộp sớm hơn bắt đầu (đồng hồ lệch). Nguồn: S1:113-118.

## 5. Ma trận lỗi

| ID | Tình huống | Hành vi hệ thống | Nguồn |
|----|-----------|------------------|-------|
| E-01 | ✅ Chưa đăng nhập | 401, mã `UNAUTHORIZED` | S20:128, S4:561-566 |
| E-02 | ✅ Học viên chưa ghép tài khoản (đang chờ lời mời) | 403, mã `STUDENT_NOT_LINKED` | S20:169-170, S32:160-198 |
| E-03 | ✅ Email chưa xác thực | 403, mã `EMAIL_UNVERIFIED` | S20:133-134 |
| E-04 | ✅ `ym` sai định dạng (không phải yyyy-mm) | 400 | S1:430-432, S4:418-436 |
| E-05 | ✅ `monday` sai định dạng hoặc không phải Thứ Hai | 400 | S1:455-457, S4:458-466 |
| E-06 | ✅ `skill` ngoài danh sách hợp lệ (kể cả dictation) | 400 | S1:509-516, S4:515-531 |
| E-07 | ✅ `page` nhỏ hơn 1 hoặc không nguyên | 400 | S1:517-521, S4:515-531 |
| E-08 | ✅ Lỗi tải tháng/tuần/danh sách ở client | Thông báo nguyên văn "Không tải được lịch sử. Vui lòng thử lại." | S2:128-141 |
| E-09 | ✅ Lỗi tải nhận xét Writing | "Không tải được nhận xét của giáo viên. Vui lòng thử lại." | S8:23-29 |
| E-10 | ✅ Mở nhận xét nhưng bài chưa có grade | "Giáo viên chưa chấm bài này." | S8:75-79 |
| E-11 | 🔵 Lỗi tải **tháng trước** không hiển thị lỗi — cổng lỗi chỉ xét tháng hiện tại/tuần/danh sách; thẻ thống kê có thể thiếu dữ liệu im lặng | Người dùng không thấy báo cáo lỗi cho truy vấn phụ | S2:96-118 (stats dùng `monthPrev`), S2:128-141 (điều kiện cổng lỗi) |

## 6. Bản đồ kiểm thử

| ID | Phạm vi kiểm chứng | Loại | Nguồn |
|----|--------------------|------|-------|
| SM-01 | ✅ e2e: nộp bài Reading 2/2 → lịch sử hiển thị đếm ngày, hàng tuần "Hôm nay", dòng danh sách "2/2" + "Tự chấm"; lọc Writing → "Chưa có hoạt động Writing nào." | e2e | S3:125-173 |
| SM-02 | ✅ e2e: nút lịch sử trên trang luyện tập hiển thị "(1)", dẫn tới `/history?skill=reading` với đúng 1 dòng | e2e | S3:175-192 |
| SM-03 | ✅ API: gom nhóm ngày VN (05/10 đếm 3, 36 phút); nhật ký học từ không tính; ngày rỗng biến mất; bài học viên khác/bài làm dở bị loại | unit | S4:399-416 |
| SM-04 | ✅ API: `ym` mặc định theo giờ VN (fake timers 17:30Z → VN 2026-11); `ym` sai → 400 | unit | S4:418-436 |
| SM-05 | ✅ API: tuần chuẩn về Thứ Hai; đếm Reading [1,1,0,…], Từ vựng [2,0,…], phút [36,30,0,…]; tuần sai → 400 | unit | S4:438-466 |
| SM-06 | ✅ API: danh sách total 25 → 2 trang; "Band 6.5" bài chấm; "Ôn 2 thẻ từ vựng"; lọc kỹ năng + 400; cách ly tổ chức; 401 | unit | S4:468-566 |
| SM-07 | ✅ Component: chip trạng thái + "Xem nhận xét"; tab kỹ năng; empty state; mở/ẩn WritingReview; phân trang; heatmap ARIA/chọn tuần/vô hiệu ngày tương lai; bảng tuần "1h 06m"/"Hôm nay"/"—" | jsdom | S10:74-193, S11:18-84, S13:23-56, S12:52-94 |
| SM-08 | 🟡 Chưa có test riêng cho trang `/history` (thẻ thống kê, chuỗi ngày liên tiếp, cổng lỗi) — che phủ chỉ qua e2e một phần | — | NEG-05 → OQ-14 |

## 7. Thực thể dữ liệu (đọc từ mô hình nguồn)

Phase 11 không tạo bảng mới; các bảng sau là **nguồn đọc** (chi tiết cột và quan hệ: `srs/student-history-reverse-erd.md`):

| Thực thể | Vai trò trong lịch sử | Nguồn |
|----------|----------------------|-------|
| quiz_attempt | ✅ Nguồn chính: bài đã nộp (mode `practice`/`assignment`), điểm máy + điểm giáo viên, thời gian bắt đầu/nộp | S21:46-83 |
| assignment_test | ✅ Đề luyện tập: tiêu đề, kỹ năng; bị xoá → attempt mất dòng lịch sử (inner join rớt vì thiếu kỹ năng) | S22:18-44, S1:251-253, S1:262-268 |
| assignment_test_part | ✅ Slot ghép đề; quyết định "bài ghép có Writing" khi lọc/không lọc | S22:53-78, S1:308-311 |
| assignment_prompt | ✅ Ngân hàng đề; cờ writingPart (#574) đánh dấu bài ghép có Writing | S24:21-36, S1:308-311 |
| class_assignment | ✅ Bài giao trong lớp: tiêu đề, thời điểm khả dụng (lọc tại lúc đọc) | S25:24-40, S1:312 |
| vocab_review_log | ✅ Nhật ký ôn/học từ vựng; chỉ phiên `review` được đếm; snapshot từ + nghĩa để sống sót khi xoá deck | S26:126-157 |
| student | ✅ Chủ thể dữ liệu; guard ghép phiên đăng nhập với bản ghi học viên theo email | S27:15-45, S20:139-152 |

## 8. Luồng nghiệp vụ

Danh sách luồng (chi tiết biểu đồ: `srs/student-history-reverse-flows.md`):

- **F1** ✅ Mở trang lịch sử — nav → URL search params → 4 truy vấn song song → trạng thái nạp/xong/lỗi. Nguồn: S2:29-141.
- **F2** ✅ Gom dữ liệu phía máy chủ — quét attempt (2 nhánh join) + nhóm ngày từ vựng → gộp, suy ra điểm/kỹ năng/trạng thái. Nguồn: S1:85-402.
- **F3** ✅ Heatmap tháng và chọn tuần — bấm ô ngày → đặt tuần → bảng tuần nạp lại. Nguồn: S6, S7, S2:224-269.
- **F4** ✅ Danh sách lọc kỹ năng + phân trang — tab → reset trang 1 → cập nhật URL → nạp lại. Nguồn: S5:70-76, S5:197-222, S2:272-292.
- **F5** ✅ Xem lại nhận xét Writing — điều kiện hiện nút → tải summary attempt → vẽ band/tiêu chí/highlight. Nguồn: S5:39-46, S8, S33.
- **F6** ✅ Vào lịch sử từ trang luyện tập — nút kèm số đếm → `/history?skill=`. Nguồn: S14, S15:61-68.
- **F7** 🔵 Dữ liệu mới chảy vào lịch sử — nộp bài luyện tập/bài lớp (phase trước) và phiên ôn từ ghi nhật ký → lần đọc sau của lịch sử tự thấy (read-model). Nguồn: S21:83, S26:133-157, S1:230-333 (INF-1).

## 9. Màn hình và thành phần UI

- ✅ Trang `/history`: tiêu đề "Lịch sử luyện tập", mô tả "Mọi bài đã hoàn thành, theo ngày và theo kỹ năng". Nguồn: S2:157-161.
- ✅ 3 thẻ thống kê với thông điệp động: streak > 0 → "Giữ nhịp học mỗi ngày nhé!", = 0 → "Học hôm nay để bắt đầu chuỗi ngày.". Nguồn: S2:181-221 (188-193).
- ✅ Panel "Hoạt động": 2 heatmap (tháng này + tháng trước) bên cạnh nhau. Nguồn: S2:224-256.
- ✅ Panel "Tuần theo kỹ năng": bảng 7 ngày × 5 kỹ năng + cột thời gian + hàng tổng. Nguồn: S2:257-269, S7:48-64.
- ✅ Panel "Hoạt động" (danh sách): tabs + bảng + phân trang; chip trạng thái 4 loại (FR-16). Nguồn: S2:272-292, S5.
- ✅ Khối nhận xét Writing nhúng trong bảng, đóng/mở tại chỗ. Nguồn: S5:165-179, S8.
- ✅ Nút "Lịch sử (N)" trên trang luyện tập `/practice/:skill`. Nguồn: S14, S15:118-126, S3:182-184.
- ✅ Chuỗi hiển thị tại component (R2 — không có i18n catalog, kiểm chứng âm NEG-04): mọi nhãn ở Mục 2, Mục 5 là nguyên văn trong code. Nguồn: NEG-04 `_evidence.md`.

## 10. Ràng buộc và giới hạn triển khai

- ✅ Cửa sổ quét giới hạn: 500 attempt/nguồn, 2000 nhóm ngày từ vựng — vượt quá bị cắt im lặng (không có tín hiệu báo thiếu). Nguồn: S1:85-86, S1:210. 🟡 Hành vi nghiệp vụ mong muốn khi tràn → OQ-01.
- ✅ Danh sách dùng cửa sổ cố định từ 2020-01-01 dài ~30 năm và phân trang trong bộ nhớ (không LIMIT/OFFSET SQL). Nguồn: S1:526-545.
- ✅ Đếm nút lịch sử tải nguyên trang 20 entry chỉ để lấy tổng. Nguồn: S15:61-68, S16:2305. 🟡 Chi phí chấp nhận? → OQ-11.
- ✅ Comment "Phase 10 CHỈ giao component… caller chưa mount" ở history-button đã lỗi thời — component được mount tại trang luyện tập. Nguồn: S14:6-8, S15:118-126 (GAP-5).
- ✅ Không có i18n catalog (R2); không có bảng lịch sử riêng; không có invalidation sau nộp bài — cập nhật nhờ staleTime 30s + refetch khi quay trang. Nguồn: NEG-01..NEG-04 `_evidence.md`.
- ✅ Việc học từ vựng (learn) vẫn ghi nhật ký nhưng không vào lịch sử; tổng quan từ vựng thì tính cả hai phiên — hai bề mặt khác nhau. Nguồn: S1:202-204, S31:603-611. 🟡 → OQ-02/OQ-03.

## 11. Câu hỏi mở

| ID | Câu hỏi | Liên quan |
|----|---------|-----------|
| OQ-01 | Khi vượt giới hạn quét (500 attempt/nguồn, 2000 nhóm ngày từ vựng), dữ liệu cũ bị cắt im lặng — nghiệp vụ có cần tín hiệu "chưa đầy đủ" hay chấp nhận mất dữ liệu cổ? | S1:85-86, S1:210; NFR-01 |
| OQ-02 | Vì sao phiên học từ (learn) không tính vào lịch sử trong khi vẫn ghi nhật ký — chủ ý "chỉ ôn mới là hoạt động" hay bỏ sót? | S1:202-204; BR-03 |
| OQ-03 | Chuỗi ngày liên tiếp có 2 cách tính (client 2 tháng vs server toàn nhật ký, một bên tính cả phiên học) — chuẩn nghiệp vụ nào là chính để hiển thị cho học viên? | S2:96-118, S31:603-611; BR-11 |
| OQ-04 | Attempt trỏ đề tự luyện đã xoá rơi khỏi lịch sử hoàn toàn — chấp nhận mất dòng lịch sử này hay cần giữ với nhãn "đề đã xoá"? | S1:251-253; BR-10 |
| OQ-05 | Lọc bài lớp theo thời điểm khả dụng tại lúc đọc: bài nộp trước khi tới hạn sẽ rơi khỏi lịch sử — chấp nhận hay cần lọc theo thời điểm nộp? | S1:312, S29:9-16; BR-09 |
| OQ-06 | Thời lượng không có trần: phiên để mở qua đêm sẽ phình số phút — có cần trần thời gian hợp lệ? | S1:113-118; BR-12 |
| OQ-07 | Ô đếm "N bài" trộn hai đơn vị (lượt nộp + thẻ từ) — học viên hiểu thế nào là đúng? | S1:352-355, S6:90; BR-04 |
| OQ-08 | Grammar gộp vào Writing (#533): học viên luyện Grammar sẽ không tìm lại được theo nhãn riêng — chấp nhận hay cần nhãn phụ? | S1:158-180; BR-07 |
| OQ-09 | Entry `graded` không phải Writing không có đường xem lại chi tiết (band, nhận xét) — chủ ý hay thiếu? | S5:39-46; FR-17 |
| OQ-10 | Bài tự chấm có tổng câu = 0 hiện "N/0" (nhánh Writing có chặn, nhánh thường không) — hiển thị đúng phải là gì? | S1:120-156 (131-134 so với 154-155); FR-27 |
| OQ-11 | Nút lịch sử tải cả trang 20 entry chỉ để lấy tổng — tiếp tục dùng hay cần endpoint đếm riêng? | S15:61-68; FR-20 |
| OQ-12 | Chuỗi ngày liên tiếp chưa có định nghĩa nghiệp vụ chính thức (cần tối thiểu 1 lượt nộp hay 1 thẻ ôn cũng đủ? có gắn phần thưởng?) | S2:104-111; FR-05 |
| OQ-13 | Tài liệu hợp đồng nhật ký từ vựng (`docs/srs-spec.md` §5 được comment trỏ tới) không còn trong repo — nguồn quyết định idempotency/snapshot cần phục hồi ở đâu? | S26:126-132 |
| OQ-14 | Trang `/history` chưa có test riêng (thẻ thống kê, streak, cổng lỗi) — có trong kế hoạch che phủ không? | NEG-05; SM-08 |

## 12. Phụ lục truy vết

Ma trận UC ↔ FR ↔ BR ↔ E đầy đủ ở `usecases/student-history-reverse-usecase-index.md`. Ghi chú phạm vi: các UC viết bài (nộp bài luyện tập, ôn từ, chấm bài giáo viên) thuộc bộ `docs/_reverse/student-practice/` — bộ này chỉ đặc tả **bề mặt đọc**; F7 mô tả dòng dữ liệu vào với vai trò tham chiếu.

Số liệu tự kiểm chứng khi soạn: 12 mục, 30 FR, 9 NFR, 12 BR, 11 E, 8 SM, 14 OQ, 7 luồng, 6 UC, 35 nguồn. Cần phản hồi về OQ-01..OQ-14 trước khi nâng `status` lên `accepted`.
