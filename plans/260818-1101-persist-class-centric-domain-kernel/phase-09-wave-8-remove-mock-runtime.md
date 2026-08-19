---
phase: 9
title: "Wave 8 Remove mock runtime"
status: completed
priority: P2
effort: "1d"
dependencies: [5, 6, 7, 8]
---

# Phase 9: Wave 8 Remove mock runtime

## Overview

Xóa reducer runtime và đưa `seedData` ra khỏi app source runtime. Tắt banner demo khi mọi write path đã D1. Test chuyển sang contract API. Không thêm feature.

## Context Links

- Banner: `apps/web/src/components/layout/topbar.tsx:66` "Dữ liệu demo — thay đổi không được lưu"
- Provider: `apps/web/src/lib/data-store.tsx` / `data-provider.tsx`
- Reducer: `apps/web/src/lib/data-store-reducer.ts`
- Seed: `apps/web/src/lib/mock-data.ts` `seedData`
- Settings: local — giữ, không persist (không phải lỗ)

## Requirements

- Functional: runtime app không `useReducer(reducer`, không import reducer, và mọi `dispatch` đều đi qua kernel command bus.
- Non-functional: giữ types + helpers (`fmtVND`, `dayDates`, `averageBand`) trong module runtime; fixture `seedData` chỉ nằm ở test fixture ngoài `apps/web/src`.

## Architecture

`useData()` còn là facade đọc snapshot kernel. `DataProvider` dùng `useState<MockData>(emptyKernelData)` và `applySnapshot = setData(mapKernelSnapshot(snapshot))`; giữ nguyên đường `dispatch → kernel command bus → POST → fetchSnapshot → applySnapshot`, không còn local reducer fallback. `DataStore.dispatch` chỉ nhận `KernelAction` (14 persisted writes); hydration là setter nội bộ, không còn `kernel-loaded` public action. `Action`/`KernelAction` sống trong module runtime-neutral, vì `data-store.tsx` và `repos/kernel.ts` vẫn cần contract này. Banner demo ẩn. Reducer fixture, nếu giữ cho historical unit tests, chỉ import action types và không được import ở runtime.

Initial GET fail giữ state rỗng, toast lỗi hiện có và không mount seed/fallback. Không thêm UI/stub behavior mới.

Grep gate:

```
rg -n "seedData|useReducer\\(reducer" apps/web/src \
  --glob '!**/*.test.*' --glob '!**/*.spec.*'
```

Lệnh trên phải 0 hit. Fixture sống ngoài `apps/web/src`; runtime types/helpers không chứa `seedData`.

## Related Code Files

- Create: module action contract runtime-neutral và `emptyKernelData`
- Move: `seedData` sang test fixture ngoài `apps/web/src`; reducer fixture import fixture/action contract
- Modify: `data-provider.tsx`, `data-store.tsx`, `repos/kernel.ts` để snapshot setter + command bus không phụ thuộc reducer
- Modify: `topbar.tsx` banner
- Modify: tests — thay hydration reducer bằng runtime/command-bus contract
- Do not add: feature mới, org UI, stub fills

## Implementation Steps

1. Xác nhận toàn bộ 14 `KERNEL_WRITE_TYPES` đã persist; mọi caller dispatch là kernel action.
2. Tách `Action`/`KernelAction` và `emptyKernelData` khỏi reducer; `data-store.tsx` re-export contract không đổi.
3. Thay `useReducer` bằng state snapshot; `applySnapshot` set đủ 9 collection, `dispatch` public chỉ nhận 14 kernel write và unknown/hydration action bị type-level chặn.
4. Di chuyển `seedData` sang test fixture ngoài `apps/web/src`; reducer fixture còn lại không có runtime importer.
5. Tắt banner topbar.
6. Test runtime: initial hydration, GET fail giữ empty+error (không seed), và 14 action map POST/refetch không nhánh local. Giữ reducer test chỉ là fixture-unit, không tính Wave 8 runtime coverage.
7. Grep gate + isolation + quality.

## Todo

- [x] Runtime không import reducer hoặc seed fixture
- [x] 0 `seedData`/`useReducer(reducer` theo grep gate
- [x] Banner tắt
- [x] Test snapshot, error và 14 write API contract
- [x] Grep gate

## Success Criteria

- [x] Grep `seedData` / `useReducer(reducer` = 0 trên `apps/web/src` ngoài test/spec
- [x] Banner demo không hiện
- [x] 13 màn giữ `dispatch → POST → refetch`; unknown action không thể local-write
- [x] API fail = empty + error, không fallback seed; stub vẫn stub
- [x] Org isolation test còn
- [x] Quality gate xanh

## Risk Assessment

Xóa reducer runtime phá contract nếu `Action`/empty state còn sống trong reducer. Signal: typecheck fail hoặc POST xong UI stale. Response: tách action contract + empty state trước; test post-write refresh đủ collection.

Fixture còn dưới `apps/web/src` làm grep gate luôn đỏ. Signal: `rg` còn hit `mock-data.ts`. Response: move fixture ngoài source runtime, giữ types/helpers riêng.

Settings local trống sau reload — không persist, đúng non-goal.

## Security Considerations

Không để fallback seed khi API fail (sẽ trộn org demo vào user thật). Fail empty + error UI.
