---
title: "fix(web): #544 bỏ dấu + thừa ở nút Thêm học viên"
date: 2026-11-03
---

# fix(web): #544 bỏ dấu + thừa ở nút Thêm học viên

- **Cause:** `students/index.tsx` render `<Plus/>+ Thêm học viên` ở 2 nút (header + empty state) → accessible name "+ Thêm học viên".
- **Fix:** bỏ ký tự `+` trong nhãn (2 chỗ); test đổi query regex → exact `"Thêm học viên"`. Non-goal: nút class detail "+ Thêm học viên vào lớp" giữ nguyên.
- **Verify:** web suite 1780 tests, biome, check-types xanh; code review 0C/0I/2M; screenshot 3 viewport (header + empty state) — chỉ còn 1 dấu +.
- **Infra note:** design:compare fail 4 run liên tiếp trên box chia sẻ (thiếu flag VITE_TEACHER_SIGNUP_ENABLED ở harness, orphan server từ run trước, port hijack bởi session song song, seed timeout) → dùng manual capture; cần issue follow-up cho harness.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
