---
title: "Nâng Alchemy lên beta.85 và tách state store của teacher-os"
description: "Gỡ lỗi deploy do state store dùng chung đã lên v8, rồi tách store riêng để project khác không ảnh hưởng tới teacher-os."
status: in-progress
priority: P1
effort: 1d
issue: 634
branch: vinh19410/alchemy-85-upgrade
tags: [infra, bugfix]
blockedBy: []
blocks: []
created: 2026-11-05
---

# Nâng Alchemy lên beta.85 và tách state store của teacher-os

## Overview

Deploy staging của PR #629 fail vì `alchemy-state-store` dùng chung trong tài khoản Cloudflare đã ở v8, còn teacher-os dùng `beta.72` (v7). `beta.84` vẫn là v7, nên bản tối thiểu là `beta.85`. Người dùng đã đồng ý nâng cấp và tách store riêng.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Nâng lên beta.85, vẫn dùng store hiện tại](./phase-01-upgrade-to-beta-85.md) | In progress |
| 2 | [Tách state store riêng](./phase-02-separate-state-store.md) | Pending |

Phase 2 chỉ bắt đầu sau khi phase 1 deploy staging thành công.

## Non-goals

- Không deploy production trong plan này. Promote lên `main` là quyết định riêng.
- Không sửa `lexi-quest`, `vox-flow`, hay store dùng chung.

## Success Criteria

- [ ] Dry-run staging không thay thế hay xóa D1, R2 và custom domain; `database: update` ở lần đầu là bình thường.
- [ ] `Deploy Staging` xanh gồm cả smoke; D1 giữ nguyên dữ liệu và không chạy lại migration.
- [ ] Sau phase 2, dry-run trên store riêng không tạo mới resource nào.

## Risks

- **Rebuild bảng migration một chiều.** Lần deploy đầu thêm cột `hash` vào `d1_migrations`, nên `beta.72` không ghi được vào bảng này nữa. Ghi lại giờ UTC trước deploy để dùng D1 Time Travel nếu cần.
- **Module registry.** `beta.85` thêm `new_module_registry` cho Worker. Smoke staging và QA cần phủ các đường chính.
- **Store mới trống.** Đổi store khi chưa chuyển state sẽ khiến Alchemy coi resource đang chạy như chưa tồn tại.
- **Project khác trên `beta.84`.** Deploy của chúng với `--yes` có thể đưa store dùng chung về v7, làm teacher-os fail lần nữa cho tới khi xong phase 2.

## Rollback

Sau khi đã deploy `beta.85`: revert code nhưng giữ Alchemy từ `beta.85` trở lên. Không chạy deploy `beta.72` trên store v8.

<!-- slug: alchemy-85-state-store -->
