---
title: "Fix #174: Gỡ nút Xóa tài khoản no-op — thay bằng hướng dẫn liên hệ admin"
description: "Nút danger Xóa tài khoản không confirm, không action. Xóa thật cần better-auth delete-user plugin + email verification (pilot chưa có email infra) + chính sách cascade dữ liệu workspace — không phải bugfix. Theo Expected option 2: gỡ nút, thay bằng copy liên hệ admin."
status: in-progress
priority: P1
effort: 2h
issue: 174
branch: fix/174-delete-account
tags: [frontend, bugfix, settings]
blockedBy: []
blocks: []
created: 2026-09-17
---

# Fix #174: Gỡ nút Xóa tài khoản no-op

## Overview

Nút danger "Xóa tài khoản" (settings.tsx DataTab) click không có tác dụng — nút destructive không được phép là no-op câm (#174). Hai route theo Expected:

1. Confirm dialog + API xóa thật — **loại**: better-auth 1.6.27 xóa user đi qua plugin delete-user + email verification (pilot chưa có email infra: forgot-password đang tắt — see in-app copy "Password reset isn't enabled"); xóa auth user mà không có chính sách cascade workspace (org/students/classes/invoices) để lại dữ liệu mồ côi. Đây là feature có thiết kế riêng.
2. **Gỡ nút** cho tới khi có flow thật — chọn: thay bằng dòng hướng dẫn "liên hệ admin" (pilot có admin onboard), trung thực và zero-risk.

Route 2 khớp nguyên tắc đã ship ở #167: không render control giả.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Không còn nút destructive no-op: bỏ nút Xóa tài khoản khỏi DataTab | P1 |
| 2 | Copy thay thế trung thực: hướng dẫn liên hệ admin trong giai đoạn pilot | P1 |
| 3 | Không đụng 2 nút Xuất (đã disabled ở #167), không đụng copy khác | P2 |

## Non-Goals

- Flow xóa tài khoản thật (plugin + email verification + cascade policy) — sẽ mở follow-up issue tracking.
- Không đổi pivot #179 (settings persist).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Bỏ nút + copy admin + update SSR tests](./phase-01-remove-delete-button.md) | Pending |

## Success Criteria

- [ ] SSR test: DataTab KHÔNG còn nút "Xóa tài khoản"; có copy "liên hệ admin"; 2 nút Xuất vẫn disabled
- [ ] vitest apps/web xanh; tsc sạch; biome exit 0 (repo-wide, chạy không qua pipe)
- [ ] CI PR xanh; merge beta; đóng issue kèm follow-up

## Verification Commands

```bash
cd apps/web && npx vitest run src/routes/_auth/settings.test.tsx && npx vitest run && npx tsc --noEmit
pnpm exec biome check . (exit 0, KHÔNG qua pipe)
```

## Red-Team Record (4 personas, 2026-09-17)

**Assumptions** — better-auth 1.6.27 (workspace catalog) — delete-user là plugin cần sendDeleteAccountVerification; email infra pilot chưa có (forgot-password copy in-app xác nhận). Kiểm chứng bằng in-app copy + roadmap, chưa đọc source plugin (node_modules blocked) → rủi ro thấp vì route không phụ thuộc chi tiết plugin; follow-up sẽ khảo sát lại. Không blocker.

**Failure** — (F1) user có nhu cầu xóa thật trong pilot → copy hướng dẫn liên hệ admin là đường thỏa mãn; admin xóa tay qua auth admin API khi cần. (F2) test cũ pin "Xóa tài khoản KHÔNG disabled" từ #167 → phải cập nhật theo hành vi mới (đã ghi vào phase). (F3) Regression: không e2e đụng nút (grep xác nhận). Không blocker.

**Scope** — 1 nút + 1 dòng copy + 1 test: không scope creep. Follow-up issue riêng cho flow thật.

**Security** — gỡ một destructive control là giảm attack/mis-click surface; không thêm endpoint. Không blocker.

**Verdict: GO** — 0 blocker.
