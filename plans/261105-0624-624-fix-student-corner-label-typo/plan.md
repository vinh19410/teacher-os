---
title: "Sửa nhãn nút \"Gốc học viên\" thành \"Góc học viên\" trên trang profile"
description: "Sửa lỗi chính tả nhãn nút #studentPortalLink trên header apps/profile, kèm test khoá nhãn và tài liệu mô tả nút."
status: pending
priority: P2
effort: 15m
issue: 624
branch: develop
tags: [bugfix, frontend, profile]
blockedBy: []
blocks: []
created: 2026-11-05
---

# Plan: Sửa nhãn nút "Gốc học viên" thành "Góc học viên" (#624)

## Outcome

Nút dẫn tới cổng học viên trên header trang profile công khai (`apps/profile`, `#studentPortalLink`) hiển thị đúng chính tả **"Góc học viên"**. Chỉ nhãn thay đổi: `href`, `rel`, class, cơ chế thay `STUDENT_PORTAL_URL` và bố cục header giữ nguyên.

## Bối cảnh

Nhãn `"Gốc học viên"` được thêm ở #560 và giữ đúng nguyên văn tiêu chí nghiệm thu của issue đó; plan #560 ghi nhận đây là tuỳ chọn đổi một dòng cho chủ dự án. Yêu cầu này là quyết định của chủ dự án về copy, chọn đúng dạng viết **"Góc học viên"** (chỉ viết hoa chữ đầu).

## Phạm vi

| File | Dòng hiện tại | Thay đổi |
|------|---------------|----------|
| `apps/profile/public/index.html` | 914 | Đổi nhãn nút, đây là chỗ duy nhất người dùng nhìn thấy |
| `apps/profile/tests/index.test.mjs` | 294, 320, 325, 332, 340 | Đổi nhãn trong assertion và fixture |
| `docs/codebase-summary.md` | 40 | Đổi nhãn trong mô tả `apps/profile` |
| `CHANGELOG.md` | mục ngày làm việc | Thêm một dòng `### Fixed` kèm số issue |

## Ngoài phạm vi

- Không viết lại lịch sử: dòng #560 trong `CHANGELOG.md`, `plans/261103-2314-560-*`, `plans/261104-1329-600-*` và journal #560 giữ nguyên nhãn cũ vì đó là bản ghi tại thời điểm viết.
- Không đổi `id="studentPortalLink"`, biến `STUDENT_PORTAL_URL` hay hành vi mở link.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Sửa nhãn và cập nhật test, docs](./phase-01-fix-label.md) | Pending |

## Success Criteria

- [ ] Trang `apps/profile` hiển thị "Góc học viên" trên header.
- [ ] `grep -rn "Gốc học viên" apps packages docs` không còn kết quả.
- [ ] `pnpm --filter profile test` xanh, gồm assertion nhãn mới.
- [ ] `pnpm exec biome check .` xanh.
- [ ] Header không vỡ ở `1440×900`, `768×1024`, `375×812`, `320×812`, có ảnh chụp kèm PR.

## Rủi ro

Rủi ro thấp. Chữ `ó` và `ố` gần như cùng độ rộng nên không ảnh hưởng bố cục header, và không spec e2e hay script nào tham chiếu tới nhãn này. Rollback bằng cách revert một commit.

## Validation Log

### Session 1 — 2026-11-05

Không có câu hỏi phỏng vấn: nội dung nhãn đã do chủ dự án chốt nguyên văn và không còn điểm cần quyết định.

### Verification Results

- Claims checked: 5
- Verified: 5 | Failed: 0 | Unverified: 0
- Tier: Light
- Bằng chứng: các dòng trong bảng phạm vi khớp kết quả `grep`; `apps/e2e` và `scripts` không chứa nhãn; `profile` có script `test` trong `apps/profile/package.json`; `scripts/design-compare/` không tham chiếu `apps/profile` (`t-profile` là route `/profile` của app chính).

### Whole-Plan Consistency Sweep

`plan.md` và phase file thống nhất về nhãn đích, danh sách file và lệnh kiểm chứng; không còn mâu thuẫn.
