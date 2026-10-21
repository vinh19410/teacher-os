# Phase 01 — Đồng bộ seed trên sự kiện kernel + diagnostics + warm dashboard

Kết quả kongming gate sau investigation: GO kèm 4 điều kiện — đã lồng vào các
task dưới. Kết quả red-team 2 lens (Security Adversary + Assumption Destroyer):
6 findings ACCEPT đã áp (F1 redact token; F2/AD2 verify nhánh lỗi bằng pkill;
F3/AD1 race one-shot sai — thay bằng vòng drive-reload vì `AbortSignal.timeout(15000)`
+ `retry:false` làm kernel chậm luôn thành abort; AD3 proxy-throttle chạy code
thật; AD4 không dán nhãn nguyên nhân requestfailed; AD5 ngân sách thời lượng).

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

### Task 1.1 — design-seed: vòng chờ kernel (observe → reload) rồi DB-oracle
- Goal: sau signup, seed chủ động drive đến khi bootstrap chạy xong: chờ sự kiện
  kernel (response | requestfailed) trong window 30s; không thấy → reload
  dashboard để bắn lại kernel (client abort 15s + `retry:false` nghĩa là bỏ
  chờ bị động sẽ chết trên máy tải cao); thấy response → tra DB; khi fail,
  error liệt kê các observation (status/failure-text/mốc thời gian) không dán
  nhãn nguyên nhân tuyệt đối.
- Target files: `apps/e2e/scripts/design-seed.ts` (khối `// 1) Teacher đăng ký
  qua UI → org bootstrap.`).
- Steps:
  1. Trước dòng `await page.getByRole("button", { name: "Create account" }).click();`
     đăng ký helper quan sát bằng `page.waitForEvent`/`page.waitForResponse`
     với predicate: method GET và `new URL(r.url()).pathname === "/api/kernel"`
     (ĐÚNG BẰNG, không khớp subpath `/api/kernel/vocab|...`).
  2. Giữ nguyên click + `waitForURL(/dashboard/, { timeout: 60_000 })`.
  3. Vòng lặp tối đa 4 lần (deadline tổng 120s từ sau waitForURL):
     - Race 3 sự kiện với window 30_000ms: response (ghi `status`),
       requestfailed (ghi `failure()?.errorText` thô), timeout.
     - Response → push observation `{kind:"response",status,at}` → thoát vòng.
     - requestfailed/timeout → push observation (kèm chú thích 2 nguyên nhân
       khả dĩ của `ERR_ABORTED`: abort 15s của `fetchKernelSnapshot` hoặc
       navigation-cancel do full-reload vite — KHÔNG khẳng định cái nào) →
       `await page.reload({ waitUntil: "load" })` → lặp lại nếu còn deadline.
  4. Sau vòng: gọi `orgIdForTeacherEmail(teacherEmail)` trong try/catch như
     cũ; nếu fail → throw error mới: message gốc của helper + tóm tắt
     observations + gợi ý nhánh (response 401 → nghi cookie cross-origin
     E2E_HOSTNAME; response 403 → role gate; chỉ có requestfailed/timeout →
     timing/JS-chưa-boot). Kernel 200 mà DB trống → giữ message gốc helper.
  5. Không đổi `apps/e2e/specs/helpers.ts` (kongming điều kiện 3; các spec
     teacher-grade-submission/teacher-essay-annotations/seedStudent dùng chung).
- Success criteria: mọi fail path in evidence quan sát được; response 200 dẫn
  thẳng tới DB query; abort không làm seed chết mà được reload cứu.
- Verify: `pnpm --filter e2e check-types` exit 0.

### Task 1.2 — capture.mjs: warm thêm `/dashboard` + redact token khi dump log
- Goal: (a) vite transform shared graph qua /dashboard trước seed (kongming
  điều kiện 2); (b) không rò token verify-email/reset/pay ra stderr/CI khi in
  log (red-team F1: `redactResetToken` của server KHÔNG cover verify-email —
  apps/server/src/log-redaction.test.ts:27-28 chốt giữ nguyên token).
- Target files: `scripts/design-compare/capture.mjs` (khối warm; hàm
  `start()`/`collect`; 2 điểm in `outputTail`: `waitUrl` timeout và nhánh
  seed-fail của Task 1.3).
- Steps:
  1. Thêm `await warm(`${WEB}/dashboard`, "#su-name");` sau warm login, kèm
     comment: chưa có session nên redirect về /login — warm được shared graph
     (router, auth client); chunk riêng dashboard vẫn lạnh, được phủ bởi vòng
     kernel-wait của Task 1.1.
  2. Thêm hàm `const redactLog = (s) => s.replace(/([?&]token=)[^\s&"']+/gi,
     "$1[redacted]");` áp lên buffer trước khi GHI vào `outputTail` (một điểm
     duy nhất trong `collect`) — tự động phủ cả 2 điểm in.
- Success criteria: log in ra không còn `token=<giá trị>`; warm dashboard
  không làm hỏng flow.
- Verify: gộp vào Task 1.4 + kiểm tra chuỗi `[redacted]` trong output của lần
  chạy gây fail ở Task 1.3.

### Task 1.3 — capture.mjs: dump log stack khi seed fail + verify bằng pkill
- Goal: seed fail → in `outputTail` theo tên process (format như `waitUrl`).
  Verify nhánh lỗi này phải chạm đúng nhánh `seeded.status !== 0` (red-team
  F2/AD2: chiếm port 8100 chỉ giết ở tầng boot `waitUrl`, không tới seed).
- Target files: `scripts/design-compare/capture.mjs` (nhánh
  `if (seeded.status !== 0)`).
- Steps:
  1. Thêm vào console.error của nhánh lỗi section
     `--- log stack (api/web/student) ---` + `[...outputTail.entries()]
     .map(([n, b]) => \`## ${n}\n${b}\`).join("\n")`.
  2. Verify (chạy 1 lần, không commit gì): chạy `node
     scripts/design-compare/capture.mjs --side app --screens login-teacher`
     nền; khi `[harness] boot api…` xong và seed bắt đầu (`[harness] seed dữ
     liệu so sánh…`) → `pkill -f "tsx src/boot.ts"` → api chết giữa chừng →
     signup fail → seed exit ≠ 0 → dump chạy.
- Success criteria: exit ≠ 0; stderr chứa chuỗi section trên; log api trong
  dump có dòng `readyz`/`kernel` (chứng minh là log thật của stack).
- Verify: như bước 2; kèm assertion output chứa `[redacted]` cho mọi URL token.

### Task 1.4 — Smoke seed xanh sau sync
- Goal: flow seed đầy đủ chạy xanh với fix.
- Target files: không sửa — chỉ chạy.
- Steps:
  1. `node scripts/design-compare/capture.mjs --side app --screens login-teacher`
- Success criteria: exit 0.
- Verify: command exit 0; log chứa `[harness] seed xong`; tail
  `[harness] xong: N ảnh, 0 lỗi` (N có thể < 6 nếu raw screenshot tồn tại từ
  lần chạy trước — harness skip file có sẵn, xem `existsSync(rawFile)`).

### Task 1.5 — capture.mjs: cleanup cả process group (phát hiện từ smoke run)
- Goal: harness exit không để lại orphan node (vite/boot:api) chiếm 8100-8103 —
  nguyên nhân khiến lần chạy sau EADDRINUSE chết im lặng và `waitUrl` chạm
  nhầm stack CŨ (local.db không wipe, mail-log không reset) → acceptance
  "2 lần liên tiếp" vô nghĩa.
- Target files: `scripts/design-compare/capture.mjs` (`start()` + `cleanup()`).
- Steps: `detached: process.platform !== "win32"` trong spawn; cleanup kill
  `-pid` (process group) với fallback `c.kill("SIGTERM")`.
- Success criteria: sau harness exit, `lsof -nP -iTCP:8100-8103 -sTCP:LISTEN`
  rỗng.
- Verify: chạy smoke → exit 0 VÀ 0 listeners sau 2s. (Đã chạy: exit 0, 0
  listeners.)

### Task 1.6 — capture.mjs: free port mỗi run (chống xung đột worktree song song)
- Goal: harness không bao giờ đụng stack của worktree AI khác / dev stack —
  root cause thứ hai được bắt LIVE bằng chính diagnostics của Task 1.1
  (kernel 200 +7ms nhưng membership không bao giờ có trong local.db của
  worktree này: signup đã đi vào API của worktree `ai-handle-issue-394-3`
  đang chiếm 8100 — PID 66498, `ps` xác nhận command + worktree khác).
- Target files: `scripts/design-compare/capture.mjs` (consts port),
  `scripts/design-compare/fetch-design.sh` (PORT override).
- Steps: chọn 4 free port qua `net.createServer().listen(0)` cho
  API/WEB/STUDENT/DESIGN; fetch-design.sh nhận `DESIGN_PORT` env (mặc định
  giữ 8200); toàn bộ env đã tham số hóa sẵn (E2E_*_PORT, VITE_SERVER_URL).
- Success criteria: `pnpm design:compare` pass khi 8100-8103 đang bị chiếm.
- Verify: chạy `--side app --screens t-attendance` trong lúc stack worktree
  khác còn chiếm 8100-8103 → exit 0.

### Task 1.7 — screens.json: t-attendance stale sau #391 (phát hiện khi chạy acceptance)
- Goal: screen t-attendance capture được trên UI post-#391 mà không mutate
  seed data giữa các viewport.
- Bằng chứng: acceptance run 1 — seed PASS (lần đầu vượt qua seed) exposes
  t-attendance fail 6/6 viewport: click `button:has-text('Buổi học')` timeout
  20s — tab bị #391 merge vào "Sessions & practice" (mặc định). Thử fix
  clickFirst 'Điểm danh' → MUTATE (nút inline commit check-in thật, ảnh chụp
  state "Đang lưu…", 5 viewport sau hết nút). Thử selector
  'điểm danh →' → không match (mũi tên không nằm trong textContent; text nút
  link và nút commit đều là "Điểm danh" — không phân biệt bằng text).
- Target files: `scripts/design-compare/screens.json` (t-attendance appSteps).
- Steps: `"appSteps": []` — chụp default tab "Sessions & practice" (có affordance
  Điểm danh inline của buổi hôm nay) — zero click, zero mutation, deterministic
  6/6 viewport; khớp precedent capture cũ (design-modal so với app default
  page, plans/261020-1446-378-redesign-design-v2/screenshots/t-attendance/).
- Success criteria: `--side app --screens t-attendance` exit 0, 6/6 ảnh.
- Verify: chạy 1 lần exit 0.

## Implementation addendum — kongming plan-gate (GO, rủi ro R1–R8)

- **R2 (thiết kế listener):** dùng MỘT collector `page.on("request" |
  "response" | "requestfailed")` có timestamp, đăng ký trước click; mỗi vòng
  chỉ chờ trên mảng observations đã thu. KHÔNG tạo
  `waitForResponse`/`waitForEvent` timeout trong từng vòng (promise mồ côi
  reject muộn → unhandledRejection giết tsx với stack gây hiểu lầm). Sự kiện
  `request` bắt buộc có để tách *never-sent* khỏi *đã gửi đang treo*.
- **R3 (hành động cứu):** `page.goto(`${WEB_ORIGIN}/dashboard`, { waitUntil:
  "load" })` thay cho `page.reload()` (trang có thể đã bị đẩy sang
  `/login?returnUrl` hoặc vừa full-reload); bọc try/catch — goto tự ném
  ERR_ABORTED thì ghi thành observation, không để seed chết.
- **R4 (redact 2 chỗ còn sót):** redact trên buffer ĐÃ NỐI
  (`buf = redact(buf + d).slice(-4000)`) chứ không redact từng chunk (token có
  thể cắt ngang biên chunk); `seeded.stdout`/`seeded.stderr` KHÔNG đi qua
  `collect` → phải áp `redactLog` riêng cho 2 chuỗi này ở nhánh seed-fail.
- **R7 (ngân sách):** kiểm deadline SAU MỖI lần goto (tránh vòng thứ 5); mode
  C thực tế ~4×(15s+load) ≈ 70–80s vì abort ở 15s.
- **R8:** `pnpm --filter e2e check-types` không phủ `capture.mjs` (tsconfig
  include apps/e2e/scripts) → thêm `node --check
  scripts/design-compare/capture.mjs` vào Verify của Task 1.2/1.3.
