# Plan #780 — Tinh gọn hướng dẫn Speaking, nút Pause tròn đỏ, retry 2 lần/câu & tách nút Kết thúc sớm

- **Issue:** #780
- **Status:** done
- **Branch:** `vinh19410/Bỏ-phần-hướng-dẫn-speaking` → PR vào `develop` (`--merge --beta`)

## Phases

| Phase | Name | Status |
|---|---|---|
| 01 | `apps/student` Speaking UI, State Machine & Tests ([phase-01-student-speaking.md](./phase-01-student-speaking.md)) | done |
| 02 | `apps/profile` Speaking UI, State Machine & Tests ([phase-02-profile-speaking.md](./phase-02-profile-speaking.md)) | done |
| 03 | E2E Verification, POT, Isolated Review & `--merge --beta` ([phase-03-e2e-and-pot.md](./phase-03-e2e-and-pot.md)) | done |

## Acceptance Criteria

1. Cả `apps/student` và `apps/profile` bỏ mô tả dài ở header, bỏ danh sách hướng dẫn 3 bước (`<ol>`), bỏ dòng nhắc dài ở pha `prep`; giữ tiêu đề gọn, thông số ngắn (số câu, thời lượng, Audio-only) và 2 nút Bắt đầu / Bỏ qua.
2. Pha `prep` hiển thị bộ đếm giây chuẩn bị cỡ lớn nằm giữa màn hình.
3. Pha `answer` (bắt đầu/đang ghi âm) hiển thị nút tròn đỏ với icon Pause ở giữa màn hình kèm đếm ngược.
4. Bấm nút tròn đỏ Pause (hoặc hết giờ trả lời) dừng lượt ghi hiện tại và chuyển sang pha dừng câu (`task_review`): cho phép **Ghi lại câu này** tối đa 2 lần retry/câu (`MAX_SPEAKING_RETRIES_PER_TASK = 2`), khóa nút khi hết lượt, hoặc bấm `Câu tiếp theo →` / `Hoàn thành phần Speaking`. Cuối bài ghép segment cuối các câu thành 1 file audio duy nhất để nghe lại và nộp; bỏ nút `Ghi lại từ đầu`.
5. Nút `Kết thúc phần Speaking` tách xuống footer riêng dưới đường kẻ `border-t`, kèm hộp xác nhận ngắn trước khi kết thúc sớm.
6. `pnpm exec biome check .`, `pnpm check-types`, unit tests (`student`, `profile`), E2E specs lẻ (`student-placement-test.spec.ts`, `profile-placement-test.spec.ts`) đều pass; isolated code review sạch; POT đính kèm trên issue #780; PR merge `--beta`.
