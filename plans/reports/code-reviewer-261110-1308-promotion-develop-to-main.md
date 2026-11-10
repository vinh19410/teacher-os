# Pre-landing review — promote develop → main (0.0.20)

Phạm vi: `origin/main` f92c3682 → `origin/develop` 3477aa5e, 91 commit, 120 file sau khi lọc `plans/**`, snapshot migration và ảnh.

**Kết quả:** 0 critical, 6 informational.

## Gate reviewer đã chạy trên 3477aa5e

- `pnpm exec biome check .`: 0 error (105 warning, 16 info).
- `pnpm check-types`: 12/12.
- Test server liên quan (materials, manual-sessions, holidays, syllabus-material-links, student): 152/152.
- `node --test scripts/ci-workflow.test.mjs`: 9/9. Test audit db: 22/22.
- Mô phỏng migration 0000→0068 trên SQLite in-memory với `PRAGMA foreign_keys=ON`: `foreign_key_check` 0 vi phạm, `integrity_check` ok.

## Migrations

| Migration | Nội dung | Đánh giá |
|---|---|---|
| 0065_student_entry_score | `ADD COLUMN entry_score text` nullable | An toàn |
| 0066_class_materials | Tạo `material_folder`, `material`, `lesson_material` | An toàn |
| 0067_funny_virginia_dare | Tạo `class_session`; `class.scheduling_mode DEFAULT 'auto' NOT NULL` | An toàn, lớp cũ nhận `auto` |
| 0068_salty_impossible_man | Tạo `syllabus_lesson_material` | An toàn |

Không có DROP hay dựng lại bảng; Worker cũ vẫn chạy được trên schema mới.

## Critical — đã kiểm, không có lỗi

- Org-scoping: mọi query ở `apps/server/src/routes/materials.ts` lọc theo `ctx.orgId`; đọc cần `canReviewGrade`, ghi cần `canPublishGrade`. Route học viên kiểm enrollment active và lesson đúng ngày.
- CSRF: `materialRoutes` mount sau middleware Origin của kernel.
- Phục vụ file: MIME allowlist (không HTML/SVG), `nosniff`, `CSP sandbox`, `no-store`; link chỉ http/https.
- Deploy: bucket R2 `materials` private, không `forceDestroy`; thiếu binding thì 503 `MATERIALS_DISABLED`. `deploy.yml` không đổi.
- `audit-663.yml`: chỉ `workflow_dispatch`, `contents: read`, không `--apply`; environment `production` chỉ cho branch `main`.
- Không có secret bị commit.

## Informational (follow-up, không chặn release)

1. `apps/server/src/routes/kernel.ts:1681-1686`: comment nói lớp không template mặc định manual, nhưng `classCreateSchema` default `auto` nên nhánh `?? "manual"` là code chết. Hành vi thực tế (auto) an toàn cho client cũ.
2. `kernel.ts:2415` / `:2632`: thêm/xóa buổi manual không kiểm role, giống các route ghi lớp hiện có. Câu hỏi product.
3. `packages/api/src/material-contracts.ts:20`: trần upload 100 MiB sát giới hạn body của Cloudflare; file gần trần có thể nhận 413 HTML từ edge.
4. `apps/server/src/routes/holidays.ts:863-898`: hoàn tác shift kéo cả tài liệu gắn riêng cho buổi bù về ngày gốc (comment ghi là chủ ý).
5. Audit #663 trên prod gần như chắc chắn ra 0 vì `lesson_material` chỉ xuất hiện trên prod trong bản này cùng với fix. Tooling dùng một lần, nên gỡ sau khi đóng #663.
6. `packages/db/src/audit/orphan-materials.ts:377-394`: cleanup DELETE rồi UPDATE là hai lệnh REST riêng, không nguyên tử. Rủi ro thấp (chạy local, có dump backup).
