---
title: validate-safe-material-url-918
date: 2026-11-25
summary: "Add isSafeMaterialUrl render guard in MaterialOpenActions with TDD unit tests (#918)"
---

# validate-safe-material-url-918

# 2026-11-25 — Issue #918 (`MaterialOpenActions` `isSafeMaterialUrl` render guard)

- **Bối cảnh:** Trong lúc review #914, phát hiện `MaterialOpenActions` (`apps/web/src/components/materials/material-item.tsx:69-81`) chỉ kiểm tra `item.url ? <a href={item.url} ...>` mà chưa chặn scheme không an toàn bằng `isSafeMaterialUrl(item.url)` ở lớp render như `StudentMaterialRow`.
- **Thay đổi:** Import `isSafeMaterialUrl` từ `@teacher-os/api/material-contracts` và cập nhật nhánh `item.kind === "link"` thành `item.url && isSafeMaterialUrl(item.url) ? (<a ...>) : null`; bổ sung bộ unit test jsdom TDD 28 ca tại `apps/web/src/components/materials/material-item.test.tsx` (URL hợp lệ `http:`/`https:`, 14 payload scheme không an toàn/obfuscation, 7 URL tương đối/lỗi/rỗng/`null`, hồi quy `file`/`media`, tích hợp `MaterialItem`).
- **Quyết định & lưu ý vận hành:** Giữ nguyên `isSafeMaterialUrl`, `materialMeta` và server read projections ngoài phạm vi #918 (ghi nhận theo dõi riêng); giữ nguyên `package.json` (`0.0.25`) và `CHANGELOG.md` để bảo toàn bộ đếm `v0.0.25-beta.<N>` của `scripts/notify-discord-changelog.mjs`; tránh truyền `--` sau `pnpm --filter web test` vì pnpm v10 chuyển nguyên `--` cho Vitest.
- **Xác minh:** TDD Red `20 failed / 8 passed` -> TDD Green `28/28 passed`; `pnpm exec biome check .` (0 lỗi / 2.514 file); `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` (exit 0); `VITE_SERVER_URL=http://localhost:8000 pnpm build` (7/7 tasks); 6/6 suite materials (`80/80` test ở timeout 5000ms) + tổ hợp web tests trên máy tải cao (`213/214` + `$classId.test.tsx` `47/47` với `--maxWorkers=1 --testTimeout=15000`); local `code-reviewer` kết luận **Approve** (`0 Critical / 0 Important / 1 Minor` đã chốt).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
