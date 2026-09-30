# Docs staleness pass — release promotion develop→main (v0.0.7→v0.0.10)

Ngày: 2026-09-30 (Asia/Saigon) · Delta: `origin/main...HEAD` (main @ `e088abb` = PR #277, v0.0.7)

## Docs khảo sát (theo docs/index.md + README)

| Doc | Phán quyết |
| --- | --- |
| README.md | Không stale — root script names (`dev:web`/`dev:landing`/`dev:student`) giữ nguyên sau rename `dev:bare` (chỉ đổi internal forwarding trong package.json); mô tả portal/setup không đổi theo delta. Không chạm. |
| docs/index.md | Không stale (nav chỉ đến các file còn đúng). Không chạm. |
| docs/code-standards.md | Không stale so với theme delta. Không chạm. |
| docs/project-roadmap.md | Không stale — mốc M1–M5 không thay đổi; quy ước roadmap tự cấm ghi per-feature. Không chạm. |
| docs/codebase-summary.md | 1 chỗ stale-thực (link chết rich-text sink) + thiếu dòng `packages/ui`. Đã sửa. |
| docs/system-architecture.md | Thiếu 1 architectural rule mới của delta (single rich-text sanitize sink). Đã thêm. |
| docs/project-overview-pdr.md | Thiếu 2 durable decision mới (assignment_test, quiz_attempt). Đã thêm. |
| docs/production-release-runbook.md | Thiếu rollback notes cho migration mới + sign-off rows. Đã thêm. |

Lưu ý: codebase-summary và system-architecture đã được cập nhật một phần trong các commit feature của delta (student portal quiz, rich text, test builder) — phần còn thiếu là những chỗ code đi sau doc.

## Migration mới trong delta (enumerate)

File SQL thêm vào kể từ 0028 (bằng `git diff origin/main...HEAD -- packages/db/src/migrations`):

- `packages/db/src/migrations/0029_marvelous_vapor.sql` — CREATE TABLE `assignment_test` + `assignment_test_part` (unique `(test_id, part)`), full-test builder (#284).
- `packages/db/src/migrations/0030_previous_drax.sql` — CREATE TABLE `quiz_attempt` (unique `(assignment_id, student_id)`), luồng học viên làm bài (#283).

Cả hai additive-only. Ngoài ra trả nợ recorded debt từ ship journal v0.0.7 (`plans/journals/2026-09-28-ship-release-007-promote-develop-main.md`, Next steps: "rollback runbook migrations 0026–0028 + dòng sign-off v0.0.7"): 0026 (6 cột nullable trên `student`), 0027 (`assignment_prompt.image_url`), 0028 (`assignment_prompt.option_bank`) — cũng additive-only và cũng chưa từng có rollback note.

## Thay đổi (4 file, +46/−2)

| File | +/− | Nội dung | Evidence class |
| --- | --- | --- | --- |
| docs/codebase-summary.md | +2/−1 | Sửa link chết: render sink rich text là `packages/ui/src/components/assignments/rich-text-body.tsx`, không phải `apps/web/src/components/ui/rich-text-body.tsx` (file này không tồn tại — sink đã dời vào `@teacher-os/ui` ở #285 nhưng doc trong delta vẫn trỏ đường cũ). Thêm dòng `packages/ui` vào directory map (quiz paper/review components + rich-text/cloze renderers dùng chung web + student). | Current evidence: filesystem + import thật `@teacher-os/ui/components/assignments/rich-text-body` trong web/student consumers |
| docs/system-architecture.md | +1/−0 | Architectural rule: mọi surface rich text render qua đúng 1 DOMPurify sink `RichTextBody` (boundary bảo mật = đúng 1 chỗ `dangerouslySetInnerHTML`); `cuePoints` giữ plain text vì contract 1 dòng = 1 ý. | Current evidence: docblock component + usage scan |
| docs/project-overview-pdr.md | +2/−0 | 2 durable decision (viết tiếng Việt theo hàng gần nhất của bảng): (1) `assignment_test` tổ chức bộ đề trên nền ngân hàng prompt, số câu liên tục chỉ derive từ `computeTestRanges`; (2) `quiz_attempt` — 1 lượt/(assignment, student), snapshot đề lúc start, grading server-side pure fn, payload take không chứa answer key. | Current evidence: schema files, migration SQL, contracts.ts (`ASSIGNMENT_TEST_PRESETS`), `test-ranges.ts` (`computeTestRanges`), `grade-quiz.ts` |
| docs/production-release-runbook.md | +41/−1 | (a) Section "Rollback safety: migrations 0026–0030 (additive-only)" — liệt kê 5 migration, hệ quả rollback (worker rollback an toàn, không hoàn tác dữ liệu, forward-only; chiều nguy hiểm là worker mới + thiếu migration → `/readyz` 503 vì readiness probe tự derive object từ schema barrel); (b) sign-off row v0.0.7 hồi cứu — truthful: Deploy Production workflow success tại `e088abb` 2026-09-28 (readyz tự động pass), browser smoke Chrome/Safari **not recorded**, không có GO ghi nhận (đúng debt journal đã flag); (c) sign-off row v0.0.10 pre-deploy với các trường `pending` — theo precedent row pending tại commit `24132d9`; (d) 1 câu làm rõ: 1 row/prod release (merge vào main), không phải mỗi version bump — 0.0.8/0.0.9 bump trên develop chưa từng promote nên không có row. | Current evidence: đọc trực tiếp 5 file migration SQL; `gh run list` (Deploy Production/CI/E2E success @ e088abb); git show `24132d9` precedent row; ship journal 2026-09-28 |

## Validation đã chạy

- Link check: 0 broken relative link trên cả 4 doc đã sửa (script Python resolve toàn bộ markdown link).
- Symbol check: `ASSIGNMENT_TEST_PRESETS` (contracts.ts), `computeTestRanges` (test-ranges.ts), `RichTextBody` import `@teacher-os/ui/components/assignments/rich-text-body` — đều tồn tại.
- Độ dài: runbook 618 dòng (< 800 docs.maxLoc); 3 doc kia 48–52 dòng.
- Không chạm CHANGELOG.md, plans/ (trừ report này), code, config.

## Docs impact & scope giữ nguyên

- README, docs/index.md, code-standards, project-roadmap: kiểm tra và giữ nguyên (không stale so với theme delta).
- Không tạo doc mới — mọi thay đổi vào surface hiện có.

## Chưa giải quyết / để cho operator lúc promote

1. Sign-off row v0.0.10: các trường pending (commit merge, operator, staging rehearsal migration 0029–0030 theo preflight 6, browser smoke, GO) phải điền bằng evidence lúc release — không pre-fill vì không có dữ liệu thật.
2. Debt browser smoke + GO của v0.0.7 được ghi trung thực là "not recorded" trong ledger; nếu operator muốn close, cần chạy smoke bổ sung hoặc chấp nhận ghi chú này như evidence cuối.
3. Preflight 7 của runbook liệt kê `pnpm test` / `check-types` / `biome check .` / `build` — gate này chạy ở promotion PR, không thuộc docs pass.

Status: DONE
Summary: Pass staleness cho promotion v0.0.7→v0.0.10: 4 doc sửa (+46/−2) — sửa link chết rich-text sink, thêm 2 durable decision (assignment_test, quiz_attempt), rule single sanitize sink, rollback-safety migrations 0026–0030 và 2 sign-off rows (v0.0.7 hồi cứu truthful + v0.0.10 pending theo precedent); README/index/code-standards/roadmap kiểm tra và giữ nguyên.
Concerns/Blockers: Không blocker. Sign-off row v0.0.10 còn các trường pending chờ evidence lúc release (operator task); browser smoke v0.0.7 không có ghi chép nên ledger ghi trung thực "not recorded".
