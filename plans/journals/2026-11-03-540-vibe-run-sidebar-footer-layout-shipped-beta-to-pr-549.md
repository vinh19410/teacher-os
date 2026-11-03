---
title: "#540 vibe run: sidebar footer layout — ship beta qua PR #549, merged"
date: 2026-11-03
summary: "Run tiếp quản WIP sẵn: fix 1 dòng flex + shrink-0, mọi gate xanh, flake e2e di động do memory pressure phải chẩn đoán bằng ma trận run"
---

# #540 vibe run: fix bố cục chân sidebar (nút Đăng xuất rơi xuống hàng riêng) — ship beta qua PR #549

**Date**: 2026-11-03
**Severity**: Low
**Component**: `packages/ui/src/components/app-shell/user-footer.tsx`
**Status**: Done (PR #549 squash `d149d4a` → `develop`, CI develop xanh, issue #540 closed)

## What Happened

Vibe run `--ship --beta --advice` cho issue #540. Run tiếp quản: worktree + plan validated + WIP (sửa `user-footer.tsx` + test mới) đã có từ run trước, chỉ còn verify → ship. Fix là 5 chỉnh sửa class Tailwind: wrapper footer `relative flex items-center gap-1` + `lg:flex-col` khi rail, control `min-w-0 flex-1` + `lg:w-full`, chevron `shrink-0`.

## The Brutal Truth

1. **Origin allowlist của boot:api đọc env lúc boot, không đọc lúc request.** Sign-up API trả 403 vô căn cứ vì vite chạy port 8101 trong khi API boot mặc định cho phép `E2E_WEB_PORT ?? 8001` = 8001. Phải restart API với `E2E_WEB_PORT=8101`. Lỗi 403 không nói gì về origin.
2. **Các port override e2e (8100–8105) KHÔNG free giữa các AI worktree song song.** Worktree #542 đang chạy e2e trên đúng bộ override chuẩn → e2e fail `readyz already used`. Fix: chọn bộ override khác (8110/8111/8113…) — cơ chế env cho phép, đừng chờ worktree kia.
3. **Flake e2e di động dưới memory pressure.** `sidebar-collapse.spec.ts` chạy 3 lần: fail di động giữa 4 test (mỗi test pass ≥1 lần với code không đổi), kèm page snapshot trống / `toHaveURL` timeout — đúng class lỗi dev-server instability mà AGENTS.md cảnh báo (rolldown-binding abort dưới memory pressure). Chẩn đoán đúng: chạy baseline trên `develop` thuần (pass), ghép ma trận run, hỏi kongming trước khi kết luận. **Không chạy lặp đến khi xanh rồi coi là bằng chứng** — ghi trung thực vào PR body.

## Verification

- check-types 8/8; ui test 184/184; web test 1780/1780 (re-run sau edit cuối); e2e `account-role-separation` 2 passed; `design:compare` 430 ảnh 0 lỗi; browser thật 3 viewport + keyboard focus ring; code-review subagent APPROVE 0C/0I/4 Minor; kongming 3 checkpoint (implement: Go; flake: Go; post-PR: merge-safe).
- CI: PR `quality` pass 7m13s; develop CI success trên merge commit.

## Gotchas cho run sau

- `gh pr edit --add-label` chết vì GraphQL Projects classic deprecated → dùng `gh api repos/:owner/:repo/issues/:n/labels -f 'labels[]=…'`.
- `gh pr merge` khi `develop` di chuyển → resolve conflict local (CHANGELOG gần như chắc chắn conflict khi 2 PR cùng thêm mục ngày) rồi push lại; merge sau đó tự thành công.
- Merge vào `develop` **không** auto-close issue dù PR body có `Closes #540` (GitHub chỉ auto-close khi merge vào default branch = `main`) → đóng thủ công kèm evidence.
- `ak plan update` cần id rõ ràng: `ak plan update teacher-os/261103-1342 --status completed --linked-pr 549`, rồi `ak plan close teacher-os/261103-1342`.
