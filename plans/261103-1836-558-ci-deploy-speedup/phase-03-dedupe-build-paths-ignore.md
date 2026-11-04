# Phase 3 — Bỏ build trùng + paths-ignore an toàn + cập nhật docs & kiểm chứng trên GitHub Actions

<!-- Updated: Validation & Red-Team Session 1 - Added routeTree.gen.ts to build.outputs, preserved $TURBO_EXTENDS$ on check-types, narrowed paths-ignore to plans markdown/html only, added README.md sync, and safe probe-branch red-gate proof -->

## Goal

Loại bỏ việc chạy `vite build` hai lần giữa `pnpm check-types` và `pnpm build` (vừa giữ an toàn `src/routeTree.gen.ts` khi trúng cache `.turbo`, vừa giữ nguyên phụ thuộc `^check-types`), bỏ qua CI cho các thay đổi chỉ chạm tài liệu plan (`plans/**/*.md`, `plans/reports/**/*.html`) mà không làm hở `docs/production-release-runbook.md` hay Biome, đồng bộ tài liệu vận hành, và kiểm chứng thực tế trên GitHub Actions (gồm cả red-gate probe an toàn và thời gian chạy thực tế).

## Files to Create or Modify

- Create: `apps/web/turbo.json`
- Create: `apps/student/turbo.json`
- Create: `apps/admin/turbo.json`
- Modify: `apps/web/package.json`
- Modify: `apps/student/package.json`
- Modify: `apps/admin/package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/ci-workflow.test.mjs`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/production-release-runbook.md`
- Modify: `plans/reports/261104-558-test-baseline-and-timings.md`

## Tasks & Steps

### Task 3.1 — Khử chạy trùng `vite build` trong `check-types` của `web`, `student`, `admin`
- [x] Hoàn thành Task 3.1
- **Goal:** Đổi script `check-types` của 3 Vite app thành `tsc --noEmit` và nối `dependsOn: ["$TURBO_EXTENDS$", "build"]` kèm `outputs: ["dist/**", "src/routeTree.gen.ts"]` trong `turbo.json` cấp app để `vite build` chỉ chạy đúng **một lần** cho cả `pnpm check-types` lẫn `pnpm build` nối tiếp nhau, đồng thời vẫn khôi phục `apps/web/src/routeTree.gen.ts` khi `web#build` trúng `.turbo` cache.
- **Target files and symbols:** `apps/{web,student,admin}/package.json` (`scripts["check-types"]`), `apps/{web,student,admin}/turbo.json` (`tasks.build.outputs`, `tasks["check-types"].dependsOn`).
- **Steps:**
  1. Đổi `"check-types"` từ `"vite build && tsc --noEmit"` sang `"tsc --noEmit"` trong `apps/web/package.json`, `apps/student/package.json`, và `apps/admin/package.json`.
  2. Tạo `apps/web/turbo.json`, `apps/student/turbo.json`, và `apps/admin/turbo.json` với cấu hình:
     ```json
     {
     	"$schema": "https://turbo.build/schema.json",
     	"extends": ["//"],
     	"tasks": {
     		"build": {
     			"outputs": ["dist/**", "src/routeTree.gen.ts"]
     		},
     		"check-types": {
     			"dependsOn": ["$TURBO_EXTENDS$", "build"]
     		}
     	}
     }
     ```
  3. Kiểm chứng từ trạng thái sạch:
     - Xoá `apps/web/src/routeTree.gen.ts`, `apps/{web,student,admin}/dist`, và `.turbo`.
     - Chạy `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` → phải sinh `apps/web/src/routeTree.gen.ts`, build 1 lần và pass `tsc --noEmit`.
     - Xoá riêng `apps/web/src/routeTree.gen.ts` và `apps/web/dist` (giữ nguyên `.turbo`), rồi chạy lại `VITE_SERVER_URL=http://localhost:8000 pnpm check-types && VITE_SERVER_URL=http://localhost:8000 pnpm build` → `web#build` phải hit cache `.turbo`, khôi phục `apps/web/src/routeTree.gen.ts` từ cache, và `pnpm build` hoàn tất trong vài giây nhờ `FULL TURBO` / cache hit cho cả 3 Vite app.
- **Success criteria:** `vite build` chỉ chạy một lần duy nhất cho chuỗi `pnpm check-types && pnpm build`; xoá `apps/web/src/routeTree.gen.ts` khi `.turbo` warm vẫn khôi phục lại file và pass `tsc --noEmit`.
- **Verify:** `rm -rf apps/web/src/routeTree.gen.ts apps/web/dist apps/student/dist apps/admin/dist .turbo && VITE_SERVER_URL=http://localhost:8000 pnpm check-types && rm -rf apps/web/src/routeTree.gen.ts apps/web/dist && VITE_SERVER_URL=http://localhost:8000 pnpm check-types && test -f apps/web/src/routeTree.gen.ts && VITE_SERVER_URL=http://localhost:8000 pnpm build` thoát mã `0`.

### Task 3.2 — Thêm `paths-ignore` thu hẹp an toàn vào `ci.yml` và khoá trong `scripts/ci-workflow.test.mjs`
- [x] Hoàn thành Task 3.2
- **Goal:** Bỏ qua `ci.yml` khi PR/push chỉ thay đổi file Markdown/HTML report trong `plans/` (`plans/**/*.md`, `plans/reports/**/*.html`), đồng thời đảm bảo mọi thay đổi chạm `docs/production-release-runbook.md`, `README.md`, `AGENTS.md`, hoặc bất kỳ file `.json`/`.js`/`.ts` nào vẫn luôn kích hoạt `ci.yml`, và `deploy*.yml` không có `paths-ignore`.
- **Target files and symbols:** `.github/workflows/ci.yml` (`on.pull_request.paths-ignore`, `on.push.paths-ignore`), `scripts/ci-workflow.test.mjs`.
- **Steps:**
  1. Trong `.github/workflows/ci.yml`, đặt `paths-ignore: ["plans/**/*.md", "plans/reports/**/*.html"]` ngay dưới `branches: [main, develop]` cho cả `pull_request` và `push` (giữ nguyên dòng `branches: [main, develop]` để khớp hợp đồng hiện có).
  2. Trong `scripts/ci-workflow.test.mjs`, bổ sung assert:
     - `ci.yml` khai báo `paths-ignore` chỉ gồm các đường dẫn dưới `plans/` (`plans/**/*.md`, `plans/reports/**/*.html`), tuyệt đối không chứa `docs/**` hay glob `*.md` / `**/*.md` cấp gốc có thể nuốt `docs/production-release-runbook.md`.
     - `deploy.yml` và `deploy-staging.yml` tuyệt đối không chứa `paths-ignore` hay `paths:`.
- **Success criteria:** `ci-workflow.test.mjs` khóa cứng phạm vi `paths-ignore` an toàn trên `ci.yml` và cấm `paths-ignore` trên `deploy*.yml`.
- **Verify:** `node --test scripts/ci-workflow.test.mjs scripts/topology-drift.test.mjs` thoát mã `0` và in `fail 0`.

### Task 3.3 — Đồng bộ tài liệu vận hành (`AGENTS.md`, `README.md`, `docs/production-release-runbook.md`)
- [x] Hoàn thành Task 3.3
- **Goal:** Cập nhật đúng các dòng mô tả cấu trúc CI/deploy để phản ánh `quality.yml` (4 job song song) và `paths-ignore` cho `plans/**/*.md` / `plans/reports/**/*.html`, không làm hỏng bất kỳ invariant nào trong `scripts/topology-drift.test.mjs`.
- **Target files and symbols:** `AGENTS.md` (mục `## Lưu ý vận hành`), `README.md` (mục `### CI pipelines`), `docs/production-release-runbook.md` (chỗ nhắc đến workflow quality).
- **Steps:**
  1. Cập nhật `AGENTS.md` mục `## Lưu ý vận hành`: ghi rõ `ci.yml`, `deploy.yml`, `deploy-staging.yml` dùng chung reusable `.github/workflows/quality.yml` (4 job song song: `checks`, `test-web`, `test-server`, `test-workspace`), và `ci.yml` bỏ qua các commit chỉ sửa `plans/**/*.md` hoặc `plans/reports/**/*.html`.
  2. Cập nhật `README.md` mục `### CI pipelines`: đồng bộ mô tả `ci.yml` (`main` và `develop`, gọi `quality.yml`, bỏ qua plan markdown/html reports) và `deploy*.yml` (luôn chạy cold `quality.yml` trước khi deploy).
  3. Rà `docs/production-release-runbook.md`: nếu có câu mô tả chi tiết job `quality` nội tuyến thì cập nhật ngắn gọn sang reusable `quality.yml`, giữ nguyên tuyệt đối các dòng Google redirect URI và quy tắc `.env` mà `topology-drift.test.mjs` kiểm tra.
  4. Chạy `pnpm check` (`biome check .`) và 4 script test gốc.
- **Success criteria:** Tài liệu khớp 100% với code, Biome xanh, toàn bộ root contract tests xanh.
- **Verify:** `pnpm check && pnpm test:ci-workflow && pnpm test:topology-drift && pnpm test:devserver-watchdog && pnpm test:design-compare` thoát mã `0`.

### Task 3.4 — Chứng minh red-gate an toàn qua nhánh `probe/558-gate` và đo thời gian thực tế trên GitHub Actions
- [x] Hoàn thành Task 3.4
- **Goal:** Chứng minh thực nghiệm trên GitHub Actions rằng: (1) khi một job con trong `quality.yml` fail thì job hạ lưu `needs: [quality]` bị `skipped` (qua nhánh tạm `probe/558-gate`, không đụng môi trường staging/prod thật), và (2) trên nhánh `ci/558-ci-deploy-speedup`, cả 4 job của `quality.yml` xanh với thời gian wall-clock trung bình 2 run ≤ ~4 phút và tổng số test khớp baseline.
- **Target files and symbols:** Nhánh tạm từ xa `probe/558-gate` (xóa ngay sau khi lấy bằng chứng), `plans/reports/261104-558-test-baseline-and-timings.md`.
- **Steps:**
  1. Từ commit đã hoàn thành trên `ci/558-ci-deploy-speedup`, tạo nhánh tạm cục bộ `probe/558-gate` (`git checkout -b probe/558-gate`), thêm `.github/workflows/probe-gate.yml` (`on: push: branches: ["probe/**"]`, `permissions: contents: read`, job `quality: uses: ./.github/workflows/quality.yml` với `turbo-cache: false`, job `would-deploy: needs: [quality], runs-on: ubuntu-latest, steps: [{ run: echo WOULD-DEPLOY }]` — không `environment`, không `secrets`), đồng thời sửa tạm 1 assert cố ý fail trong 1 test của `test-workspace` (ví dụ `test:ledger` hoặc 1 unit test nhỏ), commit và `git push origin probe/558-gate`.
  2. Chờ run `probe-gate.yml` kết thúc qua `gh run list --branch probe/558-gate`, kiểm tra qua `gh api repos/vinh19410/teacher-os/actions/runs/<run_id>/jobs` rằng job con lỗi có `conclusion == "failure"` và job `would-deploy` có `conclusion == "skipped"`.
  3. Quay lại nhánh `ci/558-ci-deploy-speedup` (`git checkout ci/558-ci-deploy-speedup`), xóa nhánh tạm cả remote lẫn local (`git push origin --delete probe/558-gate && git branch -D probe/558-gate`).
  4. Ghi nhận kết quả red-gate probe + thời gian chạy từng job của `quality.yml` trên PR `ci/558-ci-deploy-speedup` (bao gồm cold run và warm `.turbo` run, cùng đối chiếu tổng số file test / test chạy trên CI khớp baseline 394 file) vào `plans/reports/261104-558-test-baseline-and-timings.md`.
- **Success criteria:** Báo cáo ghi nhận run ID thật chứng minh `would-deploy` bị `skipped` khi `quality` đỏ, nhánh `probe/558-gate` đã bị xóa sạch, và thời gian `quality.yml` trên GitHub Actions đạt ≤ ~4 phút.
- **Verify:** `git ls-remote --heads origin probe/558-gate | wc -l` in `0` và `grep -q "skipped" plans/reports/261104-558-test-baseline-and-timings.md` thoát mã `0`.

## Risiko & Rollback

- Nếu trên GitHub runner thật một trong 3 job test vượt nhẹ ngưỡng 4 phút ở lần chạy cold đầu tiên, ghi rõ số đo vào báo cáo và đánh giá cùng `kongming` trước khi quyết định có tách thêm `test-ledger` thành job thứ 5 hay không.
- Rollback: khôi phục script `check-types` của 3 app, xoá `apps/{web,student,admin}/turbo.json` và bỏ `paths-ignore` trong `ci.yml`.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
