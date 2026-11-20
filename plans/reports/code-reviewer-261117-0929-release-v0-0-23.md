# Code review — release/promote-v0.0.23 (pre-landing, 2 pass)

Ngày 2026-11-17. HEAD `5a8d104f` = origin/develop `6fb9f416` + merge origin/main `844715da`. merge-base `84ca72be`.
Phạm vi: `git diff origin/main...HEAD` (108 file, +21574/-813), chủ yếu #748 (kiểm tra đầu vào trong cổng học viên), #757 (ảnh proof profile), placement test UI profile.

## Tóm tắt kết luận
- Không có blocker bảo mật. Prod vẫn ở chế độ bảo trì profile — đã kiểm tra cụ thể.
- Merge với main đúng: không mất nội dung nào của main.
- Migration 0073 **không phải additive-only**: rebuild bảng `placement_test_submission`, nhưng giữ nguyên dữ liệu và an toàn trên D1.
- 1 concern chức năng ở prod: email kết quả placement trỏ về trang profile, mà trang này đang bảo trì.

## Gate đã chạy (local, Node v24.22.1)
| Gate | Kết quả |
| --- | --- |
| `pnpm check-types` | 12/12 task pass |
| `pnpm exec biome check .` | 0 error (154 warning, 17 info) |
| `apps/profile` `node --test tests/*.test.mjs` | 57/57 pass |
| `node --test scripts/topology-drift.test.mjs` | 11/11 pass |
| `vitest run src/routes/student-placement-test.test.ts` (server) | 4/4 pass |
| Build thử profile không set `PROFILE_MAINTENANCE` | dist chỉ có 4 HTML bảo trì + `_headers` |
| Full E2E | không chạy (theo AGENTS.md) |

## Ràng buộc: prod giữ chế độ bảo trì profile — ĐẠT
- `apps/profile/maintenance.json`: `{"disabled": true}`.
- `.github/workflows/deploy.yml`: không có `PROFILE_MAINTENANCE:` dạng env. Chỉ có comment ở dòng 145. Không có `vars.PROFILE_MAINTENANCE` hay `toJSON(vars)`. `topology-drift.test.mjs` khoá thêm hai điều: prod không được có `PROFILE_MAINTENANCE: false|0`, và smoke phải gọi `isProfileMaintenanceEnabled()`.
- `maintenance.mjs` `isProfileMaintenanceEnabled()`: rỗng/không set → đọc `maintenance.json`. `false|0` → tắt bảo trì. `true|1` → bật. Giá trị khác → throw (fail-closed, deploy đỏ chứ không lặng lẽ mở site).
- `packages/infra/alchemy.run.ts:403-462` chép lại cùng logic để chọn `notFoundHandling: single-page-application` khi bảo trì. Chỉ forward `PROFILE_MAINTENANCE` cho build khi biến có set. `turbo.json` khai báo env này nên cache không bị lẫn giữa các mode.
- `build.mjs` khi bảo trì: `return` trước `cp(public → dist)`. Chạy thử thì dist chỉ gồm `index.html`, `kiem-tra-dau-vao/index.html`, `kiem-tra-dau-vao/ket-qua/index.html`, `noi-bo/index.html`, `_headers` (`no-store`, `noindex, nofollow`). Không ship `test.js`/`test.css`/`grading.js`/`lead-gate.js`, mp4 hay ảnh proof mới. SPA fallback trả trang bảo trì cho mọi path khác.
- Smoke prod (`deploy.yml:150-190`) kiểm tra 4 entrypoint hiển thị đúng thông báo bảo trì, không có `lead-api`, không có "Kịch bản tư vấn".
- Staging: `deploy-staging.yml:63` `PROFILE_MAINTENANCE: "false"` — đúng chủ đích.

## Merge conflict & bảo toàn nội dung main — ĐẠT
`git diff origin/develop HEAD` chỉ có 4 file, đều là nội dung riêng của main được giữ lại: `security-headers.ts` (comment), `production-release-runbook.md` (điều kiện cutover domain + rollback, sửa `APP_DOMAIN=msmy.io.vn`), journal v0.0.22, report v0.0.22.

Phân loại 28 file main sửa kể từ merge-base:
- 4 file conflict lấy bên develop: `deploy.yml`, `deploy-staging.yml`, `apps/profile/tests/index.test.mjs`, `docs/codebase-summary.md`. Thêm `placement-test.test.mjs` và `topology-drift.test.mjs` cũng lấy bên develop.
- So `git diff origin/main HEAD` trên các file đó:
  - `index.test.mjs`, `codebase-summary.md`, `topology-drift.test.mjs`: 0 dòng bị xoá, develop là superset.
  - `deploy*.yml`: 4–5 dòng bị thay. Chỉ là đổi check `maintenance.json` inline sang `isProfileMaintenanceEnabled()`, cộng comment.
  - `placement-test.test.mjs`: 4 assert `deepEqual` được mở rộng thêm field `band` (contract của grading.js đổi), không phải mất test.
- Các commit main `b178c9d5` (maintenance) / `d3fb86cc` (mp4) / `0f293746` đã có trên develop (`6bf77e21`, cherry-pick `9ed7ec20`). Các file còn lại có blob giống hệt main.

## Pass 1 — Critical

### Migration 0073 (`packages/db/src/migrations/0073_shocking_absorbing_man.sql`) — không additive-only, nhưng an toàn
- Rebuild bảng `placement_test_submission` (`__new_` → `INSERT…SELECT` → `DROP` → `RENAME`) để `lead_id` thành nullable và thêm `student_id` (FK `student` ON DELETE SET NULL). Thêm index `org_student_created_idx`. Thêm cột `student.placement_prompt_dismissed_at` (additive).
- Vì sao an toàn:
  - `INSERT…SELECT` liệt kê đủ mọi cột cũ, `student_id` = NULL.
  - Không bảng nào FK tới `placement_test_submission`, nên `DROP TABLE` không cascade dù D1 bỏ qua `PRAGMA foreign_keys=OFF`.
  - Dữ liệu cũ thoả FK `org`/`lead` sẵn.
  - Có precedent rebuild (0011, 0038, 0039, 0041).
  - `prevId` của snapshot 0073 khớp id 0072.
- Rollback: bản code main cũ đọc được schema mới (chỉ nới ràng buộc). Riêng code cũ `innerJoin(lead)` sẽ bỏ qua bài có `lead_id` NULL — chấp nhận được.
- Rủi ro vận hành: bảng lớn thì rebuild lâu hơn, nhưng bảng này nhỏ.

### Auth / authz — không phát hiện lỗ
- `/api/student/placement-test*`:
  - `ensureStudentSession`: chặn role khác student, chặn email chưa verify.
  - `createStudentGuard`: org theo roster.
  - Origin allowlist cho POST/PUT. Content-Type + `bodyLimit` 128KB cho submit.
  - Upload speaking scope theo `orgId` + `studentId` + token hash so sánh constant-time + CAS trên `uploadTokenHash`.
  - Audio proxy scope theo org, fallback `LEAD_ORG_ID` chỉ khi đề active lấy từ org đó.
- Snapshot cho học viên bỏ `answer`/`accept` (có test). `transcript` đã bị loại từ lúc publish.
- Kernel `/students/:id/placement-submission*` (GET/media/ai-retry/PATCH):
  - `kernelCtx` + `canPublishGrade` → TA bị 403 (có test).
  - Student lọc theo `orgId`, loại `demo-student:%`.
  - Mọi UPDATE đều kèm `orgId`.
- Chống nộp trùng: `INSERT … WHERE NOT EXISTS … RETURNING` là atomic trên D1. Pre-check theo email-lead không atomic nhưng chỉ ảnh hưởng UX.

## Pass 2 — Informational

1. **(Medium, chức năng prod)** Email kết quả placement trỏ vào trang bảo trì.
   - `gradePlacementSubmissionResponse` gửi link `buildPlacementResultUrl(leadOrigins[0], token)` = `https://msmy.io.vn/kiem-tra-dau-vao/ket-qua/?t=…`.
   - Trên prod path này đang hiển thị trang bảo trì. Từ bản này, học viên làm test trong cổng học viên (không bị bảo trì chặn), nên khi giáo viên chốt điểm, email gửi đi sẽ có link "chết".
   - Học viên vẫn xem được kết quả trong `/placement-test` của portal.
   - Đề xuất (chọn 1): (a) với `subject.kind === "student"` thì trỏ link về `topology.studentOrigin/placement-test`; (b) tạm không gửi email khi profile đang bảo trì; (c) chấp nhận và ghi vào release note.
2. **(Câu hỏi sản phẩm)** #748 đi thẳng lên prod.
   - Học viên đã onboard, chưa có `entryScore`, và org có đề đã phát hành sẽ thấy modal mời làm test.
   - Cần xác nhận đây là chủ đích khi profile công khai vẫn đang tắt.
   - Nếu prod chưa phát hành đề thì status là `unavailable` và không có modal.
3. **(Low)** `GET /api/student/placement-test` ghi DB khi xử lý GET: backfill `studentId` qua CAS cho bài lead khớp email.
   - Idempotent, nhưng là side effect trên GET.
   - Lead công khai không xác thực email, nên ai đó có thể tạo lead + bài test bằng email của học viên. Bài đó khi đó sẽ "gắn" vào học viên và chặn học viên tự làm (409).
   - Tác động thấp: giáo viên vẫn thấy và chấm được.
4. **(Low, DRY)** `alchemy.run.ts` lặp lại logic `isProfileMaintenanceEnabled` (có thể dẫn tới drift nếu sau này thêm giá trị mới). Topology test chưa khoá phần này.
5. **(Low)** Chấm bài từ hồ sơ học viên ghi đè `student.entryScore` bằng CEFR band — đây là hành vi chủ đích theo test. Khi chấm lại thì giá trị nhập tay trước đó bị mất mà không có cảnh báo.
6. **Test gap:**
   - Server test có 4 case lớn, bao phủ guard và happy path.
   - Thiếu case: token upload hết hạn, `UPLOAD_CONFLICT` khi upload đồng thời, magic-byte sai, giá trị `PROFILE_MAINTENANCE` không hợp lệ ở phía `alchemy.run.ts`.
   - E2E `student-placement-test.spec.ts` (381 dòng) chưa chạy local — để `deploy.yml` gate.
7. **Dead code:** không thấy. Ảnh cũ `student-feedback.jpg` và `class-offline-selfie.png` đã bị xoá, và test #757 khẳng định không còn tham chiếu.

## Hành động đề xuất
1. Quyết định xử lý mục 1 (link email kết quả) trước hoặc ngay sau khi promote.
2. Xác nhận mục 2 (bật placement test trong portal trên prod).
3. Các mục còn lại không chặn merge.

Status: DONE_WITH_CONCERNS
