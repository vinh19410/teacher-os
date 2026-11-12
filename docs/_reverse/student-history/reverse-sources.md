---
feature: student-history
type: reverse-sources
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: "develop d6c0f6b5"
---

# Nguồn đảo ngược — student-history

Mọi đường dẫn dưới đây được kiểm tra tồn tại và đếm số dòng bằng `awk 'END{print NR}'` tại commit develop d6c0f6b5 (bảng bằng chứng chi tiết: `_evidence.md`).

## 1. Nguồn nghiệp vụ chính (bắt buộc theo kế hoạch)

| ID | Đường dẫn | Số dòng | Ghi chú |
|----|-----------|---------|---------|
| S1 | apps/server/src/routes/student-history.ts | 554 | 3 route GET + gom dữ liệu + suy ra điểm/kỹ năng/trạng thái |
| S2 | apps/student/src/routes/_auth/history.tsx | 299 | Trang `/history`: search params, 4 truy vấn, thẻ thống kê, 3 panel |
| S3 | apps/e2e/specs/student-history.spec.ts | 199 | 2 kịch bản e2e (SM-01, SM-02) |

## 1b. Unit test API

| S4 | apps/server/src/routes/student-history.test.ts | 567 | 8 test unit API |

## 2. Component UI và test component

| ID | Đường dẫn | Số dòng |
|----|-----------|---------|
| S5 | apps/student/src/components/history/history-list.tsx | 225 |
| S6 | apps/student/src/components/history/month-heatmap.tsx | 123 |
| S7 | apps/student/src/components/history/week-table.tsx | 117 |
| S8 | apps/student/src/components/history/writing-review.tsx | 83 |
| S9 | apps/student/src/components/history/history-skill-labels.ts | 11 |
| S10 | apps/student/src/components/history/history-list.test.tsx | 194 |
| S11 | apps/student/src/components/history/month-heatmap.test.tsx | 85 |
| S12 | apps/student/src/components/history/writing-review.test.tsx | 95 |
| S13 | apps/student/src/components/history/week-table.test.tsx | 57 |
| S14 | apps/student/src/components/practice/history-button.tsx | 25 |
| S15 | apps/student/src/routes/_auth/practice/$skill.tsx | 141 |

## 3. Hợp đồng, client, điều hướng, mount

| ID | Đường dẫn | Số dòng | Ghi chú |
|----|-----------|---------|---------|
| S16 | packages/api/src/contracts.ts | 4799 | History domain: dòng 2295-2389; STUDENT_ERROR_CODES: 1967-1968 |
| S17 | apps/student/src/lib/repos/student.ts | 867 | Header org 55-66; 4 hook lịch sử 627-720 |
| S18 | apps/student/src/components/layout/student-nav.tsx | 131 | Cờ route sống 22; mục nav 45-51 |
| S19 | apps/server/src/app.ts | 481 | Import 30; mount 443 |
| S20 | apps/server/src/routes/student.ts | 2410 | Guard 121-195; header org 181; summary attempt 2228 |

## 4. Mô hình dữ liệu nguồn (read-model)

| ID | Đường dẫn | Số dòng | Ghi chú |
|----|-----------|---------|---------|
| S21 | packages/db/src/schema/quiz-attempt.ts | 108 | Cột 46-83; index lịch sử 91-97; CHECK mode 98-106 |
| S22 | packages/db/src/schema/assignment-test.ts | 78 | assignment_test 18-44; assignment_test_part 53-78 |
| S23 | (trong S22) | — | assignment_test_part là export cùng file |
| S24 | packages/db/src/schema/assignment-prompt.ts | 67 | Cột 21-36; cờ writingPart #574 |
| S25 | packages/db/src/schema/class-assignment.ts | 78 | Cột 24-40; availableAt 38 |
| S26 | packages/db/src/schema/vocab.ts | 203 | vocab_review_log 133-157; comment idempotency 126-132 |
| S27 | packages/db/src/schema/student.ts | 71 | Bảng `student`: định danh email, org |

## 5. Hàm trợ giúp và đối chứng

| ID | Đường dẫn | Số dòng | Ghi chú |
|----|-----------|---------|---------|
| S28 | packages/api/src/vietnam-date.ts | 316 | vietnamDateKeyOf 8-20; mondayOfISO 43-46; addMonthsISO 50-62 |
| S29 | packages/api/src/lib/ielts-band.ts | 152 | criterionLabel 117-126; ieltsOverallBand 143-147; formatBand 150-152 |
| S30 | apps/server/src/lib/assignment-visibility.ts | 16 | visibleAssignmentFilter 9-16 |
| S31 | apps/server/src/lib/quiz-grade.ts | 37 | toQuizAttemptGrade 12-26 |
| S32 | apps/server/src/routes/vocab.ts | 1245 | Tổng quan từ vựng: streak query 603-611 (không lọc phiên) |
| S33 | apps/server/src/routes/student-auth-otp.test.ts | 200 | NOT_LINKED 160-198 |
| S34 | apps/student/src/lib/repos/quiz.ts | 431 | fetchAttemptSummary 192; useAttemptSummary 251-262 |
| S35 | docs/_reverse/reverse-plan.json | — | Mục student-history 424-433 |

## 6. Tài liệu tham chiếu (cross-ref, không đếm dòng)

- `docs/_reverse/student-practice/` — bộ reverse phase 10: đặc tả bề mặt viết (nộp bài, làm bài, chấm). Bộ này chỉ cross-ref các phần luyện tập/ôn từ; không sao chép nội dung.
- `docs/_reverse/reverse-plan.json:424-433` — đăng ký feature trong kế hoạch đảo ngược.

## 7. Kiểm chứng trạng thái working tree

`git status --short` tại thời điểm soạn: không có file nguồn của feature nào ở trạng thái Modified (chỉ `.gitignore`, `apps/server/src/routes/admin-library-audio.test.ts`, `biome.json` — ngoài phạm vi). Toàn bộ cite `đường-dẫn:line` khớp commit d6c0f6b5.
