---
title: "Phase 1: Global search có phản hồi hiển thị + điều hướng"
status: todo
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Global search có phản hồi hiển thị + điều hướng

## Overview

Thay thế `submitSearch` silent no-op bằng một dropdown search thật: kết quả
hiển thị ngay khi gõ (client-side trên kernel snapshot đã load), Enter chọn
match đầu tiên, click chọn match bất kỳ, không match → trạng thái
"Không tìm thấy kết quả". Tách logic match ra module thuần để test unit.

## Requirements

- Functional:
  - Gõ ≥1 ký tự → dropdown (`data-testid="global-search-results"`) hiện kết
    quả, **cap riêng theo loại: tối đa 5 học viên + 3 lớp** (tránh 8 slot bị
    học viên lấp đầy làm lớp không bao giờ xuất hiện); mỗi item có
    `data-testid="global-search-result-item"`.
  - Học viên match theo name/phone/zalo/parent.name → `/students/$studentId`;
    lớp match theo name → `/classes/$classId`.
  - Không match → dòng "Không tìm thấy kết quả" (`data-testid="global-search-empty"`).
  - Enter → điều hướng match đầu tiên; **guard `e.nativeEvent.isComposing`** —
    Enter xác nhận composition IME (Telex/VNI) không được điều hướng;
    Escape/click ngoài → đóng; điều hướng xong → clear query + đóng dropdown.
  - Match bỏ qua hoa/thường và dấu tiếng Việt: `normalizeVi` (NFD, strip
    `\u0300-\u036f` covers cả horn ơ/ư, đ→d, Đ→D, lowercase) áp dụng cho
    **cả query lẫn mọi field** trước khi so khớp.
  - Placeholder đổi thành "Tìm học viên, lớp học…".
  - A11y cơ bản: nút/input có `aria-expanded`, dropdown `role="listbox"`,
    item `role="option"`.
- Non-functional: không fetch mới — dữ liệu từ `useData()` hiện có; dropdown
  đặt **bên trong** wrapper `.topbar-search` và wrapper phải thêm class
  `relative` (hiện không có — nếu thiếu, dropdown `absolute` neo vào `header`
  positioned ancestor và lệch vị trí; dropdown nằm trong wrap ref thì
  outside-click `mousedown` handler (`topbar.tsx:23-30`) không tự đóng khi
  click vào item). UI theo pattern `NotifPanel`.

## Related Code Files

- Create: `apps/web/src/lib/global-search.ts` (thuần, không import provider)
- Create: `apps/web/src/lib/global-search.test.ts` (vitest, TDD trước)
- Create: `apps/e2e/specs/global-search.spec.ts` (Playwright)
- Modify: `apps/web/src/components/layout/topbar.tsx`

## Implementation Steps (TDD)

1. **RED (unit):** viết `global-search.test.ts` trước — case:
   - Match tên HV ASCII và có dấu; query không dấu khớp tên có dấu
     ("nguyen" → "Nguyễn") và case horn ("truong" → "Trương", "duong" →
     "Dương"); query CÓ dấu khớp data không dấu (chiều ngược, do normalize
     cả hai phía).
   - Match SĐT, tên phụ huynh; match tên lớp.
   - Không match → mảng rỗng; query rỗng/whitespace → mảng rỗng.
   - **Cap theo loại:** 9 students + 1 class khớp cùng query → trả đúng
     5 students + 1 class (không mất class).
   - Mỗi result có `{type, id, label, sublabel}` đủ để render.
2. **GREEN (unit):** implement `global-search.ts`:
   - `normalizeVi(s)` như requirement.
   - `searchGlobal(data, query, limitStudents=5, limitClasses=3)`: lọc
     students (name/phone/zalo/parent.name) slice theo cap riêng, classes
     (name) slice riêng, students trước classes.
3. **RED (e2e):** `apps/e2e/specs/global-search.spec.ts` theo pattern
   `class-operations.spec.ts` (`signUpViaUi` → org mới sạch — assert điều
   này qua việc search ban đầu không có kết quả lạ):
   - Case 1: tạo lớp "E2E Tìm Lớp" → thêm học viên "Nguyễn Minh E2E" → gõ
     "minh" → assert item `global-search-result-item` **chứa text "Nguyễn
     Minh E2E"** (không chỉ container) → Enter → `toHaveURL(/\/students/)`
     + trang hiển thị tên học viên (bằng chứng loại trừ giả thuyết
     "navigate lỗi").
   - Case 2: gõ "zzz-khong-co" → thấy `global-search-empty`.
   - Case 3: gõ "Tìm Lớp" → click item lớp → `toHaveURL(/\/classes/)` +
     thấy tên lớp.
   - Case 4: gõ query có match → Escape → `global-search-results` hidden
     (khoá requirement đóng dropdown).
4. **GREEN (UI):** sửa `topbar.tsx` — state `open`; thêm `relative` vào
   wrapper `.topbar-search`; render dropdown trong wrapper khi
   `query.trim()` + focus; dùng `searchGlobal` + `useMemo`; keydown Enter
   (guard isComposing) / Escape; outside-click theo pattern `bellWrapRef`;
   navigate rồi `setQuery("")` + đóng; placeholder mới; aria roles.
5. Chạy: `pnpm --filter web test` (unit) và
   `pnpm --filter e2e exec playwright test specs/global-search.spec.ts`.
6. Chạy whole-repo quality gate, **2 lệnh riêng**: `pnpm --filter e2e e2e`
   (toàn bộ e2e, không regression) + `pnpm check` (biome autofix — review
   diff sau khi chạy) + typecheck + build theo pipeline CI hiện có.

## Todo

- [x] Unit test `global-search.test.ts` (RED trước, đủ case normalize dấu + cap)
- [x] Module `global-search.ts` thuần (normalize cả 2 phía, cap 5+3)
- [x] E2E spec `global-search.spec.ts` (4 case: match→navigate, no-match→empty, click-class, escape-close)
- [x] UI dropdown trong `topbar.tsx` (relative wrapper, isComposing guard, placeholder, aria)
- [x] Quality gates xanh (biome + typecheck + unit + toàn bộ e2e + build)

## Success Criteria

- [x] Mọi acceptance criteria trong plan.md thỏa mãn, không còn silent no-op.
- [x] E2E chứng minh cả 2 đường: match → điều hướng đúng; no-match → feedback.

## Risk Assessment

- **Assumption: kernel snapshot chứa students/classes khi topbar render** —
  DataProvider chỉ mount children khi snapshot hợp lệ (load gate). Nếu snapshot
  rỗng hợp lệ → dropdown hiện "Không tìm thấy" — vẫn là feedback hiển thị, thỏa
  mục tiêu P1; e2e case 2 khoá hành vi này.
- **Assumption: org sau `signUpViaUi` là sạch** — e2e case 1 assert item chứa
  đúng tên học viên vừa tạo; nếu bootstrap seed dữ liệu mẫu làm first match
  khác, test fail lộ ra → khi đó chỉnh selector theo tên chính xác, không
  nới lỏng assert.
- **E2E flake do async**: kết quả tính từ state đồng bộ, không gọi API; dùng
  expect timeout 15s sẵn có của playwright config; workers=1.
- **IME composition**: guard isComposing được requirement tường minh; nếu sau
  ship vẫn có report navigate sớm → kiểm tra browser target (isComposing
  không fire trên một số browser cũ — chấp nhận, ghi note).
- **Tiếng Việt normalize**: NFD + strip combining (covers horn U+031B) + đ→d;
  unit test khoá cả 2 chiều query↔data.
