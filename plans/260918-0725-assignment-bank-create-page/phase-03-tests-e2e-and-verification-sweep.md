---
title: "Phase 3: Tests, E2E & verification sweep"
description: "Server tests cho POST /api/assignments/prompts (201/400/401/org-isolation), web unit cho presets + mapper + kernelCommand + routes-matcher, component test trang mới, Playwright E2E luồng tạo đề ready + draft, và sweep toàn workspace (biome, check-types, turbo test, topology-drift)."
status: completed
---

# Phase 3: Tests, E2E & verification sweep

## Goal

Mọi hành vi của trang mới được khóa bằng test: hợp đồng API, logic preset pure, render + validate form, và một E2E xanh end-to-end (tạo đề → thấy trong "Đề đã có" → reload còn nguyên) theo đúng khung test hiện có của repo.

## Key Insights

- Server: integration test theo khung `apps/server/src/kernel.test.ts` (Hono app + test db). Precedent #173: test POST gồm 201 + snapshot chứa row đúng field, 400 invalid, 401 không session, cách ly org.
- Web unit: 3 lớp cần phủ — (1) `assignment-presets.ts` pure logic, (2) `kernelCommand` mapping (pattern `apps/web/src/lib/repos/kernel-command.test.ts`), (3) mapper `mapAssignmentPrompts` (pattern `repos/assignments.test.ts`).
- Component test: pattern `apps/web/src/routes/_auth/assignments/index.test.tsx` — render route component với provider fixture; thêm trường hợp CTA điều hướng (thay cho 2 test modal bị xóa ở phase 2).
- E2E: pattern `apps/e2e/specs/create-invoice.spec.ts` — `signUpViaUi` tạo org mới sạch, thao tác UI, assert persist qua reload.
- Root `pnpm test` chạy `turbo run test` + `test:ci-workflow` + `test:topology-drift` — sweep cuối phải chạy đủ cả ba.

## Files to Create / Modify

- Modify: `apps/server/src/kernel.test.ts` — nhóm case `POST /api/assignments/prompts` (hoặc file `assignment-prompt.test.ts` mới nếu file gốc quá dài — giữ 1 nơi với style hiện có)
- Create: `apps/web/src/components/assignments/assignment-presets.test.ts`
- Create/Modify: `apps/web/src/lib/repos/assignment-prompts.test.ts` — mapper
- Modify: `apps/web/src/lib/repos/kernel-command.test.ts` — case `create-assignment-prompt`
- Modify: `apps/web/src/routes-matcher.test.ts` (nếu enum route được assert ở đây) + `apps/web/src/routes-matcher.ts` đã thêm ở phase 2
- Create: `apps/web/src/routes/_auth/assignments/new.test.tsx` — component test trang tạo đề
- Modify: `apps/web/src/routes/_auth/assignments/index.test.tsx` — CTA điều hướng (đã dọn modal test ở phase 2)
- Create: `apps/e2e/specs/assignment-prompt-create.spec.ts`

## Implementation Steps

1. **Server tests** (mỗi case một `test()` riêng, style kernel.test.ts):
   - POST body hợp lệ `status:"ready"` → 201 `{id}`; GET `/api/kernel` → `assignmentPrompts` có 1 row đủ 8 field + đúng giá trị;
   - POST `status:"draft"` → 201, snapshot row `status:"draft"`;
   - POST thiếu `title` / `prompt` rỗng / `task:"task3"` / `band:"8.0"` / field lạ (`strict`) → 400;
   - POST không session → 401;
   - Hai org: org A tạo đề → snapshot org B có `assignmentPrompts` không chứa id đó;
   - POST content-type không phải JSON → bị CSRF guard của kernel router chặn (415/400 theo hành vi guard hiện có — assert đúng status thực tế của guard).

2. **Web unit — presets** (`assignment-presets.test.ts`):
   - catalog: 2 task × đúng số genre (4/4), mỗi genre có title + prompt không rỗng; task2 default;
   - `wordCount("")` = 0, `wordCount("  a  b c ")` = 3;
   - `genreOf` trả genre đúng id, fallback `genres[0]` khi id lạ;
   - logic default/dirty: đổi genre khi `dirtyTitle=false` → title áp default; khi `dirtyTitle=true` → giữ nguyên (test qua helper thuần, không cần render).

3. **Web unit — data layer**:
   - `kernelCommand({ type: "create-assignment-prompt", payload })` → `{ path: "/api/assignments/prompts", body: payload }` — body đủ đúng 8 field, không field thừa;
   - `mapAssignmentPrompts`: snapshot fixture → mảng display shape, giữ nguyên field, fallback status lạ thành string.

4. **Component test** (`new.test.tsx`, provider theo pattern index.test.tsx):
   - render mặc định: title + prompt prefill từ preset Task 2 · Discuss; preview hiển thị "Academic · 250 từ · 40 phút · Band 7.0"; submit enabled;
   - xóa trống title → submit → thấy "Nhập tiêu đề bài tập." + không có POST (dispatch không được gọi);
   - đổi task sang Task 1 → genre về "Biểu đồ", title/prompt áp default Task 1 Chart, help text đổi;
   - đổi Trạng thái "Bản nháp" → label nút "Lưu bản nháp", action copy đổi;
   - dispatch resolve `refreshed` → form ẩn, success card hiện đúng title/lead/meta; "Tạo đề khác" → form quay lại đã reset;
   - dispatch `definite-failure` → giữ form + inline error.

5. **E2E** (`assignment-prompt-create.spec.ts`):
   - `signUpViaUi` → vào `/assignments` → "+ Tạo bài tập" → URL `/assignments/new`;
   - default prefilled → bấm "Lưu vào ngân hàng" → success card "Đã thêm vào ngân hàng" hiện;
   - "Tạo đề khác" → "Đề đã có" chứa đề vừa lưu với Tag "Sẵn sàng" + nguồn;
   - reload trang → đề còn trong "Đề đã có" (persist thật);
   - luồng draft: đổi Trạng thái "Bản nháp" → submit → "Đã lưu bản nháp" → "Đề đã có" có Tag "Bản nháp".

6. **Sweep toàn workspace**:
   - `pnpm check` (biome không qua pipe), `pnpm check-types`, `pnpm test` (gồm ci-workflow + topology-drift);
   - `cd apps/e2e && npx playwright test assignment-prompt-create` — xanh;
   - rà `docs/codebase-summary.md` / `docs/index.md`: nếu có liệt kê API surface/thịnh hành danh sách route thì bổ sung `POST /api/assignments/prompts` + route `/assignments/new`;
   - `ak plan status` cập nhật phase states khi hoàn thành từng phần.

## Verification

```bash
cd apps/server && npx vitest run
cd apps/web && npx vitest run
cd apps/e2e && npx playwright test assignment-prompt-create
pnpm check && pnpm check-types && pnpm test
```

- Mọi lệnh trên exit 0.
- Không còn reference nào đến `add-assignment-modal` (`grep -r "AddAssignmentModal" apps/web/src` rỗng).
- Coverage hành vi: 201/400/401/org-isolation (server); presets + command + mapper (unit); validate + submit + success + draft (component); full flow + reload (E2E).
