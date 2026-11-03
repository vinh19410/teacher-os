---
title: "#539 vibe run: teacher signup UI flag shipped beta to PR #543"
date: 2026-11-03
summary: "Run xanh nhưng nhiều bẫy cấu hình: cờ fail-closed === \"true\", bộ ba spawn dev server e2e, và open question TEACHER_EMAILS"
---

# #539 vibe run: teacher signup UI flag shipped beta to PR #543

# #539 Vibe run: tắt đăng ký giáo viên bằng `VITE_TEACHER_SIGNUP_ENABLED` — ship beta qua PR #543

**Date**: 2026-11-03
**Severity**: Medium
**Component**: `apps/web` — auth UI `/login`, feature flag `VITE_TEACHER_SIGNUP_ENABLED`
**Status**: Ongoing (PR #543 → `develop`, giữ merge đến khi e2e local + PR CI xanh)

## What Happened

Vibe run `/ak-cook` cho issue #539 theo plan `plans/261103-1210-539-disable-teacher-signup-ui/plan.md`: tắt đăng ký tài khoản ở giao diện auth giáo viên bằng cờ build-time `VITE_TEACHER_SIGNUP_ENABLED` (mặc định tắt, giai đoạn single-org). Đây là run tiếp quản — lần trước bỏ dở với implementation còn uncommitted trên worktree `feat/539-disable-teacher-signup-ui`.

Pipeline `vibe --ship --beta --advice`; kongming same-model counsel ở 2 checkpoint:
- Pre-impl: **Go** — commit → merge → gates.
- Post-impl: **Go** — push PR trước khi e2e xong, nhưng giữ merge đến khi e2e + PR CI xanh.

Kết quả: merge `origin/develop` sạch; biome exit 0; check-types 8/8; web test 1780/1780 (test mới `login-signup-gate.test.tsx`); code-reviewer fresh-context **Approve** (0 Critical / 0 Important / 2 Minor không chặn); PR #543 lên `develop`; e2e full local đang chạy lúc viết journal.

## The Brutal Truth

Run xanh suốt nhưng là loại run nhiều bẫy cấu hình kiểu "bỏ một chữ là chết thầm lặng": một cờ build-time parse nghiêm ngặt, và **ba** file riêng lẻ phải đặt cờ cùng lúc cho dev server của e2e. Bỏ sót một trong ba là spec `signUpViaUi` timeout ở `#su-name` mà không có error message nào chỉ về nguyên nhân thật. Cái khiến bực mình: gotcha này không nằm trong plan — nó phải được cào ra ở lần run trước, và nếu không ghi lại thì người kế tiếp chắc chắn dẫm lại.

## Technical Details

- Flag parse nghiêm ngặt `=== "true"` → `VITE_TEACHER_SIGNUP_ENABLED=TRUE` hoặc `=1` là **tắt** (fail-closed). Đúng chủ đích, nhưng là bẫy cho ai viết `.env` theo thói quen.
- 3 nơi spawn web dev server của e2e phải đặt cờ cùng lúc: `playwright.config.ts`, `devserver-watchdog.mjs`, `launch.sh`. Thiếu một → e2e đăng ký chết bằng timeout.
- `ak plan update --status` nhận `completed`, **từ chối** `done` — trong khi frontmatter file plan dùng `done`. CLI và format file lệch nhau, kịch bản tự động nào copy giá trị từ frontmatter sẽ lỗi.
- Phạm vi server không đổi (non-goal của plan): `/api/auth/sign-up/email` và Google OAuth vẫn hoạt động; chặn UI thôi.

## What We Tried

- Tiếp quản implementation cũ thay vì viết lại — giữ đúng logic đã duyệt trong plan (không render `SignUpForm`/`AuthTabs` khi tắt, ép `signin` bỏ qua giá trị `signup` cũ trong `localStorage`).
- Chạy gates theo thứ tự counsel pre-impl: commit → merge develop → biome/check-types/test trước khi push PR. Không phải sửa gì vì sạch.

## Root Cause Analysis

Không phải bug sản phẩm — là độ phức tạp cấu hình không có single source of truth: cờ build-time Vite phải được bơm vào từng entry point khởi dựng dev server, và `playwright.config.ts` / `devserver-watchdog.mjs` / `launch.sh` phải tự đồng bộ tay. Chi phí ẩn của việc ba script spawn cùng một server.

## Lessons Learned

- Khi thêm env flag cho dev server của e2e: luôn grep cả bộ ba `playwright.config.ts`, `devserver-watchdog.mjs`, `launch.sh` — sửa một nơi là đủ để CI xanh cục bộ nhưng spec chết ở nơi khác.
- Fail-closed parse là lựa chọn đúng cho single-org, nhưng phải ghi vào docs cho ops: `TRUE`/`1` ≠ bật.
- `ak plan update --status completed`, đừng dùng `done`.

## Next Steps

- Chờ e2e full local xanh + PR CI của #543 rồi mới merge (theo counsel post-impl) — Main sở hữu.
- Trả lời câu hỏi mở #1 của plan (việc vận hành, không chặn PR): nếu `TEACHER_EMAILS` rỗng ở prod/staging thì Google OAuth vẫn tạo tài khoản mới — cần xác nhận biến đã được đặt ở môi trường chạy thật, hoặc quyết định thêm chặn ở server.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
