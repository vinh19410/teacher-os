# Journal: Backfill Bộ đề (`collection`) & Phần thi (`p1`–`p3`) cho đề Reading thư viện (#884 follow-up)

- **Date:** 2026-11-26
- **Issue:** [#884](https://github.com/vinh19410/teacher-os/issues/884) (re-test trên staging sau PR #934 `5d599642`)
- **Branch:** `vinh19410/fix-practice-b-l-c-b-ch-l-y-ngu-n-c-a-trang-hi-n-2` (target: `develop`)
- **Plan:** `plans/261126-0344-884-reading-catalog-collection-part-backfill/plan.md`

## Context
Sau khi PR #934 triển khai facets toàn catalog cho trang luyện tập học viên, re-test trên staging (`lms.staging.teacheros.io.vn`) cho thấy Listening (`/student/practice/listening`, 497 đề) hiển thị đầy đủ Bộ đề, Phần thi, Dạng bài qua mọi trang, trong khi Reading (`/student/practice/reading`, 348 đề) vẫn mất cả dropdown **Bộ đề** và **Phần thi**.

Điều tra mã nguồn và dữ liệu gốc (`docs/reading-ielts/reading-practice/_index.json`, 351 bài đọc) chứng minh API/UI dùng chung cho cả 2 kỹ năng không có lỗi phân biệt; nguyên nhân nằm ở dữ liệu D1 của Reading:
1. Các đề Reading được import trước đó với UUID ngẫu nhiên có `collection`/`test_group` rỗng (hoặc `"Step IELTS"`/`"Unknown"` trên DB chưa chạy cleanup) làm `facets.collections` rỗng và UI ẩn dropdown **Bộ đề**.
2. Toàn bộ 348 đề Reading bị lưu ở `part = 'p1'` dù dữ liệu nguồn có đủ `Passage 1` (124), `Passage 2` (108), `Passage 3` (118) và 1 bài `null` (`Trainer-team-building.json`, `1-14` → `p1`), khiến `facets.parts` chỉ trả `["p1"]` (< 2 phần tử) làm UI ẩn **Phần thi**.
3. `localeCompare` ở server và student thiếu `{ numeric: true }`, làm `Cambridge IELTS 7` bị xếp sau `Cambridge IELTS 20`.

## Key Decisions & Technical Findings
- **Module chuẩn hóa dùng chung & khóa parity cơ học (`packages/db/src/seed/reading-library.ts`):** Chuẩn hóa 351 bài gốc thành 350 dòng tra cứu (17 bộ đề chuẩn đồng bộ quy ước Listening, khử 100% `"Step IELTS"`/`"Unknown"` → `"Other sources"`, đồng bộ homoglyph/whitespace 1-1 với SQLite `NORM_TITLE`, tách loại trừ lẫn nhau 2 bài `"Coral reefs"` qua `'london zoo'` / `'calcium carbonate'`, và sinh `passageClue` thuần ASCII cho 349/350 bài có đoạn đọc để chống chiếm đoạt đề custom tiêu đề ngắn). Test parity đọc lại toàn bộ `INSERT` trong migration `0094` xác nhận khớp 1-1 và mỗi lệnh `< 10 KB`.
- **Drizzle migration `0094_backfill_reading_library_collection_and_part.sql` tương thích D1 (staging + production):** Dùng bảng thường `_tmp_reading_meta_0094` (14 batch `INSERT`, tổng ~80 KB, tối đa 8,418 B/lệnh, không dùng `TEMP TABLE`, có `DROP TABLE IF EXISTS` ở đầu và cuối) và `_tmp_blocked_prompt_0094` (`INSERT OR IGNORE`) để cập nhật idempotent 5 bảng (`library_test`, `library_test_part`, `assignment_test`, `assignment_test_part`, `assignment_prompt`), bảo toàn `COALESCE` trên cột `NOT NULL`, `IS NOT` cho cột nullable, `SUBSTR` neo đầu/cuối cho auto-title, `EXPLAIN QUERY PLAN` đi qua PK/index, và khóa chặt INF-03 lẫn bất biến `assignment_test_part.part === assignment_prompt.part`.
- **Hai điểm vá an toàn runtime khi đề Reading chuyển sang `p2`/`p3`:**
  - `materializePrompts` (`study-pack-clone.ts`) trả thêm `promptPartBySourceKey` và `syncLibraryTestsToOrg` (`library-test-sync.ts`) ưu tiên `existingPrompt.part` đồng thời kiểm tra trước các slot đã chiếm trên bản sao để bảo toàn bất biến `tests.ts:212` và tránh vòng lặp re-sync ghi thừa trên đề multi-part trùng slot.
  - `PATCH /api/assignments/prompts/:id` (`routes/assignments/index.ts`) hợp nhất `[...new Set([...slotTypes, ...librarySkillTypes(row.skill)])]` khi `(row.libraryRef ?? "").trim().length > 0 && isLibrarySkill(row.skill)`, bảo đảm cả Study Pack `reading:p1:note` lẫn 16 đề Reading `p2`/`p3` (như `"The Falkirk Wheel"` `p2`/`tfng`) sửa metadata bình thường trong khi đề tự soạn vẫn giữ chặn `400 "invalid type"`.
- **Các phát hiện giá trị từ vòng Red-Team & Local Code Review:** Mở rộng `0094` xử lý cả `"Step IELTS"`/`"Unknown"` cho Prod D1; mở rộng Step 2 `_tmp_blocked_prompt_0094` bảo vệ INF-03 trên `ap.source` cho cả 125 bài `p1`; thêm rào `COUNT(*) <= 1` ở Statement C cho bản sao multi-part giáo viên tự mở rộng; thêm `ltp.part = m.part` ở Statement D/E; và xử lý tránh vòng lặp ghi khi xung đột slot multi-part ở `syncLibraryTestsToOrg`.

## Verification
- Kiểm thử thực nghiệm migration `0094` trên toàn bộ 351 bài đọc thật: `missedLT = 0`, `wrongLTP = 0` trong 63ms; `EXPLAIN QUERY PLAN` xác nhận tra cứu qua index/PK.
- `pnpm exec biome check .` (0 errors), `pnpm check-types` (15/15 packages), `pnpm test:ci-workflow`.
- `@teacher-os/db test` (9 files, 75/75), `@teacher-os/infra` `flat-migrations.test.ts` (3/3), `apps/server` 7 suites (109/109 gồm `reading-collection-part-backfill-migration.test.ts` 4/4, `study-pack-migration.test.ts` 5/5, `student-practice.test.ts` 32/32, `student-practice-library-sync.test.ts` 8/8, `admin-library.test.ts` 46/46, `prompt-content-lock.test.ts` 10/10, `study-pack-clone.test.ts` 4/4), `apps/student` `practice-catalog.test.tsx` (22/22).
- Targeted Playwright E2E `specs/student-practice.spec.ts` (ports `8100–8105`): 7/7 passed.
- Local Code Review Round 2 (`code-reviewer`): **Approve** (0 Critical, 0 Important, 0 Minor); Advisory Checkpoint 3 (`kongming`): **GO**.
