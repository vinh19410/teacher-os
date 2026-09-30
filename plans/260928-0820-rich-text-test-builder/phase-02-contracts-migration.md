---
phase: 2
title: "Contracts migration"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Contracts migration

## Goal

Các field nội dung trong `packages/api/src/contracts.ts` đổi sang `richTextField` (HTML string, cap theo plain text). `cuePoints` **giữ nguyên** (interview Q2 — không đụng). Server route (`kernel.ts`) parse qua schema nên **thừa hưởng validation tự động** — không sửa route. Web vẫn đang gửi plain text (chưa swap UI) nên toàn hệ thống phải vẫn xanh sau phase này: plain text là hợp lệ HTML (không thẻ → pass raw cap + plain cap trọn vẹn).

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts` (import `richTextField`/`isEmptyRichText` từ `./rich-text`)
- Create: `apps/server/src/assignment-rich-text-contract.test.ts` — `packages/api` KHÔNG có script `test` (đã xác nhận package.json) nên test contract phải sống ở `apps/server` (vitest) nơi contracts được import thật
- Modify: test regression server hiện có (nếu cần case mới)

## Requirements

- [ ] Swap **6 field tổng**: 5 trong `assignmentPromptBaseSchema` (L449-505): `prompt` richTextField(5000) (L457), `passage` richTextField(20000) (L458), `intro` richTextField(2000) (L459), `transcript` richTextField(10000) (L460), `note` richTextField(2000) (L502); field thứ 6 là `description` ở `assignmentTestCreateSchema` (mục dưới). **`cuePoints` giữ nguyên dòng hiện tại `z.string().max(2000)` (L462 — interview Q2, không swap; lưu ý dòng hiện tại không có `.trim()`).**
- [ ] `assignmentTestCreateSchema` (L734-748): `description` `richTextField(2000).optional()` (L737). Verify **cả 2 update schema** vẫn ép plain cap sau khi field là refine — **viết test chứng minh**: `assignmentTestUpdateSchema` (L752-755, `.partial()`) và `assignmentPromptUpdateSchema` (L701-709, `.omit().partial()` trên 6 field rich; route PATCH `apps/server/src/routes/assignments/index.ts:136`) (zod v4 `.partial()` trên field có `.refine()`).
- [ ] superRefine gate `ready` đổi `.trim()` → `isEmptyRichText` ở **3 gate** (line refs đã re-verify): gate `prompt required` writing (L524-529), gate `passage required` reading (L530-536), gate speaking **L616** (`value.part !== "part2" && !value.prompt.trim()`). Bắt được `<p></p>`/`<p><br></p>` là rỗng. Queues khác trong superRefine (questions stem, audioName, imageUrl) giữ nguyên vì vẫn là plain text.
- [ ] Giữ `.strict()` mọi object — richTextField chỉ thay phần tử, không đụng shape.
- [ ] Hành vi note: `intro`/`transcript`/`note` hiện KHÔNG có `.trim()` (L459-460, L502) — richTextField có `.trim()` đầu chuỗi HTML: chấp nhận được (whitespace quanh thẻ vô nghĩa), ghi comment tại chỗ đổi.

## Implementation Steps

1. Import `richTextField`, `isEmptyRichText` từ `./rich-text`; swap 5 field base schema + `description` theo bảng trên (cuePoints không đụng); comment tiếng Anh ngắn giải thích "HTML string; cap measured on plain text".
2. Đổi 3 gate superRefine sang `isEmptyRichText` (không `.trim()` trên HTML).
3. Test contract mới (node env, không cần DOM vì regex fallback): (a) plain 6000 ký tự bọc 1 cặp `<p>` → fail; 5000 → pass; (b) raw HTML > rawMax → fail raw cap với message riêng; (c) `<p><br></p>` + status ready writing → 400-style issue "prompt required"; (c2) speaking part1 `<p></p>` + status ready → 400-style issue "prompt required" (gate L616); (d) `<p>ok</p>` pass; (e) `.partial()` của CẢ 2 update schema vẫn chặn: description dài fail + passage HTML vượt plain cap phải fail — nếu zod v4 rơi refine thì khai báo cap thủ công trong update schema cho 6 field; (e2) boundary: passage legacy 19.990 ký tự chia 40 đoạn → qua editor round-trip (thêm thẻ `<p>`/`<br>`) → vẫn parse pass (cap đo trên collapsed whitespace); (f) draft rỗng `""` vẫn pass mọi field.
4. Chạy regression server: các test prompt hiện hữu dùng payload plain (`kernel.test.ts:4430,4459,4511,4755` — payload `passage: "   "` L4527 vẫn phải 400 qua gate mới).

## Todo

- [ ] Swap 6 field + 3 gate superRefine (cuePoints giữ nguyên)
- [ ] Test contract richTextField (8 case trên)
- [ ] Regression `pnpm -F server test` xanh
- [ ] `pnpm -F web test` xanh (web chưa gửi HTML vẫn parse pass)

## Success Criteria

Schema mới: plain text cũ parse pass y hệt (tương thích ngược client-chưa-đổi); HTML hợp lệ parse pass; `<p></p>` không qua được 3 gate `ready` trên POST create; `cuePoints` hành vi không đổi; `.strict()` không đổi.

## Verification

```bash
pnpm check-types
pnpm -F server test && pnpm -F web test
```

## Risk notes

- **`.partial()` + refine (zod v4)** — nếu refine bị mất sau `.partial()`, fix cục bộ: định nghĩa cap thủ công trong update schema (cả `assignmentTestUpdateSchema` lẫn `assignmentPromptUpdateSchema` cho 6 field rich); phải được test case (e) bắt trước khi ship.
- **PATCH `/prompts/:id` không có ready-gate** — update superRefine hiện không kiểm prompt/passage required khi status ready (hôm nay `"  "` cũng pass): gap có sẵn từ trước, ngoài scope plan này; success criterion "gate ready → 400" chỉ áp POST create. Ghi nhận trong Validation Log plan.md.
- **Client gửi HTML chưa có sanitizer server** — đúng thiết kế (decision 3 plan.md); raw cap là giới hạn vận hành, không phải security.
- **e2e/uni test mock payload cũ** dùng plain text — không phải sửa; chỉ payload HTML mới cần phase 3+.
