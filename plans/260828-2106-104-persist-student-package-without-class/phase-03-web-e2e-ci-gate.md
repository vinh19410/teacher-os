---
phase: 3
title: "Web + e2e kịch bản QC + full CI gate"
status: completed
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Web + e2e kịch bản QC + full CI gate

## Overview

Khoát e2e quanh đúng kịch bản QC (tạo học viên từ list `/students`, không lớp →
list hiện `10 buổi · Online`, `400.000đ`; `/tuition` không còn `0/0` Sắp hết) —
khoảng trống e2e duy nhất của bug này (e2e hiện chỉ phủ đường CÓ lớp). Xong chạy
full CI gate cục bộ, gồm assert generate-diff-rỗng chốt tính toàn vẹn snapshot.

## Requirements

- Functional: e2e spec tái hiện đúng Steps + Expected của issue #104.
- Non-functional: full CI job `quality` xanh cục bộ trước khi ship.

## Architecture

`apps/e2e` playwright: workers=1, chromium, baseURL :8001, API thật :8000 qua
`tsx src/boot.ts` (migrate thật qua libsql — sẽ chạy 0011/0012), `reuseExistingServer:
false`, auth round-trip thật qua `signUpViaUi(page)` (credential local — chạy được
trên CI). Spec mới đặt cạnh `class-operations.spec.ts`.

## Related Code Files

- Modify: `apps/web/src/lib/repos/students.test.ts` (thêm case pkg có enrollmentId
  null → total/price/mode hiển thị, done 0; fixtures `:31-48,167-184` vẫn compile
  với `string | null` không cần sửa)
- Create: `apps/e2e/specs/student-package-without-class.spec.ts`
- Reference: `apps/e2e/specs/helpers.ts` (`signUpViaUi`), `apps/e2e/playwright.config.ts`

## Implementation Steps (TDD)

1. **Web unit test trước**: thêm case `mapStudents` với package
   `{enrollmentId: null, total: 10, price: 400000, mode: "Online"}` → `pkg.total 10`,
   `remaining 10`, `price 400000`, `done 0`. Chạy `pnpm --filter web test`.
2. **E2e spec**: sign up qua UI → `/students` → **+ Thêm học viên** →
   `QC-104-1`, `0900000104`, số buổi `10`, đơn giá `400000`, Online → Lưu →
   assert row list hiện `10 buổi · Online` + `10 / 10` + `400.000đ` (selector theo
   `students/index.tsx:65,68,76` + format `mock-data.ts:180-182`) → `/tuition`
   assert không có badge **Sắp hết** cho học viên đó, gói `0/10` (render từ
   `pkg.remaining` — `tuition.tsx:79,84-117`).
3. **Generate-diff assert**: `pnpm --filter db db:generate` trên tree sạch →
   `git status --porcelain packages/db/src/migrations` phải rỗng (chứng minh
   snapshot 0011/0012 khớp schema TS — red-team Critical #1).
4. **Regression Gate (full CI)**: `pnpm exec biome check .` → `pnpm test` →
   `pnpm check-types` → `pnpm build` → `pnpm --filter e2e e2e`
   (cần `pnpm exec playwright install chromium` trong apps/e2e nếu chưa).

## Todo

- [x] Web unit case enrollmentId null
- [x] E2e spec kịch bản QC xanh
- [x] Generate-diff rỗng
- [x] Full CI gate cục bộ xanh (4 lệnh + e2e)

## Success Criteria

- [x] e2e: list hiện đúng `10 buổi · Online`, `400.000đ`, `10 / 10`
- [x] e2e: `/tuition` không còn `0/0` + **Sắp hết** cho học viên mới
- [x] Generate diff rỗng; toàn bộ CI job `quality` xanh cục bộ

## Risk Assessment

E2e flaky do env (port/chromium). Config đã xác minh: readyz :8000 timeout 120s,
`.github/workflows/e2e.yml` chạy trên `pull_request` với retries=1 — nếu env local
không chạy được chromium, ghi nhận và dựa CI e2e sau khi mở PR (fallback hợp lệ).
