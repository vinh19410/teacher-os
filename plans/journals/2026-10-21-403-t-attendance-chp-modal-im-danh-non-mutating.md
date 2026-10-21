---
title: 403 — t-attendance chụp modal điểm danh non-mutating
date: 2026-10-21
summary: "Root cause: appSteps rỗng + link mở modal không render vì seed lớp chính chỉ 1 enrollment (gate isGroupSession>=2). Fix 3 điểm chạm: data-testid session-attendance-open-{index} trên link modal; seed thêm enrollment thứ 2 (Nguyễn Thu Hà) + 5 lesson rows; screens.json appSteps click testid buổi 3 + guard nonMutating đo zero-POST /check-in trong capture.mjs. Verify: vitest 1552, e2e 178 pass, harness 180 ảnh 0 lỗi (10 màn), composite t-attendance hiển thị modal khớp design. Red-team 3 reviewer: 7 ACCEPT / 1 REJECT (timezone false positive). Reviewer fresh-context: 0C/0I/2Minor."
---

# 403 — t-attendance chụp modal điểm danh non-mutating

Root cause: appSteps rỗng + link mở modal không render vì seed lớp chính chỉ 1 enrollment (gate isGroupSession>=2). Fix 3 điểm chạm: data-testid session-attendance-open-{index} trên link modal; seed thêm enrollment thứ 2 (Nguyễn Thu Hà) + 5 lesson rows; screens.json appSteps click testid buổi 3 + guard nonMutating đo zero-POST /check-in trong capture.mjs. Verify: vitest 1552, e2e 178 pass, harness 180 ảnh 0 lỗi (10 màn), composite t-attendance hiển thị modal khớp design. Red-team 3 reviewer: 7 ACCEPT / 1 REJECT (timezone false positive). Reviewer fresh-context: 0C/0I/2Minor.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
