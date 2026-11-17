# Plan #754: Đồng bộ toàn diện Entry Test theo `raw-data/placement-test-audio.html`

- **Issue:** #754
- **Branch:** `vinh19410/entry-test` → merge vào `develop` (`--beta`)
- **Trạng thái:** Đang thực thi (Gate 3)

## Kiến trúc thực thi & Phân chia sở hữu file

### Wave 1 — Foundation: Seed, Audio, Contracts, Scoring & AI Grader
- **Sở hữu file:**
  - `apps/web/public/placement-seed/questions.json`, `clip-la.mp3..clip-lf.mp3`
  - `packages/api/src/placement-test-defaults.ts`, `packages/api/src/placement-test-contracts.ts`, `packages/api/src/placement-test-contracts.test.ts`
  - `apps/profile/public/kiem-tra-dau-vao/grading.js`, `apps/profile/public/kiem-tra-dau-vao/ket-qua/highlight.js`
  - `apps/server/src/lib/placement-ai/openai-grader.ts`, `apps/server/src/lib/placement-ai/openai-grader.test.ts`
- **Chi tiết:**
  1. Tái tạo 6 file `.mp3` từ `AUDIO_URLS` trong `raw-data/placement-test-audio.html` (chèn khoảng nghỉ 600ms giữa các line theo `playAudio()`).
  2. Đồng bộ `questions.json` và `placement-test-defaults.ts` khớp 100% nội dung, `partLabel`, `instruction` (không lặp thừa trên `LB/LC/LD` và `RB/RC/RD`, giữ tương thích validator), `notesTitle`, `WRITING_PROMPT`, `SPEAKING_TASKS` (`5s/20s`, `15s/45s`, `20s/60s`), `BANDS`.
  3. Mở rộng `PLACEMENT_WRITING_RUBRIC` & `PLACEMENT_SPEAKING_RUBRIC` kèm `hint` và `levels: { 5, 3, 1 }` theo đúng HTML; cập nhật prompt AI grader tại `openai-grader.ts`.
  4. Cập nhật `gradePlacementObjective`, `computePlacementFinal`, `matchPlacementBand` và mirror trong `grading.js`: tính `%` từng kỹ năng và trung bình cộng trên số thực trước khi khớp band `>= min` (chỉ làm tròn khi hiển thị / lưu `finalScorePct`).

### Wave 2 — UI & Consumer Surfaces (Song song trên 3 worktree chia sẻ)
- **Piece B (Teacher Web):** `apps/web/src/routes/_auth/placement-test/index.tsx`, `apps/web/src/components/placement-test/seed-empty-state.tsx`, `apps/web/src/components/leads/placement-submission-panel.tsx` và các unit test tương ứng.
  - Bổ sung bảng mô tả rubric `5 / 3 / 1` trên UI chấm bài; cập nhật wording & bổ sung nút **"Nhập lại đề gốc & Phát hành"** tiện 1 thao tác cho giáo viên.
- **Piece C (Profile `/kiem-tra-dau-vao/`):** `apps/profile/public/kiem-tra-dau-vao/test.js`, `test.css`, `apps/profile/tests/placement-test.test.mjs`.
  - Đồng bộ intro table 5 phần kèm thời lượng gợi ý, nhóm Part 1/2/3 không lặp instruction, hộp `Phiếu ghi chú` inline gap-fill cho `LE`, Reading `sign`/`message`/`cloze`, và màn kết quả tạm tính chỉ hiện Listening & Reading kèm CEFR từng phần + `X/Y` + `%` + thanh tiến độ.
- **Piece D (Student Portal `/placement-test`):** `apps/student/src/components/placement/*`, `apps/student/src/lib/placement-test-helpers.ts`, `apps/student/test/placement-test.test.tsx`.
  - Đồng bộ tương ứng với Piece C trên React/shadcn/Tailwind theo `DESIGN.md`.

### Wave 3 — Tích hợp, E2E & Verification
- Cập nhật & chạy các spec E2E placement (`profile-placement-test.spec.ts`, `student-placement-test.spec.ts`, `placement-test-editor.spec.ts`), chụp ảnh 3 viewport vào `plans/reports/`.
- Isolated code review qua subagent `code-reviewer`.
- Chạy `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.
- Mở PR vào `develop`, gắn POT lên issue #754, merge (`--beta`) và cập nhật nhãn `shipped`.
