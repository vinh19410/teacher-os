# Báo cáo triển khai phase 1–3 (issue #303)

## File đã đổi
- Tạo: `packages/api/src/lib/infer-question-types.ts` (helper `inferQuestionTypes`, export `CLOZE_MARKER_SOURCE`, `CLOZE_EDITOR_TYPES`).
- Sửa: `packages/ui/src/lib/cloze.ts` (import 2 hằng từ api, re-export `CLOZE_EDITOR_TYPES`; public export của ui không đổi).
- Tạo: `apps/server/src/lib/infer-question-types.test.ts` (15 test).
- Sửa: `apps/server/src/routes/student.ts` (take payload + review detail dùng type suy luận).
- Sửa: `apps/server/src/routes/student-quiz.test.ts` (prompt note + câu TFNG markerless, kiểm take, review, verdict).
- Sửa: `apps/web/src/lib/assignment-quiz-sim.ts` (`normalizeQuestion` giữ `type`, `takeQuestions` có `type` đã suy luận).
- Sửa: `apps/web/src/lib/assignment-quiz-sim.test.ts` (3 test mới).
- Sửa: `apps/web/src/components/assignments/answer-key-grid.tsx` (cảnh báo `role="status"` + nút 1-click, sibling trước fieldset, chỉ khi type có trong `typeCatalog` của part).
- Sửa: `apps/web/src/components/assignments/answer-key-grid.test.tsx` (5 test mới).

## TDD
Mỗi phase đã thấy red trước khi implement: phase 1 fail vì thiếu module; phase 2 fail vì type ra `note` và `undefined`; phase 3 fail 4/6 test mới (2 test "không cảnh báo" đúng ngay từ đầu vì chưa có cảnh báo).

## Lệnh và kết quả
- `pnpm --filter server test infer-question-types`: 15/15 pass.
- `pnpm --filter server test student-quiz`: 12/12 pass.
- `pnpm --filter web test assignment-quiz-sim`: 17/17 pass; `answer-key-grid`: 34/34 pass; `cloze`: pass.
- `pnpm --filter server test`: 464/464 pass.
- `pnpm --filter student test`: 158/158 pass.
- `pnpm check-types`: 7/7 task thành công.
- `npx biome check .`: sạch (chỉ 1 info deprecated của biome.json). Không chạy `pnpm check` (có `--write`, sẽ ghi đè file của phase 4 trên cùng worktree); đã chạy `biome check --write` riêng trên 2 file answer-key-grid.
- `pnpm --filter web test` toàn bộ: 1170 test pass nhưng 2 file fail do môi trường, không do thay đổi này (xem dưới).

## Lưu ý
- Worktree thiếu `apps/web/.env`, nên `invitations.test.ts` và `settings.test.tsx` fail "Invalid environment variables" (thiếu `VITE_SERVER_URL`). Cùng 2 file đó pass ở checkout chính. Khi đặt `VITE_SERVER_URL=http://localhost:8001`, `settings` pass, `invitations` còn 2 test fail vì so URL base cụ thể của `.env` thật. Không liên quan thay đổi này.
- Cảnh báo ở grid đặt cho từng dải liên tiếp cùng type suy luận; nếu một dải tfng liền kề dải ynng thì có hai cảnh báo riêng.
- Variant nút dùng `secondary` (Button không có `outline`).
- Chưa làm phần "Thủ công trên dev stack". Không commit, không push, không chạy e2e.
