---
title: "fix(design-compare): đồng bộ seed trên sự kiện kernel thay vì blind-poll DB"
description: "design-seed chờ GET /api/kernel (sự kiện bootstrap thật) trước khi tra DB, và capture.mjs dump log stack khi seed fail — thay cho poll 21.75s mù quáng."
status: completed
priority: P2
effort: 1h
issue: 397
branch: ai-handle-issue-397
tags: [bugfix, testing, tooling]
blockedBy: []
blocks: []
created: 2026-10-22
---

# Plan — fix harness seed 'no org yet, waiting for bootstrap' (#397)

## Outcome

`pnpm design:compare` exit 0 chạy 2 lần liên tiếp trên máy sạch. Seed không còn
fail timing-dependent khi boot stack mới.

## Root cause (đã chứng minh bằng thí nghiệm, issue #397)

1. Org + membership chỉ được tạo bởi `bootstrapMiddleware`
   (apps/server/src/app.ts:86-142) ở request `/api/*` authenticated **đầu tiên**
   sau signup — cụ thể là `GET /api/kernel` từ dashboard sau full-page load
   `window.location.assign('/dashboard')` (apps/web/src/components/sign-up-form.tsx:70).
2. `design-seed.ts` chờ `waitForURL(/dashboard/)` — resolve ngay khi navigation
   commit, **trước khi JS dashboard chạy xong** — rồi blind-poll DB qua
   `orgIdForTeacherEmail` với budget cố định ~21.75s (30 lần × backoff 50·(i+1)ms,
   apps/e2e/specs/helpers.ts:27-38, 99-118).
3. Thời gian navCommit → `GET /api/kernel` phụ thuộc tốc độ transform module
   graph dashboard của vite dev (luôn lạnh mỗi lần boot — `warm()` của
   capture.mjs chỉ đụng graph `/login`). Probe trên máy nhanh: 309ms. Trên máy
   đang chạy dev stack (workerd :8000 + vite :8001/:8003): vượt 21.75s → fail.
4. Thí nghiệm nhân quả: throttled `GET /api/kernel` 30s (> budget) →
   `orgIdForTeacherEmail` fail sau đúng 21.8s với error y hệt issue
   (`no org yet, waiting for bootstrap`).

[INFERENCE] Kết luận "trên máy báo cáo, navCommit→kernel vượt 21.75s" là suy
diễn từ cơ chế + throttle experiment, KHÔNG đo trực tiếp trên máy đó. Vì vậy
fix phải tự mang diagnostic: khi fail, error phải phân biệt được 3 nhánh —
(a) kernel chậm/aborted (timing), (b) kernel trả 401/403 (cookie/role), (c)
kernel chưa bao giờ được gửi (JS không boot). Lưu ý thêm từ kongming:
`fetchKernelSnapshot` (apps/web/src/lib/repos/kernel.ts:553) có
`AbortSignal.timeout(15000)` — API chậm >15s làm client abort → chỉ có sự kiện
`requestfailed`, không bao giờ có response; code phải race cả 3 khả năng
(response | requestfailed | timeout) rồi vẫn rơi về DB-oracle trước khi throw.

Kết luận: seed lệch khỏi sự kiện causal thật. Fix = đồng bộ trên response
`GET /api/kernel` (sau khi response đi qua, bootstrap đã commit synchronous
trong middleware nên DB query chắc chắn thấy row), cộng diagnostics log stack
khi seed fail. Không tăng mù quáng retry budget — đúng ràng buộc của issue.

## Root cause thứ hai (phát hiện LIVE khi implement — 2026-10-22)

Diagnostics của fix bắt được một fail mode mới: `request sent +649ms ->
response 200 +656ms` rồi poll DB rỗng 21.75s. Truy vết: PID chiếm 8100 là
`tsx src/boot.ts` của **worktree khác** (`ai-handle-issue-394-3` — agent AI
song song). Signup đi vào API worktree đó (DB của nó), seed đọc local.db
worktree mình → "no org yet" vĩnh viễn. Đây chính là kịch bản "stack cũ chiếm
8100" mà acceptance issue cảnh báo — với nhiều worktree/agent chạy song song
(cùng override E2E_*_PORT mặc định) thì xung đột là tất yếu, không cần máy
bẩn. Fix: harness tự chọn free port mỗi run (Task 1.6) — `pnpm design:compare`
xanh bất kể đang có stack nào chạy.

## Scope

- **Sửa:** `apps/e2e/scripts/design-seed.ts`,
  `scripts/design-compare/capture.mjs`.
- **Không sửa:** `apps/e2e/specs/helpers.ts` (retry ngắn giữ nguyên làm safety
  net cho các caller khác: specs #394, teacher-grade-submission…),
  app/server/web code (non-goal của issue).

## Phases

| Phase | File | Mục tiêu |
|---|---|---|
| 01 | phase-01-kernel-sync-diagnostics.md | Seed chờ kernel response + capture.mjs dump log khi seed fail |
| 02 | phase-02-verify-design-compare.md | Gate: `pnpm design:compare` exit 0 × 2 lần liên tiếp |

## Acceptance criteria (từ issue)

- [ ] `pnpm design:compare` exit 0 chạy 2 lần liên tiếp trên máy sạch (không stack cũ chiếm 8100).
- [ ] Không tăng mù quáng số retry — fix đồng bộ trên sự kiện thật, kèm log bootstrap/readyz khi fail.

## Non-goals

- Không đụng code app/server/web.
- Không đổi cơ chế bootstrap của server.
- Không thêm unit test cho harness script (không có test harness cho
  `scripts/` — gate là integration run trong phase 02; verify hành vi throttle
  dùng code thật qua proxy tạm /tmp theo phase-02 Task 2.1, không commit).

## Plan deviating notes

- `orgIdForTeacherEmail` giữ nguyên: các caller khác (specs e2e) vẫn cần
  retry-when-querying-sau-sự-kiện; chỉ design-seed được thêm sync điểm đầu.

## Red Team Review

Reviewers: Security Adversary + Assumption Destroyer (2 phase → 2 lens), mỗi
finding bắt buộc có evidence file:line. Kết quả adjudicate:

| # | Severity | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F1 | HIGH | Dump `outputTail` rò token verify-email (server chỉ redact reset/pay) | apps/server/src/log-redaction.test.ts:27-28, capture.mjs:101-105 | **Accept** — redact `token=` ở điểm collect (Task 1.2) |
| F2/AD2 | MEDIUM/HIGH | Verify Task 1.3 bằng cách chiếm 8100 chết ở tầng boot, không chạm nhánh seed-fail | capture.mjs:158-176 vs 186-191 | **Accept** — verify bằng pkill boot.ts giữa chừng (Task 1.3 bước 2) |
| F3/AD1 | MEDIUM/CRITICAL | Race one-shot + kỳ vọng throttle 30s pass là sai: `AbortSignal.timeout(15000)` + `retry:false` làm kernel chậm luôn thành abort, không bao giờ có response | apps/web/src/lib/repos/kernel.ts:553, query-client.ts:21-23 | **Accept** — Task 1.1 đổi thành vòng observe→reload; Task 2.1 đổi kỳ vọng theo 3 mode |
| AD3 | HIGH | Claim "throttle-test bất khả thi" sai: chạy được design-seed thật qua proxy 8110 | apps/e2e/specs/origins.ts:4 | **Accept** — Task 2.1 dùng proxy + code thật |
| AD4 | MEDIUM | `ERR_ABORTED` không phân biệt abort-15s và navigation-cancel | design-seed.ts:51-52 (comment full-reload) | **Accept** — message ghi failure text thô + 2 nguyên nhân khả dĩ, không khẳng định |
| AD5 | LOW | Bảng worst-case thiếu 21.75s DB poll; timeout 120s chỉ cho nhánh never-sent | kernel.ts:553 | **Accept** — ghi chú ngân sách phase-02 |

REJECT (có kiểm tra, không đủ evidence): SW cache pass giả (dev-sw.js là stub
purge + unregister); bypass predicate pathname (query không đổi pathname,
subpath bị loại chủ đích, Hono strict routing 404 cho `/api/kernel/`).

### Whole-Plan Consistency Sweep
- Sau khi áp findings: mọi nhắc tới "waitForResponse one-shot" đã thay bằng
  "vòng observe→reload" (phase-01 Task 1.1, plan.md root-cause fix).
- Kỳ vọng throttle 30s-pass đã xoá khỏi phase-02; thay bằng 3 mode đúng
  `AbortSignal.timeout(15000)`.
- "throttle-test vĩnh viễn bất khả thi" trong Non-goals đã thay bằng proxy
  method — không còn mâu thuẫn với Task 2.1.
- Scope lock giữ nguyên: chỉ design-seed.ts + capture.mjs; helpers.ts không đổi.
- Không còn contradiction nào chưa giải quyết.
