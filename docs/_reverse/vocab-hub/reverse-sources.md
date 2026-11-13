---
feature: vocab-hub
type: reverse-source-map
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-sources — vocab-hub

Tất cả đường dẫn tính từ gốc repo `/root/projects/teacher-os`, nhánh develop @
d6c0f6b5. Range là số dòng kiểm bằng `awk 'END{print NR}'` (một số file không
có dòng trống cuối). "Encoding" = loại bằng chứng: CODE (mã chạy), TEST (kiểm
thử), E2E (kiểm thử trình duyệt), MIG (migration), SEED (dữ liệu), DOC (tài
liệu), PLAN (tài liệu hoạch định), META (metadata reverse).

| S-id | Path | Loại | Range | Confidence | Encoding | Ghi chú |
|---|---|---|---|---|---|---|
| S1 | packages/db/src/schema/vocab.ts | CODE | 1-203 | HIGH | CODE | 4 bảng học tập; chú thích doctrine + #359/#361/#363/#366 |
| S2 | packages/db/src/schema/vocab-library.ts | CODE | 1-83 | HIGH | CODE | 3 bảng thư viện; định danh suy ra từ seed |
| S3 | packages/api/src/contracts.ts | CODE | 1-4799 | HIGH | CODE | Phần vocab: 1946-1947, 2423, 3090-3466 |
| S4 | apps/server/src/routes/vocab-teacher.ts | CODE | 1-883 | HIGH | CODE | Route giáo viên: CRUD + audio + gợi ý + tiến độ |
| S5 | apps/server/src/routes/vocab-library.ts | CODE | 1-367 | HIGH | CODE | Duyệt + nhân bản thư viện |
| S6 | apps/server/src/routes/kernel.ts | CODE | 1-3523 | HIGH | CODE | CSRF 186-206; mount vocab 3515-3520 |
| S7 | apps/server/src/routes/snapshot.ts | CODE | 1-873 | HIGH | CODE | Truy vấn vocab 386-410; chiếu 833-848 |
| S8 | apps/server/src/app.ts | CODE | 1-481 | HIGH | CODE | Chặn student/admin 224-241; allowlist 245-266 |
| S9 | apps/server/src/routes/student.ts | CODE | 1-2410 | HIGH | CODE | Ranh giới: mount route học viên 90, 2407 |
| S10 | apps/server/src/lib/vocab-provision.ts | CODE | 1-756 | HIGH | CODE | Predicate tiếp cận 72-108; nạp 3 nguồn 110-247 |
| S11 | apps/server/src/lib/media-store.ts | CODE | 1-74 | HIGH | CODE | Lưu object + lỗi lệch độ lớn 36-40 |
| S12 | apps/web/src/routes/_auth/vocab/index.tsx | CODE | 1-41 | HIGH | CODE | Trang hub: kicker + 2 tab |
| S13 | apps/web/src/components/vocab/vocab-hub-decks.tsx | CODE | 1-10 | HIGH | CODE | Bọc tab "Bộ từ vựng" chế độ hub |
| S14 | apps/web/src/components/vocab/vocab-deck-list.tsx | CODE | 1-309 | HIGH | CODE | Danh sách dùng chung hub/lớp + 2 hộp |
| S15 | apps/web/src/components/vocab/vocab-deck-editor.tsx | CODE | 1-201 | HIGH | CODE | Hộp soạn từ vựng |
| S16 | apps/web/src/components/vocab/vocab-word-row.tsx | CODE | 1-123 | HIGH | CODE | Dòng từ + dropzone audio |
| S17 | apps/web/src/components/vocab/vocab-library-dialog.tsx | CODE | 1-544 | HIGH | CODE | Hộp thư viện 2 bước + 4 loại kết quả |
| S18 | apps/web/src/components/vocab/vocab-suggest-dialog.tsx | CODE | 1-308 | HIGH | CODE | Hộp gợi ý / thu hồi |
| S19 | apps/web/src/components/vocab/vocab-progress-tab.tsx | CODE | 1-394 | HIGH | CODE | Tab tiến độ |
| S20 | apps/web/src/lib/repos/kernel.ts | CODE | 1-834 | HIGH | CODE | Ánh xạ hành động → API 310-352; slice 564,573 |
| S21 | apps/web/src/lib/data-actions.ts | CODE | 1-344 | HIGH | CODE | 8 kiểu hành động vocab 293-344 |
| S22 | apps/web/src/lib/data-store-reducer.ts | CODE | 1-364 | HIGH | CODE | No-op mặc định 361-362 |
| S23 | apps/web/src/components/layout/sidebar.tsx | CODE | 1-214 | HIGH | CODE | Nhóm IELTS 88-105; active-key 201 |
| S24 | apps/web/src/components/layout/sidebar.test.tsx | TEST | 1-227 | HIGH | TEST | Expect mục Từ vựng 161, 172 |
| S25 | apps/web/src/components/command-search/search-index.ts | CODE | 1-239 | HIGH | CODE | Điều hướng giáo viên 174-190 |
| S26 | apps/web/src/routes-matcher.ts | CODE | 1-154 | HIGH | CODE | /vocab là route hợp lệ 33 |
| S27 | apps/web/src/components/layout/app-shell.tsx | CODE | 1-193 | HIGH | CODE | ROUTE_CRUMBS 31+ — không có /vocab |
| S28 | apps/web/src/routes/_auth/classes/$classId.tsx | CODE | 1-511 | HIGH | CODE | Tab Từ vựng 26, 315-322 |
| S29 | packages/db/src/migrations/0036_bored_infant_terrible.sql | MIG | 1-66 | HIGH | MIG | 4 bảng học tập; ban đầu có FK word + class NOT NULL |
| S30 | packages/db/src/migrations/0037_cheerful_gambit.sql | MIG | 1-48 | HIGH | MIG | #361: 3 bảng thư viện + source_library_deck_id + audio_url |
| S31 | packages/db/src/migrations/0038_wise_blizzard.sql | MIG | 1-45 | HIGH | MIG | #363: gợi ý + recreate deck (class_id nullable) |
| S32 | packages/db/src/migrations/0039_ambiguous_prowler.sql | MIG | 1-28 | HIGH | MIG | #366: recreate card bỏ FK word (đa hình) |
| S33 | packages/db/src/migrations/0040_deep_oracle.sql | MIG | 1-1 | HIGH | MIG | Thêm description vào bài thư viện |
| S34 | packages/db/src/seed/vocab-library.ts | SEED | 1-799 | HIGH | SEED | Gate giấy phép 7-11; quy mô 20/968/10160 |
| S35 | docs/production-release-runbook.md | DOC | 1-1016 | HIGH | DOC | Mục vocab 899-924 |
| S36 | docs/tech-debt.md | DOC | 1-222 | HIGH | DOC | Bảng route 121 (phân định admin IELTS #413) |
| S37 | apps/server/src/routes/vocab-teacher.test.ts | TEST | 1-809 | HIGH | TEST | 5 khối it 146,336,401,453,708 |
| S38 | apps/server/src/routes/vocab-library.test.ts | TEST | 1-589 | HIGH | TEST | 6 khối it 211,239,336,378,438,543 |
| S39 | packages/db/src/schema/vocab.test.ts | TEST | 1-491 | HIGH | TEST | 3 khối it 14,200,219 |
| S40 | packages/db/src/seed/vocab-library.test.ts | TEST | 1-563 | HIGH | TEST | 7 khối it 34-553 |
| S41 | apps/web/src/components/vocab/vocab-hub.test.tsx | TEST | 1-318 | HIGH | TEST | 2 khối it 21,115 |
| S42 | apps/web/src/components/vocab/vocab-library-dialog.test.tsx | TEST | 1-343 | HIGH | TEST | 3 khối it 25,226,320 |
| S43 | apps/e2e/specs/vocab-hub-suggestion.spec.ts | E2E | 1-523 | HIGH | E2E | Gợi ý end-to-end |
| S44 | apps/e2e/specs/vocab-library-clone.spec.ts | E2E | 1-604 | HIGH | E2E | Nhân bản end-to-end |
| S45 | apps/e2e/specs/vocab-srs.spec.ts | E2E | 1-665 | HIGH | E2E | Ranh giới: phía học viên Learn/Review |
| S46 | docs/_reverse/reverse-plan.json | META | 1-520 | HIGH | META | Entry slug vocab-hub, 6 nguồn khai báo |
| S47 | plans/261017-1950-student-vocab-srs-game/plan.md | PLAN | 1-150 | MEDIUM | PLAN | #359: SRS game + CRUD giáo viên |
| S48 | plans/261017-2326-builtin-vocab-courses/plan.md | PLAN | 1-111 | MEDIUM | PLAN | #361: thư viện dựng sẵn |
| S49 | plans/261019-0323-vocab-independent-hub/plan.md | PLAN | 1-115 | MEDIUM | PLAN | #363: hub độc lập + gợi ý |
| S50 | plans/261019-0648-student-full-vocab-courses/plan.md | PLAN | 1-100 | MEDIUM | PLAN | #366: học viên học trọn khóa thư viện |
| S51 | apps/server/src/routes/vocab.ts | CODE | 1-1245 | HIGH | CODE | Ranh giới: route vocab học viên (mã lỗi 861) |
| S52 | packages/db/scripts/README-seed-vocab-library.md | DOC | 1-63 | HIGH | DOC | Hướng dẫn seed + gate giấy phép PROD |

Đối chiếu với khai báo trong reverse-plan.json: entry vocab-hub chỉ khai báo 6
nguồn (S1, S2, S5, S12-S19 nhóm, seed) — điều tra thực tế mở rộng thành 52
nguồn; phần mở rộng đều là bằng chứng CODE/TEST/E2E đọc trực tiếp. ✅
docs/_reverse/reverse-plan.json (entry slug vocab-hub); _evidence.md §Nguồn
