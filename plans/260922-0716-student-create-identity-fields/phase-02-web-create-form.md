---
phase: 2
title: "Web form tạo học viên — bỏ input gói, thêm Email, SĐT strip non-digits"
status: todo
priority: P2
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Web form tạo học viên (AddStudentModal mode "create")

## Goal (Overview)

Mode **create** của `AddStudentModal` bỏ 3 input gói, thêm Email bắt buộc, SĐT bắt buộc + strip ký tự không phải số ngay khi gõ. Mode **existing** (enroll) giữ nguyên package fields và validation của nó (D4). Chuỗi payload web (`data-actions.ts` → `repos/kernel.ts`) và fixture reducer đi theo contract mới của phase 1.

## Context Links

- `apps/web/src/components/modals/add-student-modal.tsx:11` — `PHONE_RE = /^[0-9\s+]*$/` (regex cũ cho phép space và `+` — phải thay)
- `apps/web/src/components/modals/add-student-modal.tsx:50-58` — state `total/price/modeOnlineOffline` + errors (enroll mode vẫn dùng — GIỮ NGUYÊN)
- `apps/web/src/components/modals/add-student-modal.tsx:83-104` — `resetFields` / `switchMode` (switchMode xoá totalError/priceError — vẫn cần cho enroll)
- `apps/web/src/components/modals/add-student-modal.tsx:114-179` — `submit()`: package validation chạy TRƯỚC nhánh mode (`:121-136`) vì fields chia sẻ; create payload tại `:163-174`
- `apps/web/src/components/modals/add-student-modal.tsx:188-223` — JSX `packageFields` chia sẻ, render ở mode existing (`:295`) VÀ create (`:325`) — phải un-share
- `apps/web/src/components/modals/add-student-modal.tsx:306-317` — Field "SĐT / Zalo" với help "Chỉ số và khoảng trắng, VD: 09xx xxx xxx" (đổi)
- `apps/web/src/lib/data-actions.ts:72-84` — type `KernelAction` nhánh `add-student` (`name, phone, parentName, total, price, mode, classId?`)
- `apps/web/src/lib/repos/kernel.ts:39-57` — `kernelCommand` map `add-student` → `POST /api/students` body
- `apps/web/src/lib/data-store-reducer.ts:87-122` — fixture reducer case `add-student` destructure `total, price, mode` từ payload (compile gãy khi type đổi; runtime không dùng — chỉ test đọc)
- `apps/web/src/lib/data-store-reducer.test.ts:413-457` — 4 test add-student của fixture reducer
- `apps/web/src/lib/add-student-enroll.contract.test.ts:36-41` — lock regex payload `add-student` chứa `\bclassId\b` (vẫn pass sau đổi)

## Key Insights

- Un-share là điều kiện tiên quyết: `packageFields` là một JSX variable render ở cả 2 branch (`:295`, `:325`) và validation của nó cũng chạy trước branch (`:121-136`). Phải (a) dời validation package vào branch existing, (b) dời JSX package fields vào branch existing — nếu không create form vẫn validate/chặn submit với total 0 như cũ.
- State `total/price/modeOnlineOffline` + error states GIỮ LẠI (enroll mode dùng); chỉ branch create ngừng đọc chúng.
- Strip-on-change (`replace(/\D/g, "")`) phủ luôn paste (React onChange nhận giá trị paste) — regex validate chỉ còn vai trò guard cuối (empty check).
- `data-store-reducer.ts` là fixture chết ở runtime (chỉ `data-store-reducer.test.ts` import) nhưng vẫn type-check theo `KernelAction` — bắt buộc sửa cùng phase này.
- Web vitest chạy không type-check (esbuild) nhưng `check-types` (`vite build && tsc --noEmit`) có — fixtures `KernelStudentRow` thiếu `email` (từ phase 1) phải bổ sung ở phase này để xanh lại check-types.

## Requirements

- [ ] Mode create: KHÔNG render "Số buổi gói" / "Đơn giá (VND)" / "Hình thức"; mode existing render y nguyên
- [ ] Field "Email *" (Input type email, required, validate format client) sau field SĐT
- [ ] Field SĐT: required, strip non-digits on change, `inputMode="numeric"`, help + placeholder + error message mới
- [ ] Payload `add-student`: `{name, phone, email, parentName, classId?}` — bỏ `total/price/mode`; `enroll-student` type KHÔNG đổi
- [ ] Fixture reducer + test theo payload mới; contract tests (`add-student-enroll`, `kernel-runtime`, `students-peel`) vẫn pass
- [ ] Fixtures `KernelStudentRow` trong web tests thêm `email` (khôi phục check-types)

## Architecture (data flow)

```
Modal (mode create)  →  run({type:"add-student", payload:{name, phone, email, parentName, classId?}})
  → data-actions.ts (type)  → repos/kernel.ts kernelCommand → POST /api/students {name, phone, email, parentName, classId?}
  → server phase 1: 400 nếu phone/email vi phạm; 201 → bus refetch snapshot → store cập nhật
Modal (mode existing) → run({type:"enroll-student", ...payload:{total, price, mode}}) — KHÔNG đổi
```

## Related Code Files

- Modify: `apps/web/src/components/modals/add-student-modal.tsx`
- Modify: `apps/web/src/lib/data-actions.ts` — type `add-student` payload
- Modify: `apps/web/src/lib/repos/kernel.ts` — body `add-student`
- Modify: `apps/web/src/lib/data-store-reducer.ts` — case `add-student` (payload mới)
- Modify: `apps/web/src/lib/data-store-reducer.test.ts` — 4 test add-student
- Modify (chỉ thêm `email: ""` cho fixtures): `apps/web/src/lib/repos/students.test.ts` (3 block fixture `:12-29,131-148,264-281`), `apps/web/src/lib/repos/classes.test.ts:12-29`, `apps/web/src/lib/repos/lessons.test.ts:12-32`, `apps/web/src/lib/repos/kernel.test.ts:33-55`

## Implementation Steps

1. `add-student-modal.tsx` — thay `PHONE_RE` (`:11`) bằng `const PHONE_DIGITS_RE = /^[0-9]+$/;` và thêm `const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;` (module scope).
2. Thêm state: `const [email, setEmail] = useState("");` + `const [emailError, setEmailError] = useState<string | undefined>();` (cạnh `phone`, `:48-49`).
3. `resetFields()` (`:83-94`) thêm `setEmail("");` + `setEmailError(undefined);` — GIỮ reset `total/price/modeOnlineOffline` (enroll dùng).
4. `submit()` (`:114-179`) tái cấu trúc:
   - DỜI block `parsedTotal/parsedPrice` + `setTotalError/setPriceError` + 2 early-return (`:121-136`) vào ĐẦU branch `effectiveMode === "existing"` (trước check `selectedStudentId`).
   - Branch create — validation mới:

     ```tsx
     const trimmedName = name.trim();
     const trimmedEmail = email.trim();
     const hasNameError = !trimmedName;
     const hasPhoneError = !PHONE_DIGITS_RE.test(phone);
     const hasEmailError =
     	trimmedEmail === ""
    		? true // required
    		: !EMAIL_RE.test(trimmedEmail);
     setNameError(hasNameError ? "Vui lòng nhập tên học viên." : undefined);
     setPhoneError(hasPhoneError ? "SĐT chỉ gồm chữ số, VD: 0901234567." : undefined);
     setEmailError(
     	hasEmailError
    		? trimmedEmail === ""
    			? "Vui lòng nhập email."
    			: "Email không hợp lệ."
    		: undefined,
     );
     if (hasNameError || hasPhoneError || hasEmailError) return;
     ```

   - Payload create (`:163-174`) thành `{ name: trimmedName, phone, email: trimmedEmail, parentName, classId }`.
   - Cập nhật comment issue #115 tại `:117-120`: package validation giờ là của riêng mode enroll.
5. Un-share JSX: đổi `const packageFields = (...)` (`:188-223`) thành `const enrollPackageFields = (...)` (nội dung không đổi); mode existing render `{enrollPackageFields}` (`:295`); mode create XÓA dòng `{packageFields}` (`:325`) và KHÔNG thay bằng gì.
6. Field SĐT (`:306-317`): label `"SĐT *"`; `onChange` strip ngay — `setPhone(e.target.value.replace(/\D/g, ""))` (giữ clear `phoneError`); `inputMode="numeric"`; `placeholder="0901234567"`; `help="Chỉ nhập chữ số, VD: 0901234567"` (bỏ mention khoảng trắng/dấu +).
7. Thêm Field Email ngay sau SĐT:

   ```tsx
   <Field
   	label="Email *"
   	error={emailError}
   	help="Dùng làm tài khoản đăng nhập cho học viên sau này"
   >
   	<Input
   		type="email"
   		value={email}
   		onChange={(e) => {
   			setEmail(e.target.value);
   			if (emailError) setEmailError(undefined);
   		}}
   		placeholder="hocvien@example.com"
   	/>
   </Field>
   ```

   (Form đã `noValidate` tại `:233` — browser validation không can thiệp.)
8. `apps/web/src/lib/data-actions.ts:72-84` — payload `add-student` thành `{ name: string; phone: string; email: string; parentName: string; classId?: string; }` + comment 1 dòng "SĐT + email = danh tính đăng nhập tương lai; gói học do server derive từ lớp (D1/D2)". Nhánh `enroll-student` (`:85-94`) KHÔNG đổi.
9. `apps/web/src/lib/repos/kernel.ts:41-57` — body `add-student`: `{ name, phone, email, parentName, ...(classId ? { classId } : {}) }` (bỏ total/price/mode). Pattern spread `classId` giữ nguyên để contract test `add-student-enroll.contract.test.ts:36-41` (`\bclassId\b`) vẫn pass.
10. `apps/web/src/lib/data-store-reducer.ts:87-122` — case `add-student`: destructure `{ name, phone, parentName, classId }`; Student literal: `zalo: phone` (phone giờ đã digits-only), `pkg` zero `{total: 0, done: 0, remaining: 0, price: 0, mode: "Online", start: "19/08", expiry: "—"}` + comment: fixture only — gói thật do server derive từ lớp (D1) hoặc không có (D2); email/hasPackage thêm ở phase 3 cùng type `Student`.
11. `apps/web/src/lib/data-store-reducer.test.ts:413-457` — 4 test: payload bỏ total/price/mode, thêm email tùy ý (fixture); assertion pkg đổi thành zero shape; assertion enrollment theo classId giữ nguyên.
12. Fixtures `KernelStudentRow` thêm `email: ""` (hoặc email thật cho fixture st-1 nếu test mapper phase 3 cần) tại 4 file listed ở Related Code Files — chỉ để `tsc --noEmit` xanh lại.

## Todo

- [ ] Strip SĐT non-digits + inputMode numeric + help/placeholder/error mới
- [ ] Field Email * (required + format check) + state/reset
- [ ] Un-share packageFields (enroll-only) + dời validation package vào branch existing
- [ ] Payload create mới qua data-actions.ts + repos/kernel.ts (enroll type giữ nguyên)
- [ ] Fixture reducer + 4 test + fixtures KernelStudentRow (email)

## Success Criteria (verify)

- `pnpm --filter web test` — exit 0 (đặc biệt `add-student-enroll.contract.test.ts`, `kernel-runtime.contract.test.ts`, `students-peel.contract.test.ts`, `data-store-reducer.test.ts`)
- `pnpm --filter web check-types` — exit 0 (xanh lại từ đỏ phase 1)
- `pnpm check` — exit 0 (biome format/lint)
- Manual (dev server): `/students` → "+ Thêm học viên" → form create KHÔNG có 3 input gói, có SĐT * + Email *; gõ "09ab 12+" → input chỉ còn "0912"; bỏ trống email → lỗi per-field, không POST; nhập đủ → lưu thành công, modal đóng. `/classes/$id` → modal vẫn hiện 2 mode; mode "Học viên có sẵn" vẫn đủ 3 package fields.

## Risk Assessment

- **Quên dời validation package vào branch existing** → enroll cho total 0 lọt qua client (chỉ còn server 400 banner chung) — bước 4-a là bước bắt buộc đầu tiên của tái cấu trúc submit.
- **Xoá state total/price/modeOnlineOffline** → enroll mode gãy — state GIỮ NGUYÊN, chỉ JSX/validation dời.
- Đổi label SĐT ("SĐT / Zalo" → "SĐT *") — không spec e2e nào getByLabel field này hôm nay (verify bằng grep `getByLabel("SĐT` — 0 kết quả); phase 4 dùng label mới.

## Security Considerations

- Email là PII: chỉ validate format, không gửi đi đâu ngoài `POST /api/students` của org mình; không thêm email vào global search index ở phase này.
- Server vẫn là guard cuối (zod phase 1) — client validate chỉ UX, không phải ranh giới bảo mật.

## Next Steps

- Phase 3: type `Student` thêm `email` + `hasPackage`, mapper, và các view hiển thị "Chưa có gói".
