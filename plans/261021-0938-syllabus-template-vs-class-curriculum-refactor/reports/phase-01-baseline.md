# Phase 1 baseline (khoá trước khi sửa code)

- Ngày: 2026-10-21 · worktree `ai-handle-issue-394-2` · nhánh `ai-handle-issue-394` @ `2d3f843`

## 1. `pnpm --filter server test`

- Test Files: **51 passed (51)**
- Tests: **715 passed (715)**, 0 failed
- Duration: 18.42s

## 2. `pnpm --filter web test`

- Test Files: **147 passed (147)**
- Tests: **1543 passed (1543)**, 0 failed
- Duration: 23.96s

## 3. `wc -l apps/server/src/routes/kernel.ts`

- **2116** dòng

## 4. `rg -c "classId\s*(===|!==)\s*null" apps/web/src --glob '!**/*.test.*' --glob '!**/vocab/**'`

- `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx`: **4**
- `apps/web/src/lib/repos/use-syllabus.ts`: **1**

(rg in cả các file 0 match do cấu hình rg cục bộ; chỉ 2 file trên có match > 0.)

## 5. `rg -n "set\(\{ syllabusId" apps/server/src --glob '!*.test.*'` (các nơi ghi con trỏ hiện tại)

- `apps/server/src/routes/kernel.ts:810` — import-syllabus: đặt con trỏ về copy mới
- `apps/server/src/routes/kernel.ts:865` — remove-curriculum: nhánh legacy anomaly, null pointer
- `apps/server/src/routes/kernel.ts:877` — remove-curriculum: FK order, null pointer trước khi xoá cây
- `apps/server/src/routes/kernel.ts:2057` — /syllabi/:id/remove: detach pointer cùng org

## 6. Khối `describe` syllabus/curriculum trong `apps/server/src/kernel.test.ts` (bộ khoá hành vi, không sửa ở phase 2)

- `576` describe("syllabus create with imported content (excel/csv import)")
- `734` describe("syllabus lesson status optional + replace-content (import ghi đè)")
- `932` describe("syllabus lesson kind — buổi thi giữa kỳ/cuối kỳ (issue #154)")
- `1717` describe("syllabus tree and nested binding")
- `1857` describe("cross-org syllabus writes (Wave 2 isolation lock)")
- `1985` describe("syllabus module/lesson delete and reorder")
- `2743` describe("import syllabus + remove curriculum (issue #79)")
- `3065` describe("delete syllabus template (xóa template giáo trình)")

## Ghi chú Task 1.3 (cổng quyết định user)

Agent không chạy `wrangler` trên staging/prod theo hợp đồng `ai-handle`. Quyết định áp dụng
(theo comment tracking trên issue #394 của lần chạy trước, đã qua cổng kongming):
- Migration `0042` tạo với **chỉ** câu UPDATE Q2 (idempotent, no-op khi Q2 = 0, không xoá dòng).
- **Không** NULL hoá Q1b (mặc định "không" — user chưa đo prod).
- User vẫn nhận runbook (`reports/phase-01-anomaly-queries.sql` + `reports/phase-03-deploy-notes.md`)
  để tự đo và áp migration khi release.
