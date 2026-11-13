---
feature: student-practice
type: reverse-source-map
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-sources — student-practice

Bảng tài nguyên S. Range kiểm bằng đếm dòng thực tế (awk END NR), không dùng wc -l.

| S-id | Path | Loại | Range | Confidence | Encoding | Ghi chú |
|---|---|---|---|---|---|---|
| S1 | apps/server/src/routes/vocab.ts | code | 1-1245 | ✅ | ts | 9 route học viên + write guard + proxy âm thanh |
| S2 | apps/server/src/routes/student.ts | code | 1-2410 | ✅ | ts | kernel học viên; gắn vocab routes dòng 2407 |
| S3 | apps/server/src/app.ts | code | 1-481 | ✅ | ts | mount `/api/student` dòng 440 |
| S4 | packages/api/src/srs/scheduler.ts | code | 1-88 | ✅ | ts | applyAnswer/learned + hằng số khoảng |
| S5 | packages/api/src/srs/review-session.ts | code | 1-393 | ✅ | ts | máy trạng thái phiên ôn |
| S6 | packages/api/src/srs/learn-session.ts | code | 1-443 | ✅ | ts | máy trạng thái phiên học |
| S7 | packages/api/src/srs/quiz-generator.ts | code | 1-271 | ✅ | ts | sinh đề 4 lựa chọn + hạng A/B/C |
| S8 | packages/api/src/srs/quiz-rules.ts | code | 1-61 | ✅ | ts | chuẩn hóa + gợi ý gõ từ |
| S9 | packages/api/src/srs/rng.ts | code | 1-57 | ✅ | ts | crypto random + shuffle |
| S10 | packages/api/src/srs/format.ts | code | 1-42 | ✅ | ts | format khoảng cách + đếm ngược |
| S11 | packages/api/src/vietnam-date.ts | code | 1-316 | ✅ | ts | ngày ISO múi giờ VN |
| S12 | packages/api/src/srs/index.ts | code | 1-7 | ✅ | ts | barrel export |
| S13 | packages/api/src/contracts.ts | code | 1-4799 | ✅ | ts | phần vocab 3089-3616 |
| S14 | apps/server/src/lib/vocab-provision.ts | code | 1-756 | ✅ | ts | access predicate + ensureDeckCards + loadPool |
| S15 | packages/db/src/schema/vocab.ts | code | 1-203 | ✅ | ts | 5 bảng lõi + invariant comment |
| S16 | packages/db/src/schema/vocab-library.ts | code | 1-83 | ✅ | ts | 3 bảng thư viện |
| S17 | packages/db/src/migrations/0036_bored_infant_terrible.sql | migration | 1-66 | ✅ | sql | 4 bảng lõi đầu tiên |
| S18 | packages/db/src/migrations/0037_cheerful_gambit.sql | migration | 1-48 | ✅ | sql | 3 bảng thư viện + audio_url + source_library_deck_id |
| S19 | packages/db/src/migrations/0038_wise_blizzard.sql | migration | 1-45 | ✅ | sql | vocab_suggestion + class_id nullable |
| S20 | packages/db/src/migrations/0039_ambiguous_prowler.sql | migration | 1-28 | ✅ | sql | recreate vocab_card — word_id đa hình (#366) |
| S21 | packages/db/src/migrations/0040_deep_oracle.sql | migration | 1-1 | ✅ | sql | ALTER thêm mô tả khóa thư viện |
| S22 | apps/student/src/routes/_auth/practice/index.tsx | client route | 1-13 | ✅ | tsx | `/practice` → `/practice/reading` |
| S23 | apps/student/src/routes/_auth/practice/vocabulary/index.tsx | client route | 1-333 | ✅ | tsx | trang tổng quan |
| S24 | apps/student/src/routes/_auth/practice/vocabulary/$deckId.tsx | client route | 1-224 | ✅ | tsx | trang bộ từ |
| S25 | apps/student/src/routes/_auth/practice/vocabulary/$deckId.session.tsx | client route | 1-89 | ✅ | tsx | validateSearch mode learn/review |
| S26 | apps/student/src/routes/_auth/practice/vocabulary/courses/index.tsx | client route | 1-227 | ✅ | tsx | danh mục khóa |
| S27 | apps/student/src/routes/_auth/practice/vocabulary/courses/$courseId.tsx | client route | 1-266 | ✅ | tsx | chi tiết khóa |
| S28 | apps/student/src/routes/_auth/vocab/index.tsx | client route | 1-11 | ✅ | tsx | legacy redirect |
| S29 | apps/student/src/routes/_auth/vocab/$.tsx | client route | 1-11 | ✅ | tsx | legacy redirect đường con |
| S30 | apps/student/src/lib/legacy-vocab-redirect.ts | client lib | 1-32 | ✅ | ts | chuẩn hóa đích redirect |
| S31 | apps/student/src/components/vocab/vocab-session-view.tsx | client component | 1-697 | ✅ | tsx | view phiên: engine, phím, dialog |
| S32 | apps/student/src/components/vocab/vocab-feedback-panel.tsx | client component | 1-120 | ✅ | tsx | phản hồi câu + persist retry |
| S33 | apps/student/src/components/vocab/wrong-streak-overlay.tsx | client component | 1-46 | ✅ | tsx | overlay 5 câu khó |
| S34 | apps/student/src/components/vocab/vocab-summary.tsx | client component | 1-180 | ✅ | tsx | tổng kết learn/review |
| S35 | apps/student/src/components/vocab/vocab-countdown.tsx | client component | 1-53 | ✅ | tsx | đếm ngược 1 giây/lần |
| S36 | apps/student/src/components/vocab/vocab-lesson-card.tsx | client component | 1-181 | ✅ | tsx | trạng thái bài học + bắt đầu từ đây |
| S37 | apps/student/src/components/vocab/vocab-pronunciation-buttons.tsx | client component | 1-119 | ✅ | tsx | Nghe / Nghe chậm 0.6x |
| S38 | apps/student/src/components/vocab/vocab-courses-cta.tsx | client component | 1-62 | ✅ | tsx | CTA khóa học |
| S39 | apps/student/src/components/vocab/vocab-suggestion-list.tsx | client component | 1-129 | ✅ | tsx | danh sách gợi ý |
| S40 | apps/student/src/components/vocab/prompt-typing.tsx | client component | 1-88 | ✅ | tsx | prompt gõ từ |
| S41 | apps/student/src/lib/repos/vocab.ts | client lib | 1-234 | ✅ | ts | fetchers + query keys |
| S42 | apps/student/src/lib/query-client.ts | client lib | 1-65 | ✅ | ts | staleTime 60s |
| S43 | apps/server/src/routes/vocab.test.ts | test | 1-1501 | ✅ | ts | 16 test API (R1) |
| S44 | apps/server/src/routes/student-practice.test.ts | test | 1-786 | ✅ | ts | 17 test phân hệ luyện đề (catalog/start/submit/grading) |
| S45 | apps/e2e/specs/vocab-srs.spec.ts | e2e | 1-665 | ✅ | ts | 3 test serial chu trình SRS |
| S46 | apps/e2e/specs/student-practice.spec.ts | e2e | 1-239 | ✅ | ts | 4 test: catalog+nộp+điểm, không lọt bảng điểm lớp, empty state, nav vocab |
| S47 | packages/api/src/srs/scheduler.test.ts | test | 1-52 | ✅ | ts | vectors 14 đáp án + 3 learn |
| S48 | packages/api/src/srs/review-session.test.ts | test | 1-210 | ✅ | ts | 6 test phiên ôn |
| S49 | packages/api/src/srs/learn-session.test.ts | test | 1-190 | ✅ | ts | phiên học |
| S50 | packages/api/src/srs/quiz-generator.test.ts | test | 1-186 | ✅ | ts | 4 test sinh đề |
| S51 | packages/api/src/srs/quiz-rules.test.ts | test | 1-40 | ✅ | ts | 36 vector gõ từ |
| S52 | packages/api/src/srs/format.test.ts | test | 1-41 | ✅ | ts | 8 khoảng + 12 đếm ngược |
| S53 | packages/api/src/vietnam-date.test.ts | test | 1-262 | ✅ | ts | 13 test ngày VN |
| S54 | packages/db/src/schema/vocab.test.ts | test | 1-491 | ✅ | ts | 3 test migration |
| S55 | apps/student/src/components/vocab/vocab-session-view.test.tsx | test | 1-559 | ✅ | tsx | 12 test view phiên |
| S56 | packages/api/src/srs/vectors/level-vectors.json | fixture | 1-1024 | ✅ | json | conformance vectors (Flinto) |

Bổ sung phân hệ luyện đề (S57..S69): | S-id | Path | Loại | Range | Confidence | Encoding | Ghi chú |
|---|---|---|---|---|---|---|
| S57 | apps/server/src/routes/student-practice.ts | code | 1-471 | ✅ | ts | 3 route practice + loader đề + gộp câu + nhãn điểm |
| S58 | apps/student/src/routes/_auth/practice/$skill.tsx | client route | 1-141 | ✅ | tsx | catalog theo kỹ năng + start + toast lỗi |
| S59 | apps/student/src/routes/_auth/learn/quizzes/practice/$testId.tsx | client route | 1-50 | ✅ | tsx | loader đề luyện → view làm bài chung |
| S60 | apps/student/src/components/practice/skill-catalog.tsx | client component | 1-197 | ✅ | tsx | lưới thẻ đề + empty state |
| S61 | apps/student/src/components/practice/practice-filters.tsx | client component | 1-95 | ✅ | tsx | bộ lọc collection/tìm kiếm/trang |
| S62 | apps/student/src/components/practice/history-button.tsx | client component | 1-25 | ✅ | tsx | nút sang Lịch sử (phase 11 cross-ref) |
| S63 | apps/student/src/lib/repos/student.ts | client lib | 1-867 | ✅ | ts | fetchPracticeCatalog + startPractice + hooks |
| S64 | apps/student/src/lib/repos/quiz.ts | client lib | 1-431 | ✅ | ts | nguồn đề assignment/practice + submit dùng chung |
| S65 | apps/student/src/components/quiz/quiz-take-view.tsx | client component | 1-621 | ✅ | tsx | view làm bài dùng chung (thuộc student-quiz) |
| S66 | packages/api/src/lib/ielts-band.ts | code | 1-152 | ✅ | ts | ieltsOverallBand + formatBand |
| S67 | apps/server/src/lib/media-response.ts | code | 1-46 | ✅ | ts | toQuizAttemptMedia (media bài nói) |
| S68 | apps/student/src/components/practice/practice-catalog.test.tsx | test | 1-229 | ✅ | tsx | test catalog component |
| S69 | packages/db/src/schema/quiz-attempt.ts | code | 1-108 | ✅ | ts | bảng lượt làm bài chung (mode practice) |

Không có S-id nào trỏ
tài liệu `.md` trong repo (không có tài liệu feature hiện có — Mục 0.3).
