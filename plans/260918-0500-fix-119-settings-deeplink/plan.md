---
title: "Fix #119: Settings tabs deep-link qua ?tab= + aria-selected"
description: "Settings tabs controlled bởi useState nội bộ — URL không đổi, reload/quay lại mất tab, highlight có thể lệch state. Fix: validateSearch ?tab= (enum whitelist) + controlled tab từ URL + navigate replace; Tabs component thêm role tablist/tab + aria-selected (đóng góp #118)."
status: completed
priority: P2
effort: 2h
issue: 119
branch: fix/119-settings-tab-deeplink
tags: [frontend, bugfix, settings, a11y]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Fix #119: Settings tabs deep-link

## Overview

Tabs settings (Tài khoản/Mẫu tin Zalo/Quy tắc/Dữ liệu) controlled bởi `useState` nội bộ trong `SettingsPage` — URL không phản ánh tab, reload mất vị trí, và lớp state nội bộ là nơi duy nhất giữ "tab đang mở" (nguồn của quan sát highlight lệch trong QC). Route đã có pattern `validateSearch` passthrough (login, profile, schedule) — áp dụng cùng pattern: `?tab=<id>` whitelist enum, `navigate(replace)` khi đổi tab, `SettingsPage` nhận tab controlled. Bonus trong phạm vi: `role="tablist"/"tab"` + `aria-selected` cho `Tabs` (đúng semantics highlight, góp phần #118).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `/settings?tab=templates` mở đúng tab; reload/quay lại giữ tab; đổi tab cập nhật URL (replace — không spam history) | P1 |
| 2 | `?tab=` lạ/_CHARSET không throw không redirect — rơi về account (passthrough pattern) | P1 |
| 3 | Tabs render role tablist/tab + aria-selected đúng | P2 |

## Non-Goals

- Deep-link cho tabs ở route khác (auth login tabs đã có storage riêng; chỉ settings bị QC).
- Full a11y audit (#118 riêng).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [validateSearch + controlled tab + Tabs a11y + tests](./phase-01-deeplink.md) | Done |

## Success Criteria

- [x] Unit: validateSettingsSearch (tab hợp lệ / lạ / thiếu) — 3 case
- [x] Unit: SettingsPage với tab="templates"/"data" render đúng nội dung tab đó (controlled, không useState nội bộ)
- [x] Unit: Tabs aria-selected đúng + role tablist
- [x] vitest apps/web xanh; tsc sạch; biome repo-wide exit 0; CI PR xanh → merge beta → đóng issue

## Verification Commands

```bash
cd apps/web && npx vitest run src/routes/_auth/settings.test.tsx src/components/ui/tabs.test.tsx && npx vitest run && npx tsc --noEmit
pnpm exec biome check . (exit 0, KHÔNG qua pipe)
```

## Red-Team Record (4 personas, 2026-09-18)

**Assumptions** — "highlight kẹt" do state nội bộ: controlled-from-URL loại trừ cả lớp bug này; QC ghi chú không đoán root cause — fix của tôi không cần biết cause cũ vì URL trở thành single source of truth. Không blocker.

**Failure** — (F1) `?tab=` lạ: passthrough → account (không throw, theo pattern login/schedule). (F2) navigate replace: không làm đầy history khi bấm tab liên tục; back từ settings vẫn ra trang trước đó — hành vi chuẩn. (F3) Tests cũ SettingsPage không truyền tab → default giữ hành vi. Không blocker.

**Scope** — chỉ settings + Tabs a11y attributes; không đụng auth tabs (đã có storage), không full a11y (#118). Không scope creep.

**Security** — validateSearch whitelist, không reflect chuỗi lạ vào DOM/URL state; replace không mở redirect. Không blocker.

**Verdict: GO** — 0 blocker.
