---
title: "Tạm ẩn cụm Phụ huynh Báo cáo sau feature flag (issue #210)"
date: 2026-09-21
summary: "ak-vibe --ship beta cho issue #210: gate toàn bộ điểm vào UI cụm Phụ huynh — Báo cáo bằng hằng số PARENT_REPORTS_ENABLED = false trong module mới apps/web/src/lib/features.ts; /reports thêm beforeLoad redirect về /dashboard; giữ nguyên backend/DB/component trang để bật lại bằng 1 flip. 642/642 test pass, check-types xanh, biome sạch; smoke trên stack dev thật xác nhận redirect + ẩn sidebar/settings/trang học viên."
---

# Tạm ẩn cụm Phụ huynh Báo cáo sau feature flag (issue #210)

Branch `vinh19410/issue-210-hide-parent-reports` (worktree issue-210-hide-parent-reports), plan `plans/260921-0347-hide-parent-reports-cluster` (pre-validated, tái sử dụng — `ak plan validate` exit 0, red-team re-verify từng tham chiếu file:line gegen source hiện tại). Route: feature qua cook --tdd --auto. Ship mode: **beta** → `develop`.

## Cơ chế

- `apps/web/src/lib/features.ts` (mới): `export const PARENT_REPORTS_ENABLED = false;` — flag tĩnh, repo chưa có feature flag nào; không cần env-flag vì không có toggle runtime.
- Điểm vào được gate: section "Phụ huynh" sidebar (conditional spread giữ đúng vị trí giữa "Lớp học" và "Hệ thống"), title `/_auth/reports` trong app-shell, nút "Tạo báo cáo" + `CreateReportModal` ở trang học viên, copy "· Báo cáo phụ huynh" + Card "Mẫu báo cáo tuần" trong Cài đặt.
- `routes/_auth/reports.tsx`: `beforeLoad` throw `redirect({ to: "/dashboard" })` khi flag tắt — component `ReportsRoute` và test component giữ nguyên.
- Giữ nguyên (HOLD SCOPE): backend `/api/reports`, snapshot, contracts, DB, `routes-matcher.ts` (SW phải cho `/reports` qua để client redirect chạy), `routeTree.gen.ts`, `create-report-modal.tsx`, repos/kernel/data-actions, comment bank của cụm Bài tập, card "Phụ huynh" + nút "Nhắn Zalo" (dữ liệu hồ sơ, không phải tính năng báo cáo).

## Test

- `settings.test.tsx`: kỳ vọng textarea `toBe(3)` → `toBe(2)` + assert không còn "Mẫu báo cáo tuần"; giữ nguyên các assert cũ (`{{student_name}}`, "Lưu mẫu tin", not-disabled).
- `reports.test.tsx`: thêm `redirect` vào mock `@tanstack/react-router` (throw Error gắn `.redirect`); test guard mới `Route.beforeLoad()` throw "redirect" — `Route` được cast vì mock `createFileRoute` trả options object nhưng kiểu thật của TanStack che thuộc tính này (lỗi TS2339 nếu không cast).
- Contract `kernel-runtime.contract.test.ts` (đọc source text yêu cầu `<CreateReportModal` còn trong reports.tsx + $studentId.tsx) vẫn pass vì gate dùng JSX conditional, không xóa import/component.

## Deviation: subagent delegation không khả dụng

Task tool báo "No model selected" cho code-reviewer → review chạy inline 2-pass trên full diff: pass 1 đúng plan/scope (git diff --name-only khớp 7 file + features.ts, keep-list sạch), pass 2 từng hunk. Bắt được 1 finding thật: edit setting.test làm rơi assert `toContain("Lưu mẫu tin")` của plan snippet → khôi phục, chạy lại suite xanh. Ghi rõ đây là inline review — không phải verdict subagent độc lập (giống deviation journal release 0.0.4).

## Evidence

- `pnpm -C apps/web test` → **642/642 pass** (66 files), chạy lại sau fix cuối cùng.
- `pnpm -C apps/web check-types` → exit 0 (sau khi sửa cast beforeLoad).
- `pnpm check` (biome) → exit 0; 2 diagnostic còn lại là pre-existing (biome.json deprecation, unused import ở class-assignments-tab.tsx — file không thuộc scope).
- Smoke stack dev thật (e2e boot:api :8100 + vite :8101, signup qua UI thật, do port 8000/8001 bị workerd dev của user chiếm): `/reports` → redirect `/dashboard` ✓; sidebar không còn section "Phụ huynh"/link "Báo cáo" ✓; Cài đặt tab Mẫu tin đúng 2 textarea, không còn "Mẫu báo cáo tuần"/"Báo cáo phụ huynh" ✓; trang học viên (tạo học viên thật qua UI): không còn nút "Tạo báo cáo", vẫn còn "Nhắn Zalo" + card "PHỤ HUYNH" với data phụ huynh ✓.
- Docs: không đổi contract/API/agent-context; `docs/diagrams/user-flow.*` vẫn vẽ node "Báo cáo phụ huynh" (generated artifact, ngoài HOLD SCOPE) — ghi chú stale, tái sinh khi bật lại cluster hoặc regenerate diagram.

## Bật lại sau này

Flip `PARENT_REPORTS_ENABLED = true` + khôi phục 2 kỳ vọng test (settings `toBe(3)`/bỏ assert not-contains; bỏ test guard redirect) — chi tiết tại "Hướng dẫn bật lại" trong plan.md.

## Next steps

- PR → develop (beta), review-pr --fix --reply, merge, watch CI.
- Issue #210: cập nhật pipeline state, close khi merge.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
