---
phase: 4
title: "Tests & regression — rewrite e2e, helper tạo học viên, full verify sweep"
status: todo
priority: P2
effort: "2h"
dependencies: [1, 2, 3]
---

# Phase 4: Tests & regression sweep

## Goal (Overview)

SĐT + Email giờ bắt buộc trên form tạo ⇒ **mọi e2e spec tạo học viên qua UI đều gãy** (15 fill site / 13 spec hiện chỉ fill tên rồi Lưu — verify bằng grep `getByLabel("Họ tên học viên` trả 15 kết quả, không site nào fill SĐT). Phase này: thêm helper dùng chung `createStudentViaUi`, rewrite 2 spec chủ đề theo hành vi mới (D1/D2 + validation danh tính), cập nhật 11 spec còn lại, chạy toàn bộ gate.

## Context Links

- `apps/e2e/specs/helpers.ts:9-28` — `signUpViaUi` precedent cho helper UI dùng chung (các helper hiện có: `openClassScheduleTab`, date utils — chưa có helper tạo học viên)
- `apps/e2e/specs/student-package-validation.spec.ts` — spec cũ issue #115: test 1 (`:54-113`) cover create-form package validation (Số buổi gói/Đơn giá — input đã bị XOÁ ở phase 2) + test 2 (`:115-193`) cover enroll-mode package validation (flow enroll GIỮ NGUYÊN — chỉ chỗ tạo học viên đầu tiên `:129` cần helper); idiom `countPosts` + `fieldError` (`:28-51`) TÁI SỬ DỤNG
- `apps/e2e/specs/student-package-without-class.spec.ts:1-53` — spec cũ issue #104: fill Số buổi gói/Đơn giá (`:27-28`) + assert "10 buổi · Online"/"10 / 10"/"400.000đ" (`:35-37`) + tuition "0/10" (`:48-50`) — toàn bộ đảo ngược theo D2
- 13 specs có fill site tạo học viên (list đầy đủ bên Implementation Steps bước 3)
- `apps/e2e/playwright.config.ts:27-52` — webServer boot:api thật (migrate migration 0021 thật qua `apps/e2e/src/boot.ts:35-40`) + vite port 8001; workers 1, timezone VN
- Root `package.json` scripts: `check` (biome), `check-types` (turbo), `test` (turbo test + ci-workflow + topology-drift), e2e chạy qua `pnpm --filter e2e e2e`

## Key Insights

- KHÔNG spec nào assert giá trị SĐT hiển thị của học viên (verify grep "phone" trong specs — chỉ signin/profile auth) → đổi form tạo không phá assertion hiển thị; chỉ phá hành vi Lưu (thiếu field bắt buộc → không POST, dialog không đóng → timeout cascade).
- Test 2 của `student-package-validation.spec.ts` (enroll 0 buổi bị chặn per-field) vẫn đúng y nguyên về hành vi — enroll giữ package fields (D4); chỉ đoạn setup tạo học viên đổi sang helper.
- D1 cần một test e2e mới: tạo trong lớp qua tab "Tạo học viên mới" ở class detail → gói phải bằng lớp (sessionsTotal/tuitionFee/mode). Lớp tạo qua UI với học phí (feature #227 đã có field "Học phí / học viên (VND)" trong AddClassModal) để assert price khác 0.
- Server-side 400 (phone chữ/khoảng trắng, email sai) không diễn được qua UI (client strip trước) — cover bằng unit server phase 1; e2e cover cánh client: gõ "09ab 12+" → inputValue còn "0912" (strip) + empty → error per-field + countPosts = 0.

## Requirements

- [ ] Helper `createStudentViaUi(page, name, opts?)` trong helpers.ts — fill tên + SĐT + email, Lưu, chờ dialog đóng
- [ ] Rewrite `student-package-validation.spec.ts`: identity validation create-form (SĐT strip/required, email required/format, KHÔNG có 3 input gói) + giữ test enroll package validation + test mới D1 (gói derive từ lớp)
- [ ] Rewrite `student-package-without-class.spec.ts` theo D2: tạo không lớp → list "Chưa có gói", detail email + "Chưa có gói", tuition "Chưa có gói" + KHÔNG badge "Sắp hết" + KPI không đếm
- [ ] 11 spec còn lại dùng helper (15 fill site); enroll-existing spec giữ assert flow enroll nguyên vẹn
- [ ] Full sweep: `pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm --filter e2e e2e` — exit 0

## Architecture (data flow)

```
Spec nào cần học viên: createStudentViaUi(page, "Tên") → modal create (SĐT + email mặc định) → POST /api/students thật
Spec chủ đề (validation/D1/D2): fill tay từng field để assert per-field error / derive / no-package — không dùng helper cho phần đang test
```

## Related Code Files

- Modify: `apps/e2e/specs/helpers.ts` — thêm `createStudentViaUi`
- Modify (rewrite): `apps/e2e/specs/student-package-validation.spec.ts`, `apps/e2e/specs/student-package-without-class.spec.ts`
- Modify (đổi sang helper): `apps/e2e/specs/class-roster-tuition-debt.spec.ts:21`, `class-assign.spec.ts:24`, `create-invoice.spec.ts:26`, `class-operations.spec.ts:58,176`, `enroll-existing-student.spec.ts:31`, `global-search.spec.ts:96`, `projected-sessions.spec.ts:87`, `student-row-detail.spec.ts:20`, `schedule-session-modal.spec.ts:22`, `session-occurrence.spec.ts:41,92`

## Implementation Steps

1. `apps/e2e/specs/helpers.ts` — thêm (label khớp phase 2: "Họ tên học viên *", "SĐT *", "Email *"):

   ```ts
   /** Tạo học viên qua modal /students (form create — SĐT + email bắt buộc).
    * Mặc định SĐT/email hợp lệ; spec test validation tự fill tay, không dùng helper. */
   export async function createStudentViaUi(
   	page: Page,
   	name: string,
   	opts: { phone?: string; email?: string } = {},
   ): Promise<void> {
   	const dialog = page.getByRole("dialog");
   	await dialog.getByLabel("Họ tên học viên *").fill(name);
   	await dialog.getByLabel("SĐT *").fill(opts.phone ?? "0901234567");
   	await dialog
   		.getByLabel("Email *")
   		.fill(opts.email ?? `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@e2e.test`);
   	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
   	await expect(dialog).toBeHidden();
   }
   ```

   (Caller đã mở modal + assert "Thêm học viên mới" visible trước khi gọi.)

2. Rewrite `apps/e2e/specs/student-package-validation.spec.ts` (giữ `countPosts` + `fieldError`, đổi header comment):
   - Test 1 — "tạo học viên: SĐT digits-only + email bắt buộc, form không còn input gói": mở modal từ /students; assert `getByLabel("Số buổi gói")`/`getByLabel("Đơn giá (VND)")` có count 0; gõ SĐT `"09ab 12+"` → `inputValue()` = `"0912"` (strip); Lưu với SĐT rỗng → error "Vui lòng nhập SĐT." + `countPosts("/api/students")` = 0; SĐT hợp lệ + email `"not-an-email"` → error "Email không hợp lệ." + 0 POST; email rỗng → "Vui lòng nhập email." + 0 POST; đủ hợp lệ → 1 POST, dialog đóng, row hiện "Chưa có gói" (không có gói — D2).
   - Test 2 — giữ nguyên kịch bản enroll 0 buổi (issue #115) nhưng setup tạo học viên (`:129`) dùng `createStudentViaUi`; phần modal class detail giữ fill "Số buổi gói" `"0"` → error per-field (D4: enroll vẫn có package fields).
   - Test 3 (mới) — "tạo học viên trong lớp → gói derive từ lớp (D1)": tạo lớp qua UI có đặt "Học phí / học viên (VND)" (vd 500000) và "Tổng số buổi" 12; class detail → "+ Thêm học viên" → tab "Tạo học viên mới" → fill tên + SĐT + email → Lưu; roster hiện học viên; vào `/students/$id` → package card "Tổng buổi 12 / Đơn giá 500.000đ / Hình thức Online"; tab "Buổi học" của lớp hiện series lesson (precedent assert `enroll-existing-student.spec.ts` bước 7).
3. Rewrite `apps/e2e/specs/student-package-without-class.spec.ts` (đổi header comment issue #104 → D2): tạo học viên không lớp bằng helper; list row hiện "Chưa có gói" + "—" + "—" và KHÔNG có "0 buổi · Online" hay "0 / 0"; detail hiện "Chưa có gói" + Email đã nhập; trang Học phí: row hiện "Chưa có gói" (badge muted), `getByText("Sắp hết")` scoped row count 0.
4. Đổi 15 fill site ở 11 spec sang `createStudentViaUi` (site tạo từ /students: mở modal rồi gọi helper; các site trong `class-operations.spec.ts` tạo từ class detail tab create — helper vẫn dùng được vì label giống, modal mở sẵn). Với `student-row-detail.spec.ts` nếu có assertion label contact "SĐT / Zalo" cũ → đổi theo label mới.
5. Chạy sweep theo thứ tự: `pnpm check` → `pnpm check-types` → `pnpm test` → `pnpm --filter e2e e2e` (full — 28 spec files trong `apps/e2e/specs/`; boot thật + migration 0021 thật). Nếu chỉ muốn chạy nhanh chủ đề trong lúc sửa: `pnpm --filter e2e e2e specs/student-package-validation.spec.ts specs/student-package-without-class.spec.ts`.

## Todo

- [ ] Helper `createStudentViaUi` trong helpers.ts
- [ ] Rewrite student-package-validation.spec.ts (3 test: identity + enroll + D1)
- [ ] Rewrite student-package-without-class.spec.ts (D2: "Chưa có gói" mọi view)
- [ ] 15 fill site / 11 spec đổi sang helper
- [ ] Full sweep 4 lệnh exit 0

## Success Criteria (verify)

- `pnpm check` — exit 0
- `pnpm check-types` — exit 0
- `pnpm test` — exit 0 (web + server vitest qua turbo, + ci-workflow + topology-drift)
- `pnpm --filter e2e e2e` — exit 0, toàn bộ 28 spec files (đặc biệt 2 spec rewrite + `enroll-existing-student` + `class-operations`)
- Manual QA checklist (dev server, 1 org test):
  - [ ] Tạo trong lớp (lớp có học phí) → detail gói 12 buổi/500.000đ/Online, tab Buổi học có lesson series
  - [ ] Tạo không lớp → list/detail/tuition "Chưa có gói", KPI "Sắp hết" không tăng
  - [ ] Enroll học viên có sẵn → vẫn nhập được 3 package fields, Lưu thành công như cũ
  - [ ] SĐT: gõ chữ/khoảng trắng/`+` bị strip; server 400 khi POST trực tiếp phone chứa space (đã cover unit, spot-check curl nếu muốn)
  - [ ] Email: thiếu/sai format bị chặn per-field; row legacy (org cũ) vẫn hiển thị bình thường, không email

## Risk Assessment

- **13 spec gãy cùng lúc** nếu thiếu field bắt buộc — helper bước 1 là single point of fix; chạy full e2e sớm sau khi merge phase 2-3 vào branch.
- e2e boot xóa DB local mỗi chạy (`boot.ts` wipe) — migration 0021 luôn áp trên DB sạch; KHÔNG cover data legacy thật → unit migration test phase 1 cover phần đó; note trong PR.
- Playwright strict-mode trùng text "Chưa có gói" giữa list + tuition — assert scoped theo row/dialog như precedent (`tuitionRow` filter, `:44-47` spec cũ).

## Security Considerations

- E2E tạo user thật trong DB test local (libsql file `apps/e2e/local.db`, wiped mỗi run) — không lộ PII thật; email test dùng domain `@e2e.test` (RFC reserve).
- Không đổi auth/permission trong phase này.

## Next Steps

- Sau khi merge: tạo issue follow-up "Student login (portal + better-auth user + unique SĐT/email)" — data đã sẵn (phone digits + email), quyết định unique constraint lúc đó (D3 ghi nhận).
- Cập nhật `docs/codebase-summary.md` nếu có mục students/create flow (kiểm tra nhanh trước PR).
