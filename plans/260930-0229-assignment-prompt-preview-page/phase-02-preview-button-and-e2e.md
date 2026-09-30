---
title: "Phase 2: Nút Xem trước trên /assignments + e2e"
status: done
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Nút "Xem trước" trên `/assignments` + e2e

## Goal

Aside preview tại `/assignments` (hiển thị cho đề đang chọn) có nút **"Xem trước"**
dẫn đến `/assignments/preview?id=<promptId>`; e2e phủ toàn bộ hành trình chọn đề →
xem trước → quay lại danh sách.

## Context Links

- Aside: `apps/web/src/components/assignments/prompt-preview-aside.tsx` (cuối aside là hint box "Đề này chưa giao lớp…")
- Trang list: `apps/web/src/routes/_auth/assignments/index.tsx:304-308` — aside render khi có `activePrompt` (mặc định = dòng đầu lọc được; bấm dòng để chọn)
- Unit test aside: `apps/web/src/components/assignments/prompt-preview-aside.test.tsx` (mock `Link` → `<a href={to}>`)
- e2e: `apps/e2e/specs/assignment-bank.spec.ts` (seed 2 đề qua UI → chọn dòng → assert aside)
- Helpers e2e: `apps/e2e/specs/helpers.ts` (`signUpViaUi`, `fillRichEditor`)

## Key Insights

- Aside chỉ render khi có đề được chọn → đặt nút trong aside thỏa mãn "khi tôi
  chọn bài thì có nút Xem trước" một cách tự nhiên, không phải sửa cấu trúc row
  listbox (row hiện là `<button>` — lồng button trong button invalid HTML).
- `Button` của repo KHÔNG hỗ trợ `asChild` (render `<button>`, xem
  `apps/web/src/components/ui/button.tsx`) → dùng pattern chuẩn của chính trang
  `/assignments`: `Button variant="secondary" onClick={() => navigate({ to:
  "/assignments/preview", search: { id: prompt.id } })}` (giống nút "+ Tạo bài
  tập" ở `index.tsx:137-139`). Tradeoff: mất anchor thật (middle-click/copy
  link) — chấp nhận vì nhất quán với mọi CTA cùng trang; URL vẫn chuẩn
  `/assignments/preview?id=…` do TanStack serialize search.
- Nhãn nút đúng nguyên văn **"Xem trước"** theo yêu cầu; variant `secondary`,
  full-width (`w-full`) đặt dưới hint box — visual hierarchy: aside là bản gọn,
  nút dẫn sang bản đầy đủ.

## Files to Create / Modify

- Modify: `apps/web/src/components/assignments/prompt-preview-aside.tsx` — thêm nút "Xem trước" (Button + `useNavigate` với `search: { id }`)
- Modify: `apps/web/src/components/assignments/prompt-preview-aside.test.tsx` — thêm `useNavigate` vào router mock + assert nút
- Modify: `apps/e2e/specs/assignment-bank.spec.ts` — thêm đoạn e2e hành trình preview
- Không tạo file mới.

## Requirements

- [x] FR1: Aside có nút "Xem trước" — `Button variant="secondary" className="mt-3 w-full"`, `onClick` → `navigate({ to: "/assignments/preview", search: { id: prompt.id } })`.
- [x] FR2: Nút xuất hiện với mọi đề (draft + ready) — không điều kiện theo status.
- [x] FR3: e2e: chọn dòng đề → bấm "Xem trước" → URL match `/assignments\/preview\?id=/` → title đề hiện trong giấy bài (`<p>`, dùng `getByText`) → kicker "Xem trước phía học viên" hiện → bấm "Quay lại danh sách" → về `/assignments` thấy lại list.
- [x] FR4: Accessibility: nút là `<button>` focusable, accessible name đúng nguyên văn "Xem trước".

## Implementation Steps

1. `prompt-preview-aside.tsx`: import `Button` + `useNavigate` (bỏ import `Link`
   nếu không còn dùng — hint box cuối aside hiện vẫn dùng `Link to="/classes"`,
   giữ nguyên); gọi `const navigate = useNavigate();` đầu component; dưới hint
   box thêm:
   ```tsx
   <Button
   	variant="secondary"
   	className="mt-3 w-full"
   	onClick={() =>
   		navigate({ to: "/assignments/preview", search: { id: prompt.id } })
   	}
   >
   	Xem trước
   </Button>
   ```
2. `prompt-preview-aside.test.tsx`: router mock thêm `useNavigate: () => vi.fn()`;
   thêm case render aside với fixture → `html` chứa `>Xem trước</button>` (static
   markup không chạy onClick — đích đến do e2e assert URL).
3. `assignment-bank.spec.ts`: sau đoạn "Click the draft row → preview shows its title" (dòng 96-100 hiện tại), thêm:
   ```ts
   // Xem trước → trang riêng góc nhìn học viên (?id=).
   await page.getByRole("button", { name: "Xem trước" }).click();
   await expect(page).toHaveURL(/\/assignments\/preview\?id=/);
   // Title trong StudentPreviewPaper là <p class="font-display">, không phải heading.
   await expect(
   	page.getByText("QC-208 Bank Chart Draft").first(),
   ).toBeVisible();
   await expect(page.getByText("Xem trước phía học viên").first()).toBeVisible();
   await page.getByRole("button", { name: "Quay lại danh sách" }).click();
   await expect(page).toHaveURL(/\/assignments$/);
   await expect(
   	page.getByRole("heading", { name: "QC-208 Bank Discuss" }),
   ).toBeVisible();
   ```
   (Kicker "Xem trước phía học viên" nằm trong chính `StudentPreviewPaper`
   (`student-preview-paper.tsx:72-74`) — aside ở `/assignments` không còn mount
   sau khi rời trang nên không trùng lặp.)
4. Chạy e2e: `pnpm --filter e2e exec playwright test specs/assignment-bank.spec.ts`.

## Todo

- [x] Nút "Xem trước" trong aside (Button + navigate + search id)
- [x] Assert unit test aside
- [x] Đoạn e2e hành trình preview trong assignment-bank.spec.ts
- [x] Chạy full unit + e2e

## Verification

```bash
pnpm --filter web run test src/components/assignments/prompt-preview-aside.test.tsx src/routes/_auth/assignments/
pnpm --filter web run check-types
pnpm --filter e2e exec playwright test specs/assignment-bank.spec.ts
```

- [x] Unit aside: nút "Xem trước" render trong markup
- [x] e2e: hành trình chọn → xem trước → quay lại pass

## Risk Assessment

- **Risk**: aside test dùng `renderToStaticMarkup` nên không verify được navigation call. **Mitigation**: e2e là gate xác nhận URL; unit chỉ assert presence (đủ cho regression markup).
- **Risk**: strict-mode violation nếu "Xem trước phía học viên" xuất hiện 2 nơi trên trang preview. **Mitigation**: đã verify — chuỗi này chỉ có trong `StudentPreviewPaper`; aside không render ở trang preview. Dùng `.first()` phòng className trùng.
- **Risk**: hai phần tử trùng accessible name "Xem trước" (kicker là `<p>` thường, không phải name của nút) → không strict violation.

## Security Considerations

- Link nội bộ, id là UUID/ string id từ snapshot — không user input ghi vào DOM ngoài text đã sanitize sẵn; không surface mới.

## Next Steps

- Sau khi cả hai phase xong: chạy `pnpm --filter web run test` toàn cục + smoke thủ công trên dev (`pnpm dev:web`) với đề "The Influence of the Crime Writer Agatha Christie" thật.
