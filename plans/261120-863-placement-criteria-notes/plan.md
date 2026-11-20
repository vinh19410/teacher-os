# Plan #863 — Đồng bộ chú giải lỗi IELTS, màu slider & nhận xét từng tiêu chí (Placement Test)

- **Issue:** https://github.com/vinh19410/teacher-os/issues/863
- **Branch:** `vinh19410/feat-sync-criteria-notes` → PR vào `develop` (`--merge --beta`)
- **Status:** In Progress

## Mục tiêu & Done means
1. `packages/api` + `packages/db` (Drizzle migration): 4 loại lỗi riêng cho Writing (`task`, `coherence`, `lexical`, `grammar`) và 4 cho Speaking (`fluency`, `lexical`, `grammar`, `pronunciation`) với tên tiếng Anh khớp `criterionLabel`; chuẩn hoá tương thích ngược lỗi cũ (`vocabulary`/`spelling` → `lexical`, `coherence`/`task` trong Speaking → `fluency`, `fluency` trong Writing → `coherence`, `pronunciation` trong Writing → `lexical`); lưu/validate/trả về `writingCriterionComments` & `speakingCriterionComments` (tuỳ chọn, ≤ 1000 ký tự/tiêu chí) trên API giáo viên, student và public.
2. `apps/server/src/lib/placement-ai/`: prompt & JSON schema tách 4 key riêng cho Writing và Speaking; `parseStoredErrors` / `parseDraft` chuẩn hoá lỗi cũ.
3. `apps/web` (`PlacementSubmissionPanel`, `PlacementErrorHighlighter`): 4 chú giải + dropdown tiếng Anh theo kỹ năng; đồng bộ màu 4 slider (`--class-3/4/1/5` Writing, `--class-4/1/5/2` Speaking) + chấm màu + viền trái trên light/dark; textarea 2 dòng tuỳ chọn dưới mỗi slider; slider tổng giữ `--primary`; giữ nguyên `teacherFeedback` tổng và Zalo text.
4. 3 đầu ra học viên (`apps/student`, `apps/profile`, phiếu PDF `apps/web`): dùng đúng 4 nhãn tiếng Anh + màu đồng bộ theo kỹ năng, hiển thị comment từng tiêu chí khi có nội dung (ẩn khi trống), render an toàn bài legacy.
5. Verification gates: `pnpm exec biome check .`, `pnpm check-types`, unit tests, placement E2E specs, verify UI 3 viewport (`1440×900`, `768×1024`, `375×812`) light & dark + ảnh POT.
6. Isolated review sạch → PR vào `develop` → CI xanh → squash-merge → đăng POT comment lên #863 → label `shipped`.

## Các giai đoạn (Waves)
- [x] **Wave 1 (`foundation-dev`):** `packages/api`, `packages/db` + Drizzle migration, `apps/server` (AI grader, submission service, student & public routes + tests). (`6e09865e`, verified)
- [x] **Wave 2 (Parallel — 3 subagents):**
  - `web-dev`: `apps/web` (PlacementErrorHighlighter, placement-error-utils, PlacementSubmissionPanel, placement-result-pdf + tests). (integrated)
  - `student-dev`: `apps/student` (placement-test-helpers, placement-error-highlights, placement-result-views, placement-test-runner + tests). (`655e7770`, verified)
  - `profile-dev`: `apps/profile` (highlight.js, result.js, result.css + tests + parity check). (`92286f37`, verified)
- [x] **Wave 3 (Orchestrator):** Tích hợp, cập nhật E2E placement specs, chạy unit tests + placement E2E + verify 3 viewport light/dark + chụp POT screenshots + `biome check` + `check-types`. (PASS — 4/4 E2E tests, 14/14 check-types, 0 biome errors)
- [ ] **Wave 4 (Isolated Review):** Fresh `code-reviewer` subagent review diff theo `REVIEW.md` & `DESIGN.md`, sửa finding & re-review đến sạch.
- [ ] **Wave 5 (Ship `--merge --beta`):** Commit/push, mở PR vào `develop`, đợi CI xanh, squash-merge, đăng POT lên #863, cập nhật label `shipped`, dọn rác.
