---
phase: 9
title: "Wave 8 Remove mock runtime"
status: pending
priority: P2
effort: "1d"
dependencies: [5, 6, 7, 8]
---

# Phase 9: Wave 8 Remove mock runtime

## Overview

Xóa reducer runtime + `seedData` trên app path. Tắt banner demo khi mọi write path đã D1. Test chuyển sang contract API. Không thêm feature.

## Context Links

- Banner: `apps/web/src/components/layout/topbar.tsx:66` "Dữ liệu demo — thay đổi không được lưu"
- Provider: `apps/web/src/lib/data-store.tsx` / `data-provider.tsx`
- Reducer: `apps/web/src/lib/data-store-reducer.ts`
- Seed: `apps/web/src/lib/mock-data.ts` `seedData`
- Settings: local — giữ, không persist (không phải lỗ)

## Requirements

- Functional: app path không `useReducer(reducer` / không import `seedData` runtime.
- Non-functional: giữ types + helpers (`fmtVND`, `averageBand`) trong `mock-data.ts` hoặc rename types file. Fixture test được giữ.

## Architecture

`useData()` còn là facade đọc repos. Xóa nhánh reducer. Banner demo ẩn. Characterization reducer: giữ file test như historical fixture **hoặc** chuyển sang API contract — advise: "thay characterization mock bằng contract API nơi mock chết".

Grep gate:

```
seedData
useReducer(reducer
```

0 hit trên app path (`apps/web/src` trừ `*.test.ts` và types).

## Related Code Files

- Delete/retire runtime: reducer path trong provider
- Modify: `topbar.tsx` banner
- Modify: tests — contract API thay reducer nơi action chết
- Do not add: feature mới, org UI, stub fills

## Implementation Steps

1. Xác nhận wave 4–7 không còn write mock.
2. Gỡ seed init. Provider chỉ fetch.
3. Tắt banner.
4. Thay test characterization bằng API contract cho write đã peel.
5. Grep gate + isolation + quality.

## Todo

- [ ] Xóa reducer runtime
- [ ] 0 seedData trên app path
- [ ] Banner tắt
- [ ] Test API contract
- [ ] Grep gate

## Success Criteria

- [ ] Grep `seedData` / `useReducer(reducer` = 0 trên app path (fixture test được giữ)
- [ ] Banner demo không hiện
- [ ] 13 màn persist theo scope; stub vẫn stub
- [ ] Org isolation test còn
- [ ] Quality gate xanh

## Risk Assessment

Xóa seed phá characterization nếu test vẫn import reducer như app. Signal: `pnpm test` đỏ hàng loạt. Response: giữ reducer file chỉ cho test fixture, không mount runtime — hoặc rewrite test trước khi xóa.

Settings local trống sau reload — không persist, đúng non-goal.

## Security Considerations

Không để fallback seed khi API fail (sẽ trộn org demo vào user thật). Fail empty + error UI.
