# Phase 02 — Gate chấp nhận: design:compare xanh 2 lần liên tiếp

Áp red-team AD1/AD3: verify throttle chạy **code thật** qua proxy (không
replica /tmp), và kỳ vọng thời gian tuân theo `AbortSignal.timeout(15000)` +
`retry:false` của `fetchKernelSnapshot` (apps/web/src/lib/repos/kernel.ts:553,
query-client.ts:21-23).

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

### Task 2.1 — Verify throttle bằng code thật qua proxy (kịch bản 2 thái)
- Goal: chứng minh fix xử lý đúng: kernel chậm trong ngưỡng → pass; kernel
  chậm quá 15s (client abort) → seed tự cứu bằng reload → vẫn pass; chỉ fail
  khi JS không boot — và khi fail phải là message có diagnostic.
- Target files: chỉ script tạm trong /tmp (không commit).
- Steps:
  1. Boot api thật ở 8100 (`pnpm --filter e2e run boot:api`,
     E2E_HOSTNAME=127.0.0.1), web vite 8101 với
     `VITE_SERVER_URL=http://localhost:8110`.
  2. Node HTTP proxy trên 8110 forward → 8100, mode A: delay 8s mọi request
     `*api/kernel*` (8s < 15s abort).
  3. Chạy `E2E_API_PORT=8110 tsx scripts/design-seed.ts` (code thật, API origin
     qua proxy): kỳ vọng **pass** — response về trong window, DB có row.
  4. Mode B: delay 30s (> 15s abort): client abort ở ~15s → seed reload → lần
     sau nếu proxy vẫn giữ 30s thì lặp tới hết 120s; để chứng minh vòng cứu
     hoạt động, sau abort đầu tiên tắt delay (proxy về passthrough) → kỳ vọng
     **pass** sau ≥1 observation `requestfailed`, error không xuất hiện.
  5. Mode C (fail có diagnostic): giữ 30s delay + chặn reload không giải phóng
     (delay luôn) → seed fail sau deadline 120s + DB poll với message chứa
     tóm tắt observations (`response`/`requestfailed`/`timeout` + mốc thời
     gian), KHÔNG phải bare `no org yet` mà không ngữ cảnh.
- Success criteria: 3/3 mode hành xử đúng mô tả.
- Verify: output 3 lần chạy khớp kỳ vọng (pass / pass-sau-abort / fail-có-
  diagnostic).

#### Kết quả thực chạy (đã ghi 2026-10-22)
- **R1b negative control** (OLD seed + kernel blocked): exit 1 sau 25s, bare
  `no org yet, waiting for bootstrap` tại design-seed-old.ts:92 ✓ (proxy log
  sạch: kernel held, không forward). Run OLD đầu tiên pass giả do page đi
  thẳng 8100 bỏ qua proxy (nondeterminism env-verify, không phải code) — bỏ
  kết quả đó.
- **Mode A** (hold 8s < abort 15s): seed **exit 0 / 44s**, proxy `kernel GET #1
  forward sau 8000ms`, full seed gồm student flow + 4 quiz attempts ✓.
- **Mode B** (hold 25s > 15s → abort → rescue): run 1 — kernel#1 abort 15s →
  seed goto rescue → kernel#2 forward ngay (hold=1 đã tiêu thụ) → bootstrap →
  teacher flow PASS tới tận step student-verify (chết ở
  `studentPage.goto(verifyUrl)` ERR_ABORTED — flake pre-existing dòng :494,
  code không đổi, ngoài scope #397). Run 2 exit 0 / 19s nhưng proxy bypass
  (page đi thẳng 8100) — không tính làm bằng chứng fix.
- **Mode C** (kernel block vĩnh viễn): đạt bằng run proxy-lỗi-DROP (mọi kernel
  chết trước server — tương đương block vĩnh viễn từ góc nhìn seed): exit 1
  sau 120s deadline + DB poll, error đúng format
  `orgIdForTeacherEmail thất bại. Kernel observations: request sent +1423ms ->
  requestfailed (net::ERR_ABORTED) +16491ms -> …` kèm `[cause]` bare error,
  deadline tôn trọng, không goto vào fetch đang bay ✓.
- Phát hiện phụ từ verify loop: rescue KHÔNG được phép goto khi request còn
  đang bay (navigation tự hủy fetch) — đã sửa loop: chỉ goto trên
  `requestfailed` hoặc window-expiry-không-có-request; observation `request`
  chỉ phục vụ diagnostic.

### Task 2.2 — Chạy acceptance 2 lần liên tiếp
- Goal: đáp ứng acceptance criteria thứ 1 của issue trên máy sạch.
- Target files: không sửa — chỉ chạy.
- Steps:
  1. Đảm bảo không process nào chiếm 8100/8101/8103/8200
     (`lsof -nP -iTCP:8100-8103 -sTCP:LISTEN` rỗng).
  2. Chạy `pnpm design:compare` (full, cả design side) — ghi exit code lần 1.
  3. Chạy ngay `pnpm design:compare` lần 2 — ghi exit code lần 2.
- Success criteria: cả hai lần exit 0.
- Verify: lần 1 exit 0 VÀ lần 2 exit 0; log mỗi lần chứa
  `[harness] seed xong` và `[harness] xong: … 0 lỗi`.

#### Kết quả thực chạy (2026-10-22)
- RUN1: exit 0 — `xong: 418 ảnh, 0 lỗi` (raw xoá sạch trước chạy → capture
  full mọi screen, gồm design side).
- RUN2: exit 0 liền sau RUN1 — `xong: 0 ảnh, 0 lỗi` (raw tồn tại → skip
  capture; boot + seed full pipeline chạy lại xanh). Log RUN2 có
  `[harness] seed xong`.
- Cả hai run chạy khi stack worktree khác (`ai-handle-issue-394-3`) vẫn chiếm
  8100-8103 — free ports hoạt động ✓. Sau run: không orphan từ run này.
- Ghi chú t-attendance: cặp ảnh lệch trạng thái (design: modal Attendance;
  app: default tab Sessions & practice) — không click vì nút 'Điểm danh'
  inline là COMMIT check-in thật (mutate seed data). Ghi trong PR + follow-up.

### Task 2.3 — Kiểm tra không regression cho e2e hiện có
- Goal: helpers.ts không đổi, spec e2e dùng `orgIdForTeacherEmail` không bị
  ảnh hưởng; type-check toàn workspace vẫn xanh.
- Target files: không sửa — chỉ chạy.
- Steps:
  1. `pnpm check-types` exit 0.
  2. `git diff --stat` chỉ liệt kê `apps/e2e/scripts/design-seed.ts` và
     `scripts/design-compare/capture.mjs` (+ plan files).
- Success criteria: type-check xanh; diff scope đúng.
- Verify: `pnpm check-types` exit 0; `git diff --stat` khớp danh sách file trên:
  `apps/e2e/scripts/design-seed.ts`, `scripts/design-compare/capture.mjs`,
  `scripts/design-compare/fetch-design.sh` (DESIGN_PORT + stop kill con),
  `scripts/design-compare/screens.json` (t-attendance appSteps) — cập nhật sau
  Task 1.6/1.7 + review fixes.

## Lưu ý ngân sách thời lượng (red-team AD5)
Seed chạy dưới `spawnSync` timeout 300_000ms của capture.mjs. Worst case mới:
60s waitForURL + 120s vòng kernel-wait (4×30s) + ~22s DB-oracle khi fail +
student flow (~60-90s) → có thể chạm 300s trong trường hợp bệnh lý; harness
kill seed đúng 300s như hiện trạng (không đổi), error vẫn ra qua nhánh
seed-fail có log stack (Task 1.3). Kernel chậm thật (máy tải cao) không bao
giờ đạt timeout 120s — client abort ở 15s rồi reload bắn lại; 120s chỉ phục vụ
nhánh "JS không boot / never-sent".

## Implementation addendum — kongming plan-gate (rủi ro verify)

- **R1 (cao nhất — proxy phải hold-before-forward):** bootstrapMiddleware tạo
  org+membership NGAY khi request authenticated TỚI server (apps/server/src/
  app.ts:125-142), trước handler. Proxy delay-response-then-forward sẽ khiến
  DB có row từ giây đầu → cả 3 mode pass vô nghĩa. Proxy phải GIỮ request N
  giây rồi mới forward; client đóng kết nối (`req.on('close')`) thì DROP, không
  forward.
- **R1b (negative control bắt buộc trước khi sửa code):** chạy mode B
  (hold-and-drop 30s) với `design-seed.ts` CHƯA SỬA → kỳ vọng fail đúng error
  gốc `no org yet, waiting for bootstrap` sau ~21.75s. Nếu code cũ lại pass →
  proxy chưa tái hiện được bug, dừng và sửa proxy trước (Failure Protocol).
- **R5 (pkill an toàn):** không `pkill -f "tsx src/boot.ts"` (địch trực worktree
  khác); kill theo PID `lsof -ti tcp:8100 -sTCP:LISTEN`. Nới assertion dump:
  chỉ yêu cầu thấy `readyz` trong log api (kill có thể trước kernel đầu tiên).
- **R6:** signup qua proxy 8110 nhiều khả năng chạy (cookie không phân biệt
  port, Origin 8101 được giữ) [INFERENCE]; nếu signup fail qua proxy → đó là
  lỗi môi trường verify, báo theo Failure Protocol, KHÔNG sửa design-seed.ts.
- **R7:** deadline kiểm sau mỗi goto (xem addendum phase-01).
