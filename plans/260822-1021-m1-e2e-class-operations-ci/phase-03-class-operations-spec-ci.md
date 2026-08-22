---
title: "Phase 3: Full class-operations spec + e2e.yml + contract test + wiring"
status: todo
priority: P1
effort: 5h
dependencies: [phase-02-e2e-package-boot-smoke.md]
---

# Phase 3: Full class-operations spec + e2e.yml + contract test + wiring

## Overview

Viết spec đầy đủ đúng kịch bản DOD `docs/project-roadmap.md:44`: login → tạo lớp có lịch → thấy buổi sinh → check-in → reload giữ data. Thêm `.github/workflows/e2e.yml` (job riêng, không secrets) và mở rộng `scripts/ci-workflow.test.mjs` khóa contract của e2e.yml. Extract helper sign-up dùng chung (DRY) giữa smoke spec và class-operations spec.

**Facts then chốt cho spec (đã xác minh lại trên code):**
- Buổi sinh khi THÊM HỌC VIÊN vào lớp: `POST /api/students` với `classId` sinh `cls.sessionsTotal` lesson rows (`apps/server/src/routes/kernel.ts:283-301`); modal từ `/classes/$classId` mới có classId (`apps/web/src/routes/_auth/classes/$classId.tsx:101-103`) — modal từ trang `/students` KHÔNG sinh buổi.
- Defaults của AddClassModal (`apps/web/src/components/modals/add-class-modal.tsx:48-63`): type `ielts`, skills rỗng (phải chọn), days rỗng (phải chọn), 19:00–20:30, total "12", startDate = mai. KHÔNG click chip "IELTS" (đã chọn mặc định; click lại có thể toggle).
- `/schedule` render mọi lesson theo cột thứ, không lọc tuần (`apps/web/src/routes/_auth/schedule.tsx:37-40`) → lesson luôn hiển thị, không cần week-nav.
- LessonModal đóng NGAY khi "Điểm danh" (`lesson-modal.tsx:22,87-90`) → success chỉ thấy qua DOM sau refresh → assert post-reload, KHÔNG assert toast "Đã điểm danh.".
- Reload có nghĩa: `staleTime: Infinity` + load gate render null khi pending (`apps/web/src/lib/query-client.ts:13-39`, `data-provider.tsx:152-154`) → mỗi bước phải `await` content; `page.reload()` refetch `GET /api/kernel`, cookie httpOnly sống → còn authed; "Đã học" hiện ra chỉ khi status persisted server-side.

## Requirements

- [x] `apps/e2e/specs/class-operations.spec.ts` chạy trọn kịch bản, xanh local,workers 1, không sleep cứng (chờ auto-waiting của expect).
- [x] `.github/workflows/e2e.yml`: triggers pull_request+push main/develop, concurrency cancel, permissions read, job e2e ubuntu-latest timeout 20m, KHÔNG `${{ secrets.`, KHÔNG đụng `ci.yml`.
- [x] `scripts/ci-workflow.test.mjs` thêm test block mới: e2e.yml exists, `pull_request:` + `push:` + main + develop, no `${{ secrets.`, có `pnpm --filter e2e e2e`, có playwright install bước. (File chỉ đọc ci.yml hiện tại — thêm e2e.yml assertions KHÔNG phá test cũ.)
- [x] Sign-up helper dùng chung: `apps/e2e/specs/helpers.ts` — DRY giữa 2 specs.

## Architecture

Spec là một test tuyến tính duy nhất (single linear scenario, sign-up UI trong spec — no storageState). CI theo sketch đã validate trong research (action versions: checkout v7, pnpm/action-setup v6, setup-node v7, cache v6, upload-artifact v7).

## Related Code Files

| Action | Path |
|--------|------|
| Create | `apps/e2e/specs/class-operations.spec.ts` |
| Create | `apps/e2e/specs/helpers.ts` |
| Create | `.github/workflows/e2e.yml` |
| Modify | `apps/e2e/specs/login.smoke.spec.ts` — dùng helper sign-up (logic giữ nguyên) |
| Modify | `scripts/ci-workflow.test.mjs` — thêm test block e2e contract |

## Implementation Steps

### Tests Before (TDD)

1. Viết spec đầy đủ `class-operations.spec.ts` (chạy RED trước khi tinh chỉnh — mọi assertion phải map 1-1 vào selector đã verify dưới đây).
2. Viết contract test block trong `scripts/ci-workflow.test.mjs` TRƯỚC khi tạo e2e.yml → đỏ → tạo e2e.yml → xanh.

### helpers.ts

```ts
import type { Page } from "@playwright/test";

export async function signUpViaUi(page: Page, name = "E2E Teacher") {
	await page.goto("/login");
	await page.locator("#su-name").fill(name);
	await page.locator("#su-email").fill(`e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`);
	await page.locator("#su-password").fill("password-8chars");
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page).toHaveURL(/\/dashboard/);
}
```

### class-operations.spec.ts — kịch bản + selector map (chuỗi Việt ngữ EXACT)

```ts
import { expect, test, type Page } from "@playwright/test";
import { signUpViaUi } from "./helpers";

test("login → tạo lớp có lịch → thấy buổi → check-in → reload giữ data", async ({ page }) => {
	const CLASS_NAME = "E2E IELTS Writing nhóm tối";
	const STUDENT_NAME = "Nguyễn Văn E2E";

	// 1. Sign-up (org bootstrap tự động khi GET /api/kernel đầu tiên)
	await signUpViaUi(page);

	// 2. Tạo lớp có lịch (T2 + T4, skill Writing, giữ defaults: 19:00-20:30, 12 buổi, start mai)
	await page.getByText("Lớp học", { exact: true }).first().click(); // sidebar nav
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click(); // classes/index.tsx:42
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Tạo lớp mới")).toBeVisible(); // add-class-modal.tsx:145
	await dialog.getByLabel("Tên lớp *").fill(CLASS_NAME); // Field htmlFor — field.tsx:36-43
	await dialog.getByRole("button", { name: "Writing", exact: true }).click();
	await dialog.getByRole("button", { name: "T2", exact: true }).click();
	await dialog.getByRole("button", { name: "T4", exact: true }).click();
	await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click(); // :269
	await expect(dialog).toBeHidden(); // modal chỉ đóng sau khi kernel refresh áp dụng
	await expect(page.getByText(CLASS_NAME)).toBeVisible();
	await expect(page.getByText("0/12 buổi")).toBeVisible(); // classes/index.tsx:92

	// 3. Vào lớp + thêm học viên (BUỚC SINH BUỔI HỌC — không bỏ qua)
	await page.getByText(CLASS_NAME).click(); // row onClick → /classes/$classId
	await page.getByRole("button", { name: "+ Thêm học viên" }).click(); // $classId.tsx:102
	await expect(page.getByText("Thêm học viên mới")).toBeVisible(); // add-student-modal.tsx:81
	await page.getByLabel("Họ tên học viên *").fill(STUDENT_NAME); // :84
	await page.getByRole("button", { name: "Lưu", exact: true }).click(); // :159
	await expect(page.getByText(STUDENT_NAME)).toBeVisible(); // tab "Học viên" mặc định

	// 4. Thấy buổi sinh: tab Lịch học — 12 buổi "Sắp tới"
	// (Tabs render <button type="button"> thuần, KHÔNG role="tab" — tabs.tsx:19-22)
	await page.getByRole("button", { name: "Lịch học", exact: true }).click(); // $classId.tsx:124
	await expect(page.getByText("Sắp tới", { exact: true })).toHaveCount(12); // :210

	// 5. Check-in trên /schedule
	await page.getByText("Lịch dạy", { exact: true }).first().click(); // sidebar.tsx:53
	await expect(page).toHaveURL(/\/schedule$/);
	// 12 lesson-block cùng tên học viên (mỗi buổi 1 block) → PHẢI .first(), strict mode
	const lesson = page.locator("button.lesson-block", { hasText: STUDENT_NAME }).first(); // schedule.tsx:54
	await expect(lesson).toBeVisible();
	await lesson.click();
	await expect(page.getByText(`${STUDENT_NAME} — 1:1`)).toBeVisible(); // lesson-modal.tsx:33
	await page.getByRole("button", { name: "Điểm danh" }).click(); // :90
	await expect(page.getByText(`${STUDENT_NAME} — 1:1`)).toBeHidden(); // modal đóng ngay (KHÔNG phải tín hiệu thành công)
	// BARRIER bắt buộc: modal đóng là fire-and-forget (`void run(...)` — lesson-modal.tsx:22-27);
	// POST /api/lessons/:id/check-in + kernel refetch phải XONG trước khi reload.
	// Lesson completed → block mang class opacity-60 + tên line-through (schedule.tsx:54-75)
	// chỉ xuất hiện sau khi refetch áp trạng thái completed → đây là sync barrier deterministic.
	await expect(lesson).toHaveClass(/opacity-60/);

	// 6. Reload giữ data — bằng chứng persisted server-side
	await page.reload(); // cookie httpOnly sống; kernel refetch từ DB
	// Persist proof 1 (trang đang đứng /schedule): trạng thái completed sống sót reload
	await expect(page.locator("button.lesson-block", { hasText: STUDENT_NAME }).first()).toHaveClass(/opacity-60/);
	// Persist proof 2 (badge chỉ tồn tại ở /classes/$classId tab "Lịch học" — $classId.tsx:200-211;
	// /schedule KHÔNG render chữ "Đã học"/"Sắp tới" — schedule.tsx:47-108). Navigate là BẮT BUỘC.
	await openClassScheduleTab(page, CLASS_NAME);
	await expect(page.getByText("Đã học", { exact: true })).toHaveCount(1); // :202
	await expect(page.getByText("Sắp tới", { exact: true })).toHaveCount(11);
});

async function openClassScheduleTab(page: Page, className: string) {
	await page.getByText("Lớp học", { exact: true }).first().click(); // sidebar
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(className).click(); // row → /classes/$classId
	await page.getByRole("button", { name: "Lịch học", exact: true }).click();
}
```

Lưu ý implementation (chỉnh nếu selector thực tế lệch nhẹ, giữ nguyên ý):
- `page.locator("button.lesson-block", { hasText: STUDENT_NAME })` match 12 block (mỗi buổi 1 block chứa tên học viên — `schedule.tsx:47-79`) → LUÔN dùng `.first()`, không bỏ.
- Sau "Điểm danh" URL chắc chắn vẫn `/schedule` (modal đóng không navigate) → bước 6 luôn bao gồm: reload → assert opacity-60 trên /schedule → `openClassScheduleTab` → đếm badge. KHÔNG assert "Đã học"/"Sắp tới" trên /schedule (không tồn tại ở đó).
- `getByText(CLASS_NAME).click()`: row DataTable có `onClick` navigate (`classes/index.tsx:58-62`); nếu text nằm trong nhiều node, scope theo `getByRole("row")`.

### .github/workflows/e2e.yml (theo style ci.yml, 2-space YAML — biome không format YAML)

```yaml
name: E2E

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

concurrency:
  group: e2e-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
        with:
          version: 10.33.1
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: actions/cache@v6
        with:
          path: ~/.cache/ms-playwright
          key: playwright-1.62.1-ubuntu-latest
      - run: pnpm --filter e2e exec playwright install --with-deps chromium
      - run: pnpm --filter e2e e2e
      - uses: actions/upload-artifact@v7
        if: failure()
        with:
          name: playwright-report
          path: apps/e2e/playwright-report/
          retention-days: 7
```

(dummy env KHÔNG cần trong workflow — boot.ts tự chứa dummy literals; KHÔNG secrets.)

### Contract test extension (scripts/ci-workflow.test.mjs — thêm block mới, không sửa block cũ)

```js
test("e2e workflow exists and matches the e2e contract", () => {
	const e2ePath = join(repoRoot, ".github/workflows/e2e.yml");
	assert.equal(existsSync(e2ePath), true, "missing .github/workflows/e2e.yml");
	const yaml = readFileSync(e2ePath, "utf8");
	assert.match(yaml, /pull_request:/, "must trigger on pull_request");
	assert.doesNotMatch(yaml, /pull_request_target/, "must never use pull_request_target (PR fork escalation)");
	assert.match(yaml, /push:/, "must trigger on push");
	assert.match(yaml, /\bmain\b/, "must include main");
	assert.match(yaml, /\bdevelop\b/, "must include develop");
	assert.match(yaml, /contents:\s*read/, "must keep read-only permissions");
	assert.match(yaml, /playwright install/, "must install playwright browsers");
	assert.match(yaml, /^\s*- run: pnpm --filter e2e e2e\s*$/m, "must run the e2e package as its own step");
	// chặn cả secrets.X và secrets['X'] (index access) — regex cũ của ci.yml block chỉ chặn dạng dấu chấm
	assert.doesNotMatch(yaml, /\$\{\{\s*secrets[\.\[]/, "must not require GitHub secrets");
});
```

### Tests After

3. `pnpm --filter e2e e2e` xanh local, chạy lại 2 lần (flake check).
4. `node --test scripts/ci-workflow.test.mjs` xanh (cả 2 block).
5. `pnpm test` xanh (contract test mới nằm trong root test chain).

### Regression Gate

```bash
pnpm install --frozen-lockfile && pnpm exec biome check . && pnpm test && pnpm check-types && pnpm --filter e2e e2e
```

## Success Criteria

- [x] Spec class-operations xanh local 2 lần liên tiếp: đủ 6 chặng; assert barrier `opacity-60` trên /schedule sau "Điểm danh" (chống race fire-and-forget); 12 "Sắp tới" trước check-in; sau reload: opacity-60 sống sót trên /schedule + navigate tab "Lịch học" thấy 1 "Đã học" + 11 "Sắp tới".
- [x] Không có assertion nào vào toast, PageHead hardcode ("3 lớp đang hoạt động"), dashboard greeting; không assert badge trên /schedule (không tồn tại ở đó).
- [x] `node --test scripts/ci-workflow.test.mjs` xanh (cả 2 block, gồm assert playwright install + no pull_request_target + permissions read + secrets index-access).
- [x] e2e.yml không chứa `${{ secrets.`; `ci.yml` không đổi (`git diff --stat .github/workflows/ci.yml` rỗng).
- [x] Regression gate xanh.

## Risk Assessment

| Risk (wrong assumption) | Observable signal | Pre-decided response |
|---|---|---|
| Chip "Writing"/"T2"/"T4" match nhiều element (strict mode violation) | Playwright error "resolved to N elements" | Scope mọi locator vào `dialog`; `exact: true`; nếu ChipMulti render span trong button → dùng `getByRole("button", { name: ... })` |
| Tab "Lịch học"/"Học viên" không phải role tab | getByRole("tab") timeout | ĐÃ verify: Tabs render `<button type="button">` thuần (`apps/web/src/components/ui/tabs.tsx:19-22`) → spec dùng `getByRole("button", { name: "Lịch học", exact: true })` sẵn; nếu DOM đổi (thêm role tab thật) thì cả hai locator vẫn match được button |
| 12 lesson-block cùng tên → strict mode violation | Playwright error "resolved to 12 elements" | Spec đã dùng `.first()` sẵn; nếu thêm scope cột ngày (`getByRole("columnheader")`) thì giữ `.first()` vì tuần có thể chứa 2 buổi cùng cột |
| Modal "Tạo lớp" submit tên trùng nút "+ Tạo lớp" | Strict mode violation khi click submit | Scope vào dialog + `exact: true` (nút ngoài là "+ Tạo lớp", trong modal là "Tạo lớp") |
| Toast/đóng modal lệch timing | Flaky pass/fail giữa các lần chạy | Chỉ assert DOM bền vững (modal hidden, text hiển thị sau refresh); KHÔNG dùng `waitForTimeout` |
| CI thiếu apt deps cho chromium | e2e job đỏ ở bước launch browser với lỗi thư viện | `playwright install --with-deps` đã cover; cache chỉ cho `~/.cache/ms-playwright` (browser binaries), apt cài mỗi run — chấp nhận |
| e2e.yml cache key lỗi sau upgrade playwright | CI download lại browser (chậm, vẫn xanh) | Key có sẵn version `playwright-1.62.1-...`; nếu đổi version pin → đổi key cùng commit |
