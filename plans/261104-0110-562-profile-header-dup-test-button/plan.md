---
title: "#562: Bỏ nút \"Làm Test Miễn Phí\" thừa ở header trang profile"
description: "Header apps/profile có hai điểm vào \"Làm Test Miễn Phí\" cùng trỏ kiem-tra-dau-vao/; giữ nút CTA vàng, bỏ link text trong nav-links."
status: completed
priority: P3
effort: 0.5h
issue: 562
branch: fix/562-profile-header-dup-test-button
tags: [frontend, profile]
blockedBy: []
blocks: []
created: 2026-11-04
---

# Plan: #562 — Bỏ nút "Làm Test Miễn Phí" thừa ở header

## Outcome

Header trang chủ `apps/profile` chỉ còn **một** điểm vào "Làm Test Miễn Phí".

## Non-goals

- Không đổi CTA ở hero, floating CTA (dòng 2901), các thẻ khóa học, trang `kiem-tra-dau-vao/`.
- Không đổi style `.nav-links` / `.nav-actions`, không đổi `<section id="lam-test-mien-phi">` (dòng 2129).

## Phát hiện từ scout

Trong `apps/profile/public/index.html`, header có hai phần tử cùng href `kiem-tra-dau-vao/`:

1. `<li><a href="kiem-tra-dau-vao/">Làm Test Miễn Phí</a></li>` trong `.nav-links` (dòng 1850), ẩn ở ≤768px (dòng 1768–1773).
2. `<a href="kiem-tra-dau-vao/" class="btn btn-gold btn-sm">📝 Làm Test Miễn Phí</a>` trong `.nav-actions` (dòng 1857), luôn hiện.

## Quyết định

Giữ nút (2), bỏ mục (1): nút là CTA chính, hiện cả mobile; nếu bỏ nút thì mobile mất lối vào test ở header. Ba mục còn lại của `.nav-links` (`#bo-ho-so-pdf`, `#ho-so-giang-vien`, `#lo-trinh-khoa-hoc`) giữ nguyên các anchor trang. Nếu chủ dự án muốn giữ link text thay vì nút, đảo lại là đổi một dòng.

## Phases

| # | Phase | Trạng thái |
|---|---|---|
| 1 | [Xoá mục thừa trong nav-links](phase-01-remove-duplicate-nav-link.md) | completed |

## Acceptance criteria

- `<header class="site-header">` chỉ có đúng 1 liên kết dẫn tới `/kiem-tra-dau-vao` (nút vàng `.btn-gold` trong `.nav-actions`; `.nav-links` còn 0 liên kết test và đủ 3 anchor mục trang; 8 CTA ngoài header được giữ nguyên), được bảo vệ bởi regression test trong `apps/profile/tests/index.test.mjs`.
- `pnpm --filter profile test` và `pnpm exec biome check .` xanh.
- 3 viewport chuẩn (`1440×900`, `768×1024`, `375×812`) + `320×812` reflow (`REVIEW.md`): các phần tử hiển thị trong header nằm trọn trong `[0, clientWidth]` không tràn/chồng lấn, nút vàng hiển thị, điều hướng `Tab` kích hoạt `:focus-visible` (`outlineWidth: "3px"`).

## Phụ thuộc / lưu ý

- #560 cũng sửa `.nav-actions` ở cùng file; không chặn nhau, có thể cần rebase.

## Validation Log

### Session 1 — 2026-11-04 (`ak-vibe --advice`)

#### Verification Results
- **Tier:** Light (1 phase — Fact Checker)
- **Claims checked:** 6
- **Verified:** 5 | **Failed:** 1 (factual count/line drift only, reconciled) | **Unverified:** 0

##### Findings Reconciled
1. [Fact Checker] `plan.md` ghi "Hai mục còn lại của `.nav-links`" — thực tế `<ul class="nav-links">` (`apps/profile/public/index.html:1848-1853`) có 4 mục, xoá dòng 1850 còn **3** mục (`#bo-ho-so-pdf`, `#ho-so-giang-vien`, `#lo-trinh-khoa-hoc`). Đã cập nhật.
2. [Fact Checker] Các số dòng tham chiếu (`~1877`, `~1884`, `~2942`) lệch ~27–41 dòng sau khi PR #561 (#559) merge vào `develop` (`3c90e89d`); cập nhật về dòng chính xác hiện tại (`1850`, `1857`, `2901`).
3. [Advisor Scope Lock] Nâng cấp `phase-01-remove-duplicate-nav-link.md` theo hợp đồng bàn giao `--advice --tdd` (bổ sung regression test red→green trong `apps/profile/tests/index.test.mjs` và khối `## Failure Protocol`).

#### Whole-Plan Consistency Sweep (Post-Validation)
- Files reread: `plan.md`, `phase-01-remove-duplicate-nav-link.md`
- Decision deltas checked: 3 (3 remaining `.nav-links` items, updated line references, `--advice --tdd` handover tasks)
- Reconciled stale references: 3
- Unresolved contradictions: 0

## Red Team Review

### Session — 2026-11-04 (`RedTeamSecurity` + `RedTeamAssumptions`, Light Tier Fact Checker)
**Findings:** 5 deduplicated (4 accepted, 1 partially accepted / CSS scope-creep rejected)
**Severity breakdown:** 0 Critical, 4 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| RT-1 | `biome.json` (`useIgnoreFile: false`, `ignoreUnknown: false`, exclude `apps/profile/public/index.html`) không lint HTML và sẽ báo lỗi nếu lưu `.png`/file tạm trong `./tmp/` hoặc chạy `pnpm check:fix` toàn cục | High | Accept | Phase 01 (Task 1.1, Task 1.3) |
| RT-2 | Đóng đinh `pass 20` và số dòng cứng dễ gãy giả hoặc mất nút `#studentPortalLink` khi rebase lên `#560` | High | Accept | Phase 01 (Task 1.1, Task 1.2, Risk) |
| RT-3 | CLI `apps/profile/serve.mjs` dùng `Number(process.env.PORT) \|\| 8005` (`PORT=0` rơi về `8005` và bind `0.0.0.0`), gây nguy cơ đụng cổng / đọc nhầm worktree `#560` | High | Accept | Phase 01 (Task 1.3) |
| RT-4 | Regex kiểm thử thô dễ lọt biến thể URL (`/kiem-tra-dau-vao` không `/`), HTML comment, nested `<div>` trong `.nav-actions`, và thiếu chốt bảo vệ 8 CTA ngoài header (đặc biệt dòng 2901 trùng từng ký tự với dòng 1857) | High | Accept | `plan.md` AC, Phase 01 (Task 1.1) |
| RT-5 | `body { overflow-x: hidden }` che khuất `scrollWidth <= innerWidth`, thiếu mốc `320×812` (`REVIEW.md`), số nhịp `Tab` đổi theo viewport; đề xuất sửa thêm CSS `<nav>` / màu `:focus-visible` | Medium | Accept (modified — nhận phần đo bounding-box + `320×812` + vòng lặp `Tab`; từ chối sửa CSS vì vi phạm Non-goal "Không đổi style" và tăng xung đột với `#560`) | `plan.md` AC, Phase 01 (Task 1.3) |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-remove-duplicate-nav-link.md`
- Decision deltas checked: 5 (RT-1..RT-5)
- Reconciled stale references: 5 (loại bỏ `pnpm check:fix` toàn cục, loại bỏ `pnpm --filter profile build` tạm trong worktree, đổi `pass 20` thành `pass >= 20` + `fail 0`, dùng `createProfileServer` in-process bind `127.0.0.1:0` + `/tmp/profile-562-*`, đo hình học `getBoundingClientRect` trên 4 mốc viewport)
- Unresolved contradictions: 0
