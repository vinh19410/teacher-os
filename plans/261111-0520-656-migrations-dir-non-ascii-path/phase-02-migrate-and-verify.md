---
phase: 2
title: "Phase 2: Migrate 88 Server Test Files to fileURLToPath & Verify Non-ASCII Suite"
status: completed
priority: P1
effort: "40m"
dependencies: [1]
---

# Phase 2: Migrate 88 Server Test Files to fileURLToPath & Verify Non-ASCII Suite

<!-- Updated: Red Team Session 1 - Exact line spans, allowlist-only biome --write, mktemp -d + offline pnpm install + VITEST_SKIP_SLOW=0 for real Vietnamese workspace run, NUL-delimited git allowlist gate -->

## Goal

Chuyển toàn bộ `91` vị trí lấy đường dẫn hệ điều hành bằng `.pathname` trên `URL(..., import.meta.url)` ở `88` file `.test.ts` của `apps/server/src` sang `fileURLToPath(...)` từ `"node:url"`, đưa bài test canh cổng AST `non-ascii-path-guard.test.ts` sang TDD Green (`0` vi phạm trên toàn bộ `202` file `.ts`), xác minh toàn bộ `107` file test của `apps/server` pass ở cả worktree ASCII lẫn bản sao workspace tiếng Việt cài đặt đầy đủ `node_modules` cục bộ, cập nhật `CHANGELOG.md` và vượt qua mọi cổng chất lượng repo.

## Files to Create / Modify

- Modify (`39` file cấp `apps/server/src/*.test.ts`):
  - `apps/server/src/assignment-prompt-existing-data-migration.test.ts`
  - `apps/server/src/auth-role-roundtrip.test.ts`
  - `apps/server/src/auth-roundtrip.test.ts`
  - `apps/server/src/bank-hub-ipn.test.ts`
  - `apps/server/src/bank-hub-migration.test.ts`
  - `apps/server/src/bank-hub-reconcile.test.ts`
  - `apps/server/src/bank-hub-webhooks.test.ts`
  - `apps/server/src/bank-link.test.ts`
  - `apps/server/src/comment-bank-existing-data-migration.test.ts`
  - `apps/server/src/cookie-prefix.test.ts`
  - `apps/server/src/invoice-payment.test.ts`
  - `apps/server/src/invoice-transactions.test.ts`
  - `apps/server/src/kernel-occurrence.test.ts` (`2` vị trí trực tiếp: dòng `26-29` và `509`)
  - `apps/server/src/kernel.test.ts`
  - `apps/server/src/lead-catalog-drift.test.ts` (`2` vị trí gián tiếp: dòng `15-19` và `65-69`; **giữ nguyên** `leadGateUrl.href` ở dòng `85-89`)
  - `apps/server/src/lesson-attendance-columns-migration.test.ts`
  - `apps/server/src/lesson-date-integration.test.ts`
  - `apps/server/src/library-test-migration.test.ts`
  - `apps/server/src/manual-sessions.test.ts`
  - `apps/server/src/notification-record-migration.test.ts`
  - `apps/server/src/payment-transactions.test.ts`
  - `apps/server/src/public-pay.test.ts`
  - `apps/server/src/quiz-attempt-practice-migration.test.ts`
  - `apps/server/src/readiness.test.ts`
  - `apps/server/src/role-gates.test.ts`
  - `apps/server/src/security.test.ts`
  - `apps/server/src/session-package-parked-migration.test.ts`
  - `apps/server/src/student-email-unique-migration.test.ts`
  - `apps/server/src/student-identity-migration.test.ts`
  - `apps/server/src/student-invitation.test.ts`
  - `apps/server/src/student-multi-org-migration.test.ts`
  - `apps/server/src/student-projection-lock.test.ts` (dòng `14`)
  - `apps/server/src/student-provisioning.test.ts`
  - `apps/server/src/student.test.ts`
  - `apps/server/src/study-pack-migration.test.ts`
  - `apps/server/src/syllabus-material-links.test.ts`
  - `apps/server/src/syllabus-pointer-reconcile-migration.test.ts`
  - `apps/server/src/syllabus-template-migration.test.ts`
  - `apps/server/src/user-role-backfill-migration.test.ts`
- Modify (`34` file cấp `apps/server/src/routes/**/*.test.ts`):
  - `apps/server/src/routes/admin-library-audio.test.ts`
  - `apps/server/src/routes/admin-library.test.ts`
  - `apps/server/src/routes/assignments/prompt-content-lock.test.ts`
  - `apps/server/src/routes/assignments/tests.test.ts`
  - `apps/server/src/routes/bank-hub-mock.test.ts`
  - `apps/server/src/routes/bank-hub-webhooks.test.ts`
  - `apps/server/src/routes/billing-timeline.test.ts`
  - `apps/server/src/routes/daily-attendance.test.ts`
  - `apps/server/src/routes/dashboard-reminders.test.ts`
  - `apps/server/src/routes/debt-reminders.test.ts`
  - `apps/server/src/routes/events.test.ts`
  - `apps/server/src/routes/exam-imports.test.ts` (`2` vị trí trực tiếp: dòng `54-57` và `485-488`)
  - `apps/server/src/routes/grading.test.ts`
  - `apps/server/src/routes/holidays.test.ts`
  - `apps/server/src/routes/hybrid-assignment.test.ts`
  - `apps/server/src/routes/leads.test.ts`
  - `apps/server/src/routes/materials.test.ts`
  - `apps/server/src/routes/notification-logs.test.ts`
  - `apps/server/src/routes/placement-test.test.ts`
  - `apps/server/src/routes/public-leads.test.ts`
  - `apps/server/src/routes/public-placement-test.test.ts`
  - `apps/server/src/routes/student-auth-otp.test.ts`
  - `apps/server/src/routes/student-classmates.test.ts`
  - `apps/server/src/routes/student-history.test.ts`
  - `apps/server/src/routes/student-inbox.test.ts`
  - `apps/server/src/routes/student-practice.test.ts`
  - `apps/server/src/routes/student-quiz-explanation.test.ts`
  - `apps/server/src/routes/student-quiz-media.test.ts`
  - `apps/server/src/routes/student-quiz.test.ts`
  - `apps/server/src/routes/student-schedule.test.ts`
  - `apps/server/src/routes/study-pack.test.ts`
  - `apps/server/src/routes/vocab-library.test.ts`
  - `apps/server/src/routes/vocab-teacher.test.ts`
  - `apps/server/src/routes/vocab.test.ts`
- Modify (`15` file cấp `apps/server/src/lib/**/*.test.ts`):
  - `apps/server/src/lib/ai-grading/run-grading.test.ts`
  - `apps/server/src/lib/credits/wallet.test.ts`
  - `apps/server/src/lib/exam-import/dedupe.test.ts`
  - `apps/server/src/lib/exam-import/fingerprint.test.ts` (dòng `7-10`)
  - `apps/server/src/lib/exam-import/publish-to-bank.test.ts`
  - `apps/server/src/lib/exam-import/release-stale.test.ts`
  - `apps/server/src/lib/exam-import/run-import.test.ts`
  - `apps/server/src/lib/exam-import/validate-file.test.ts` (dòng `41-44`)
  - `apps/server/src/lib/notifications/notifications.test.ts`
  - `apps/server/src/lib/payments/ledger-invariants.test.ts`
  - `apps/server/src/lib/payments/manual-payment.test.ts`
  - `apps/server/src/lib/require-finance-role.test.ts`
  - `apps/server/src/lib/session-curriculum-materials.test.ts`
  - `apps/server/src/lib/study-pack-assign.test.ts`
  - `apps/server/src/lib/study-pack-clone.test.ts`
- Modify: `CHANGELOG.md`

## Handover Note

Plan này được viết theo hợp đồng bàn giao `--advice` + `--tdd` cho executor. Executor thực thi tuần tự từng Task, chạy đúng lệnh `Verify` cơ học sau mỗi Task, và nếu bất kỳ lệnh `Verify` nào không thỏa điều kiện đạt thì PHẢI dừng ngay theo khối `Failure Protocol` ở cuối file. Tuyệt đối không chạy `pnpm check:fix` toàn repo hay `biome check --write apps/server/src` trên toàn thư mục; chỉ truyền đúng danh sách `89` file `.test.ts` thuộc allowlist vào `biome check --write`. Mọi thư mục tạm trong `/tmp` phải tạo bằng `mktemp -d` kèm `trap ... EXIT` để tự dọn sạch kể cả khi lệnh fail. Không đăng đường dẫn máy trạm tuyệt đối hay thông tin nhạy cảm lên GitHub.

## Tasks & Steps

### Task 2.1 — Chuyển đổi 88 file `.test.ts` sang `fileURLToPath` và xác minh TDD Green trên `non-ascii-path-guard.test.ts`

- **Goal:** Thay thế toàn bộ `91` vị trí `.pathname` trên `URL(..., import.meta.url)` trong `88` file `.test.ts` được liệt kê ở trên bằng `fileURLToPath(...)` từ `"node:url"`, chuẩn hóa thứ tự import bằng Biome chỉ trên đúng `89` file `.test.ts` thuộc allowlist, và đưa `non-ascii-path-guard.test.ts` về trạng thái xanh (`3 passed`).
- **Target files and symbols:**
  - `88` file `.test.ts` liệt kê tại mục `Files to Create / Modify` ở trên (`import { fileURLToPath } from "node:url";`, hằng `MIGRATIONS_DIR`, `FIXTURE_PATH`, `STUDENT_ROUTE`, `profileHtmlPath`, `questionsPath`, và các biểu thức `readFileSync` inline).
- **Steps:**
  1. Trên `87` file dùng dạng trực tiếp (`89` vị trí `new URL(<rel>, import.meta.url).pathname`):
     - Thêm `import { fileURLToPath } from "node:url";` vào đầu khối `import` hiện có của từng file (nếu đầu file có doc-comment `/** ... */` như `apps/server/src/kernel-occurrence.test.ts:1-8` hoặc `apps/server/src/student-projection-lock.test.ts:1-10`, chèn ngay phía trên dòng `import` đầu tiên bên dưới doc-comment để giữ nguyên header comment).
     - Thay từng biểu thức `new URL(<rel>, import.meta.url).pathname` thành `fileURLToPath(new URL(<rel>, import.meta.url))`.
  2. Trên `apps/server/src/lead-catalog-drift.test.ts` (`2` vị trí gián tiếp):
     - Thêm `import { fileURLToPath } from "node:url";` ngay sau `import { readFileSync } from "node:fs";`.
     - Chuyển `profileHtmlPath` (dòng `15-19`) sang `fileURLToPath(new URL("../../profile/public/index.html", import.meta.url))` rồi truyền trực tiếp vào `readFileSync(profileHtmlPath, "utf8")`.
     - Chuyển `questionsPath` (dòng `65-69`) sang `fileURLToPath(new URL("../../web/public/placement-seed/questions.json", import.meta.url))` rồi truyền trực tiếp vào `readFileSync(questionsPath, "utf8")`.
     - **Giữ nguyên** `leadGateUrl` và `await import(leadGateUrl.href)` ở dòng `85-89`.
  3. Chạy `pnpm exec biome check --write` **chỉ truyền đúng `89` file `.test.ts` thuộc allowlist** (`88` file vừa sửa + `apps/server/src/non-ascii-path-guard.test.ts`) để Biome sắp xếp thứ tự import và format tab/xuống dòng mà không chạm bất kỳ file nào ngoài allowlist.
  4. Chạy `pnpm exec biome check apps/server/src` (read-only) và `NO_COLOR=1 FORCE_COLOR=0 pnpm --filter server exec vitest run --no-color src/non-ascii-path-guard.test.ts src/lead-catalog-drift.test.ts src/student-projection-lock.test.ts src/kernel-occurrence.test.ts src/routes/holidays.test.ts` để xác minh TDD Green ngay lập tức.
- **Success criteria:** Cả `88` file đã chuyển sang `fileURLToPath` từ `"node:url"`, `non-ascii-path-guard.test.ts` xác nhận `0` vi phạm trên toàn bộ `202` file `.ts` của `apps/server/src`, `leadGateUrl.href` và `bank-hub-client.test.ts` giữ nguyên, `biome check apps/server/src` sạch lỗi, và `vitest run` trên 5 file thoát mã `0` (`Test Files  5 passed (5)`).
- **Verify:** `pnpm exec biome check apps/server/src && grep -Fq "await import(leadGateUrl.href)" apps/server/src/lead-catalog-drift.test.ts && (LOG="$(mktemp "${TMPDIR:-/tmp}/656-tdd-green.XXXXXX.log")"; trap 'rm -f "$LOG"' EXIT; NO_COLOR=1 FORCE_COLOR=0 pnpm --filter server exec vitest run --no-color src/non-ascii-path-guard.test.ts src/lead-catalog-drift.test.ts src/student-projection-lock.test.ts src/kernel-occurrence.test.ts src/routes/holidays.test.ts > "$LOG" 2>&1 && grep -Fq "Test Files  5 passed (5)" "$LOG")` thoát mã `0`.

### Task 2.2 — Chạy toàn bộ `apps/server` test suite (`107` file) trong bản sao workspace tiếng Việt cài đặt độc lập

- **Goal:** Chứng minh thực nghiệm toàn bộ `107` file `.test.ts` của `apps/server` (kể cả `ledger-invariants.test.ts` với `VITEST_SKIP_SLOW=0`) pass `100%` khi toàn bộ mã nguồn workspace và liên kết `@teacher-os/*` nằm thật sự bên trong đường dẫn tiếng Việt tạo bằng `mktemp -d`, không rò rỉ file gitignored và tự dọn sạch qua `trap ... EXIT`.
- **Target files and symbols:**
  - Toàn bộ `107` file `.test.ts` trong `apps/server/src/**/*.test.ts` (chạy kiểm chứng, không sửa thêm file nào).
- **Steps:**
  1. Trong một subshell cô lập, cấp phát thư mục tạm mode `0700` có tên tiếng Việt bằng `VN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/Pick-tài-liệu-ở-page-tạo-buổi-học-656.XXXXXX")"` và đặt ngay `trap 'rm -rf "$VN_DIR"' EXIT` (cùng file log tạm `VN_LOG` có `trap` dọn dẹp) để đảm bảo tự xóa sạch trong mọi trường hợp pass/fail/signal.
  2. Sao chép **chỉ các file được Git quản lý / không bị gitignore** (loại trừ `plans/`, `assets/`, `dogfood-output/` để không mang theo `.env*`, `local.db*` hay tài nguyên nặng không liên quan) vào `$VN_DIR` qua `git ls-files -co --exclude-standard -z`.
  3. Chạy `pnpm install --offline --frozen-lockfile --dir "$VN_DIR"` bên trong `$VN_DIR` để pnpm tạo đầy đủ các thư mục `node_modules` cục bộ và trỏ toàn bộ symlink `@teacher-os/*` vào đúng `$VN_DIR/packages/*` (nằm dưới đường dẫn tiếng Việt thật, không thoát ngược về worktree ASCII).
  4. Chạy `VITEST_SKIP_SLOW=0 NO_COLOR=1 FORCE_COLOR=0 pnpm --dir "$VN_DIR/apps/server" exec vitest run --no-color` và đối chiếu cơ học `Test Files  107 passed (107)`.
- **Success criteria:** `pnpm install --offline --frozen-lockfile` tạo liên kết `@teacher-os/db` nằm bên trong `$VN_DIR`, toàn bộ `107` file test của `apps/server` thoát mã `0` với `Test Files  107 passed (107)`, và `$VN_DIR` được tự động xóa sạch sau khi subshell kết thúc.
- **Verify:** `(set -euo pipefail; VN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/Pick-tài-liệu-ở-page-tạo-buổi-học-656.XXXXXX")"; VN_LOG="$(mktemp "${TMPDIR:-/tmp}/656-vn-suite.XXXXXX.log")"; trap 'rm -rf "$VN_DIR" "$VN_LOG"' EXIT; git ls-files -co --exclude-standard -z | python3 -c 'import sys; items=[p for p in sys.stdin.buffer.read().split(b"\0") if p and not p.startswith((b"plans/",b"assets/",b"dogfood-output/"))]; sys.stdout.buffer.write(b"\0".join(items)+(b"\0" if items else b""))' | tar --null -T - -cf - | tar -C "$VN_DIR" -xf -; pnpm install --offline --frozen-lockfile --dir "$VN_DIR" > /dev/null; REAL_DB="$(realpath "$VN_DIR/apps/server/node_modules/@teacher-os/db")"; case "$REAL_DB" in "$VN_DIR"/*) ;; *) echo "ESCAPED_SYMLINK:$REAL_DB" >&2; exit 1 ;; esac; VITEST_SKIP_SLOW=0 NO_COLOR=1 FORCE_COLOR=0 pnpm --dir "$VN_DIR/apps/server" exec vitest run --no-color > "$VN_LOG" 2>&1; grep -Fq "Test Files  107 passed (107)" "$VN_LOG")` thoát mã `0`.

### Task 2.3 — Cập nhật `CHANGELOG.md`, kiểm tra allowlist Git NUL-delimited chặt và chạy toàn bộ cổng chất lượng repo

- **Goal:** Ghi nhận bản sửa `#656` vào `CHANGELOG.md`, xác minh bằng parser NUL-delimited (`-z -uall`, không `.trim()`) rằng mọi thay đổi chỉ nằm đúng trong `89` file `.test.ts` thuộc allowlist + `CHANGELOG.md` + `plans/`, và vượt qua toàn bộ cổng chất lượng local (`pnpm check`, `pnpm check-types`, `pnpm test`).
- **Target files and symbols:**
  - `CHANGELOG.md` (mục `## 2026-11-11` → `### Fixed`)
- **Steps:**
  1. Trong `CHANGELOG.md` dưới `## 2026-11-11` → `### Fixed`, thêm một dòng mô tả bản sửa `#656`: chuyển toàn bộ `91` vị trí lấy đường dẫn hệ điều hành bằng `new URL(..., import.meta.url).pathname` ở `88` file test của `apps/server` sang `fileURLToPath` từ `node:url` và bổ sung bài test canh cổng AST `non-ascii-path-guard.test.ts`, giúp server test suite không còn đỏ ảo khi chạy trong thư mục chứa ký tự tiếng Việt / non-ASCII `(#656)`.
  2. Chạy `pnpm exec biome check --write CHANGELOG.md` nếu cần giữ định dạng chuẩn, rồi kiểm tra allowlist Git bằng NUL-delimited `git status --porcelain=v1 -z -uall` và `git diff --name-status -z $(git merge-base HEAD origin/develop)`:
     - Cấm mọi thao tác xóa/đổi tên/copy (`D`, `R`, `C`) trên bất kỳ file nào ngoài `plans/`.
     - Đối chiếu tập file `.test.ts` thay đổi khớp chính xác `89` file (`88` file sửa liệt kê trong `phase-02-migrate-and-verify.md` + `1` file mới `apps/server/src/non-ascii-path-guard.test.ts`), cộng với `CHANGELOG.md` và các file dưới `plans/261111-0520-656-migrations-dir-non-ascii-path/` hoặc `plans/journals/`.
  3. Chạy đầy đủ `3` cổng chất lượng local của repo: `pnpm check` (read-only `biome check .`), `pnpm check-types`, và `pnpm test`.
- **Success criteria:** `CHANGELOG.md` có mục `(#656)` dưới `## 2026-11-11`; cổng allowlist NUL-delimited in `ALLOWLIST_OK 89` (`0` file lạ, `0` thao tác rename/delete trái phép); `pnpm check`, `pnpm check-types`, `pnpm test` đều thoát mã `0`.
- **Verify:** `grep -Fq "(#656)" CHANGELOG.md && node -e 'const {execFileSync}=require("node:child_process"); const fs=require("node:fs"); const phase2=fs.readFileSync("plans/261111-0520-656-migrations-dir-non-ascii-path/phase-02-migrate-and-verify.md","utf8"); const expected=new Set(["apps/server/src/non-ascii-path-guard.test.ts",...[...phase2.matchAll(/^\s*-\s+`(apps\/server\/src\/[^`]+\.test\.ts)`/gm)].map(m=>m[1])]); if(expected.size!==89){console.error("MANIFEST_SIZE_ERR",expected.size);process.exit(1);} const base=execFileSync("git",["merge-base","HEAD","origin/develop"],{encoding:"utf8"}).trim(); const touched=new Set(); const badOps=[]; const diffBuf=execFileSync("git",["diff","--name-status","-z",base]); const dParts=diffBuf.toString("utf8").split("\0").filter(Boolean); for(let i=0;i<dParts.length;){ const st=dParts[i++]; if(st.startsWith("R")||st.startsWith("C")){ const from=dParts[i++],to=dParts[i++]; badOps.push(st+":"+from+"->"+to); touched.add(from); touched.add(to); } else { const p=dParts[i++]; if(st==="D"&&!p.startsWith("plans/")) badOps.push("D:"+p); touched.add(p); } } const stBuf=execFileSync("git",["status","--porcelain=v1","-z","-uall"]); const sParts=stBuf.toString("utf8").split("\0").filter(Boolean); for(let i=0;i<sParts.length;){ const entry=sParts[i++]; const xy=entry.slice(0,2); const p=entry.slice(3); if(xy.includes("R")||xy.includes("C")){ const orig=sParts[i++]; badOps.push(xy+":"+orig+"->"+p); touched.add(orig); touched.add(p); } else { if(xy.includes("D")&&!p.startsWith("plans/")) badOps.push(xy+":"+p); touched.add(p); } } const seenTests=[...touched].filter(f=>expected.has(f)); const unexpected=[...touched].filter(f=>!expected.has(f)&&f!=="CHANGELOG.md"&&!f.startsWith("plans/261111-0520-656-migrations-dir-non-ascii-path/")&&!f.startsWith("plans/journals/")); if(badOps.length>0||unexpected.length>0||seenTests.length!==89){console.error({badOps,unexpected,seenCount:seenTests.length});process.exit(1);} console.log("ALLOWLIST_OK",seenTests.length);' && pnpm check && pnpm check-types && pnpm test` thoát mã `0` và in `ALLOWLIST_OK 89`.

## Todo

- [x] Task 2.1: Chuyển đổi 88 file `.test.ts` sang `fileURLToPath` và xác minh TDD Green trên `non-ascii-path-guard.test.ts`
- [x] Task 2.2: Chạy toàn bộ `apps/server` test suite (`107` file) trong bản sao workspace tiếng Việt cài đặt độc lập
- [x] Task 2.3: Cập nhật `CHANGELOG.md`, kiểm tra allowlist Git NUL-delimited chặt và chạy toàn bộ cổng chất lượng repo

## Verification

- `pnpm --filter server exec vitest run --no-color src/non-ascii-path-guard.test.ts` thoát mã `0` (`3 passed`, `0` vi phạm AST trên toàn bộ `202` file `.ts` của `apps/server/src`).
- Lệnh `Verify` của Task 2.2 chạy toàn bộ `apps/server` test suite trong thư mục tiếng Việt tạm thời cài đặt độc lập (`VITEST_SKIP_SLOW=0`) thoát mã `0` (`Test Files  107 passed (107)`) và dọn sạch thư mục tạm qua `trap`.
- Lệnh `Verify` của Task 2.3 xác nhận `ALLOWLIST_OK 89` và `pnpm check`, `pnpm check-types`, `pnpm test` tại gốc worktree đều thoát mã `0`.

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
