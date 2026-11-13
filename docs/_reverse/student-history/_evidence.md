---
feature: student-history
type: reverse-evidence
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: "develop d6c0f6b5"
---

# Bảng bằng chứng — student-history

Mọi dòng đã đối chiếu với giới hạn dòng file (EOF) bằng `awk 'END{print NR}'`. Lệnh kiểm giới hạn đã chạy cho 34 file trong danh sách nguồn; kết quả ghi ở `reverse-sources.md` (cột Số dòng).

## 1. Endpoints (S1)

- `GET /api/student/history/month?ym=` — apps/server/src/routes/student-history.ts:425-444: `ym` mặc định tháng hiện tại giờ VN (429), 400 khi sai định dạng (430-432), cửa sổ 31 ngày (433), lọc ngày `startsWith(ym)` và `count > 0` (438-441).
- `GET /api/student/history/week?monday=` — 450-498: mặc định tuần hiện tại (454), 400 (455-457), chuẩn về Thứ Hai (458), cửa sổ 7 ngày (459), ma trận kỹ năng × 7 ngày (467-474), bỏ ngày lệch offset (481), `minutes[7]` (474, 485-486, 495).
- `GET /api/student/history?skill=&page=` — 505-551: 400 `skill` (509-516), 400 `page` (517-521), cửa sổ từ 2020-01-01 + 365×30 ngày (526), lọc kỹ năng gồm `hasWriting` (531-538), `pages` (540), slice trang (542-545).
- Mount: apps/server/src/app.ts:30 (import), 443 (`app.route("/api/student", studentHistoryRoutes(deps))`); comment mount 441-442.
- Router docblock khai báo 3 route + ý nghĩa — apps/server/src/routes/student-history.ts:404-411.

## 2. Lõi gom dữ liệu (S1)

- Giới hạn quét: `HISTORY_SCAN_LIMIT` 500 và `VOCAB_SCAN_LIMIT` 2000 — 85-86; áp dụng tại 210.
- `isValidISODate` 92-99; `vietnamWindowUtc` 101-111 (parse `T00:00:00+07:00`).
- `attemptMinutes` 113-118: `max(0, round(ms/60000))`.
- `entryGradeOf` 120-156: nhánh Writing dùng điểm máy khi tổng thành phần > 0 (131-134), ghép `"${objScore} · Band ${band}"` (138); `graded` khi có gradeScores + gradedAt (144-147); Writing/Speaking chưa chấm → `awaiting` (148-150); nhánh thường → auto không có guard tổng 0 (154-155).
- `attemptToEntry` 158-180: Grammar → "writing" kèm comment #533 (160-166), kind theo mode (169), ngày VN (172), `hasWriting` (178).
- `VOCAB_DAY_EXPR` 182-184: `date(%L / 1000, 'unixepoch', '+7 hours')`.
- `vocabDayGroups` 186-220: comment "vòng Learn … không tính là \"ôn từ vựng\" trên lịch sử" (202-204), lọc `sessionKind = "review"` (204), limit 2000 (210).
- `attemptRows` 230-333: comment đề đã xoá → KHÔNG vào lịch sử v1, cả hai nhánh đều inner join nên dòng rớt khi đề/test bị xoá (251-253); nhánh practice join `assignment_test` (254-278); nhánh assignment join `class_assignment` + lọc `visibleAssignmentFilter(new Date())` (279-317, 312); lọc kỹ năng OR writingPart (308-311).
- `vocabToEntry` 335-348: id `vocab-<ngày>`, tiêu đề "Ôn N thẻ từ vựng".
- Quy ước đếm (comment) 352-355; `mergeHistory` 362-402: gộp 3 nguồn, sắp giảm dần theo thời gian (400).

## 3. Hợp đồng (S16) và client (S17, S34)

- History domain packages/api/src/contracts.ts:2295-2389; comment "KHÔNG có Dictation/Mock test" 2298; `HISTORY_SKILLS` 2301; `HISTORY_PAGE_SIZE = 20` 2305; historyDay 2309-2318; monthResponse 2322-2327; weekRow (`days` đúng 7) 2331-2336; weekResponse (`minutes` đúng 7) 2342-2348; kinds 2352; entry (`status` enum 2371, `attemptId` nullable 2373, `hasWriting` tuỳ chọn #574 2375); listResponse 2381-2388; tất cả `.strict()`.
- STUDENT_ERROR_CODES: packages/api/src/contracts.ts:1967-1968 (`NOT_LINKED: "STUDENT_NOT_LINKED"`).
- Client: header `x-student-org-id` apps/student/src/lib/repos/student.ts:55-66; historyGet 627-651; hooks month/week/list 653-720 với staleTime 30_000.
- Summary attempt: apps/student/src/lib/repos/quiz.ts:192 (`fetchAttemptSummary`), 259-261 (`useAttemptSummary`); endpoint server apps/server/src/routes/student.ts:2228.

## 4. Guard và bảo vệ (S20, S33)

- Guard tự gắn trong router lịch sử — apps/server/src/routes/student-history.ts:413-419.
- 401 `UNAUTHORIZED` — apps/server/src/routes/student.ts:128; 403 `EMAIL_UNVERIFIED` — 133-134; 403 `STUDENT_NOT_LINKED` — 169-170, 194-195; header/query org — 181; dò học viên theo email lower/trim — 139-152.
- Test guard NOT_LINKED (trường hợp C, chờ lời mời) — apps/server/src/routes/student-auth-otp.test.ts:160-198.

## 5. Kiểm thử (R1: chỉ đếm, KHÔNG chạy test)

| Bộ | File | Số test/kịch bản | Bằng chứng |
|----|------|------------------|-----------|
| Unit API | apps/server/src/routes/student-history.test.ts | 8 test (567 dòng) | month gom VN 399-416; ym default + 400 418-436; week 438-456; week 400 458-466; list 468-513; skill filter + 400 515-531; cách ly org 533-559; 401 561-566 |
| e2e | apps/e2e/specs/student-history.spec.ts | 2 kịch bản (199 dòng) | test 1: 125-173 (đếm ngày 139-145, URL `week=` 148-151, hàng tuần 153-159, dòng "2/2"+"Tự chấm" 161-167, lọc Writing rỗng 169-172); test 2: 175-192 (nút "(1)" 182-184, URL `?skill=reading` 186, 1 dòng 187-191); helper mondayOfVN 196-199 |
| Component | history-list.test.tsx (194 dòng) | 5 test | chip 75-108 (nhãn chờ chấm thống nhất 91-107); tab 110-119; empty 121-127; mở/ẩn review 129-182; phân trang 184-193 |
| Component | month-heatmap.test.tsx (85 dòng) | 3 test | ARIA "Ngày dd/mm: N bài" 19-40; bấm ô → Thứ Hai 42-59; disabled tương lai + aria-pressed 61-84 |
| Component | week-table.test.tsx (57 dòng) | 3 test | 7 hàng + nhãn 24-35; "1h 06m"/"36m"/"30m" 37-43; "Hôm nay"/"—" 45-56 |
| Component | writing-review.test.tsx (95 dòng) | 2 test | band + tiêu chí + highlight 53-73; spinner + lỗi 75-94 |

## 6. Client wiring (S2, S5-S9, S14-S15)

- validateSearch `week/skill/page` — apps/student/src/routes/_auth/history.tsx:29-42; 4 truy vấn 76-86; thay search toàn phần 90-92; stats gộp 2 tháng 96-118 (streak 104-111); cổng loading gồm monthPrev 120-127; cổng lỗi CHỈ monthNow/week/list 128-141 (chuỗi 136); rỗng 147-150; tiêu đề/mô tả 157-161; empty + CTA 165-178; 3 thẻ 181-221 (188, 191-193, 199, 206, 211, 218); 2 heatmap 224-256; panel tuần 257-269; danh sách + reset trang khi đổi kỹ năng 272-292 (277-283).
- history-list.tsx: comment TOS-30 #478 14-16; STATUS_LABELS 17-21; "Đã ôn" 34; `canReview` 39-46; tabs "Tất cả" 70-76; empty 114-124; headers 128-140; "—" khi null 156; "Xem nhận xét"/"Ẩn nhận xét" 165-179; phân trang "Trước/Trang x / y/Sau" 197-222.
- month-heatmap.tsx: 5 mức màu 15-21; đầu tuần T2..CN 23; vô hiệu ngày tương lai 83, 88; aria-label 90; vòng ngày hiện tại 97-98; chú giải Ít/Nhiều 110-120.
- week-table.tsx: "1h 15m"/"40m" 8-13; "—" ngày tương lai/0 31-38; headers 48-64; "Hôm nay" 75-79; "Tổng" 97-113.
- apps/student/src/components/history/writing-review.tsx: comment #378/#332/#336 10-16; useAttemptSummary 18; lỗi 23-29; "Band tổng" 47-51; tiêu chí 52-69; trích dẫn feedback 70-74; "Giáo viên chưa chấm bài này." 75-79.
- apps/student/src/components/history/history-skill-labels.ts:1-11 — nhãn Reading/Listening/Writing/Speaking (tiếng Anh) + "Từ vựng".
- apps/student/src/components/practice/history-button.tsx:6-8 comment stale; mount tại apps/student/src/routes/_auth/practice/$skill.tsx:118-126; đếm từ `useHistoryList({skill, page:1}, true)` 61-68.

## 7. Mô hình dữ liệu (S21-S27)

- quiz-attempt.ts: bảng `quiz_attempt` 44-83 (mode default "assignment" 61, correctCount 71, gradeScores 74-77, gradedAt 79, submittedAt nullable 83); unique (assignmentId, studentId) 86-89; index `quiz_attempt_student_mode_idx` chú thích "History phase 11" 91-97; comment vì sao KHÔNG có CHECK đảo practice 98-102; CHECK `mode='assignment' ⇒ assignment_id` 103-106.
- vocab.ts: comment idempotency `id = clientLogId` + snapshot sống sót khi xoá deck, trỏ `docs/srs-spec.md` §5 (file vắng mặt → OQ-13) 126-132; bảng `vocab_review_log` 133-157 (sessionKind `"review"|"learn"` 142, grade good/again, reviewedAt, word/translation snapshot); index (studentId, reviewedAt) 151-156.
- assignment-test.ts: `assignment_test` 18-44 (title 25, skill 27, status draft/ready 34); `assignment_test_part` 53-78 (part preset 'task1'/'task2'…, unique (testId, part)).
- assignment-prompt.ts: cột 21-36; cờ writingPart #574 tại 51-52.
- class-assignment.ts: cột 24-40 (availableAt 38, dueAt 37).
- student.ts (schema): bảng `student` 15-45 (email định danh portal, orgId cascade).

## 8. Đối chứng streak (S32)

- Tổng quan từ vựng đếm streak/logs từ `vocab_review_log` **không lọc sessionKind** — apps/server/src/routes/vocab.ts:603-611; vòng lặp streak server 670-685. Đối lập với trang lịch sử: apps/student/src/routes/_auth/history.tsx:96-118 (client, 2 tháng) và apps/server/src/routes/student-history.ts:202-204 (chỉ review khi gom lịch sử).

## 9. Kiểm chứng âm (negative searches — lệnh đã chạy và kết quả)

- NEG-01: `grep -rn "student_history\|history_day\|history_entry" packages/db/src/schema/ packages/db/src/migrations/` → 0 kết quả. Không có bảng lịch sử riêng.
- NEG-02: `grep -rn "invalidateQueries" apps/student/src | grep -i history` → 0 kết quả. Không có invalidation sau nộp bài.
- NEG-03: `grep -rn "historyMonth\|historyWeek\|historyList\|useHistoryMonth\|useHistoryList" apps/student/src apps/server/src packages/api/src -l` → đúng 4 file: history.tsx, $skill.tsx, repos/student.ts, contracts.ts. Không consumer khác.
- NEG-04: `grep -rn "useTranslation\|i18next" apps/student/src` → 0 kết quả. Không i18n catalog (R2).
- NEG-05: `ls apps/student/src/routes/_auth/ | grep history` → chỉ `history.tsx`, không có `history.test.tsx`.
- NEG-06: `git status --short` → không file nguồn của feature Modified (xem reverse-sources.md Mục 7).

## 10. Cross-repo hops

- apps/student (route trang) → packages/api (contracts) → apps/server (route): cùng file zod, không sao chép schema.
- Lịch sử → phase trước: entry Writing `graded` mở summary attempt (S34 → apps/server/src/routes/student.ts:2228) — chi tiết bề mặt viết thuộc bộ `docs/_reverse/student-practice/`.
- Guard dùng chung với mọi route `/api/student` (đã đặc tả trong bộ student-practice) — tại đây chỉ trích bằng chứng 401/403 và header org.
