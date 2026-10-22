---
title: "Card v2 mất padding ngang — sửa tận gốc ở primitive"
status: pending
created: 2026-10-22
branch: develop
mode: fast
issue: https://github.com/vinh19410/teacher-os/issues/412
---

# Card v2 mất padding ngang — sửa tận gốc ở primitive

## Vấn đề

Ở `/profile` và `/syllabus` (và mọi màn dùng `<Card>` không truyền padding riêng), nội dung dính sát mép
trái/phải của card, còn khoảng cách dọc giữa các khối thì bị phình to bất thường.

## Nguyên nhân gốc (đã kiểm bằng source)

`apps/web/src/components/ui/card.tsx` bị đổi ở #378 (commit `c308b434`, redesign v2):

| | Trước #378 (v1) | Sau #378 (v2, hiện tại) |
|---|---|---|
| Class gốc | `neu rounded-lg p-6` | `flex flex-col gap-6 rounded-xl border bg-card py-6 …` |
| Padding ngang | `p-6` → 24px | **không có** |
| Layout con | block flow, con tự lo `mt-*`/`mb-*` | flex-col `gap-6` **cộng dồn** với `mt-*`/`mb-*` của con |

Class v2 chép từ shadcn `Card`, nơi padding ngang do `CardHeader`/`CardContent` (`px-6`) đảm nhiệm. Nhưng
Card của `apps/web` chưa bao giờ có các sub-component đó — 64 call site truyền nội dung trực tiếp vào
`<Card>` theo hợp đồng v1 "Card tự lo padding". Kết quả:

1. Mất padding ngang: mọi call site không có `p-*`/`px-*` riêng (12 chỗ `<Card>` / `<Card variant="white">`
   trần, cộng các chỗ chỉ truyền `py-4`, `flex flex-col gap-*`, `text-center`, `mt-*`, `self-start`…).
2. Khoảng dọc phình: `gap-6` cộng thêm vào `mt-3/mt-4/mb-3` sẵn có của con (thẻ syllabus, SectionLabel).

Primitive anh em `Section` (`p-5`) và `StatCard` (`p-5`) đã giữ padding đầy đủ — chỉ riêng `Card` lệch.

## Hướng sửa

Sửa **một chỗ** ở primitive, khôi phục hợp đồng v1 bằng token v2:
`rounded-xl border bg-card p-6 text-card-foreground shadow-sm` (bỏ `flex flex-col gap-6`, đổi `py-6` → `p-6`).
Call site đã override (`p-0`, `p-5`, `p-8`, `px-4 py-3`, `py-4`, `flex flex-col gap-4`) vẫn thắng nhờ `cn`/twMerge.
Thêm unit test khoá hợp đồng để lần redesign sau không tái phát.

Không chọn phương án "thêm CardHeader/CardContent kiểu shadcn rồi sửa 64 call site": churn lớn, rủi ro
vỡ e2e/testid, trong khi lỗi nằm ở primitive.

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Sửa Card primitive + test khoá hợp đồng](phase-01-fix-card-primitive.md) | pending |
| 2 | [Rà call site phụ thuộc layout v2](phase-02-audit-call-sites.md) | pending |
| 3 | [Verify UI 3 viewport + design:compare](phase-03-verify.md) | pending |

## Acceptance criteria

- [ ] `/profile`: tiêu đề, input, nút trong 3 card cách mép trái/phải 24px; card SePay cũng vậy.
- [ ] `/syllabus`: tag, tiêu đề, "Module", badge/nút Xóa cách mép 24px; khoảng dọc giữa các khối khớp `mt-*` khai báo (không còn khoảng trống lớn).
- [ ] Không call site nào trong danh sách phase 2 bị vỡ layout (đối chiếu screenshot trước/sau).
- [ ] Unit test `card.test.tsx` fail nếu Card mất padding ngang hoặc quay lại `flex-col gap-6`.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web test` PASS; e2e full suite PASS trước merge.

## Ngoài phạm vi

- Style nút "Lưu thay đổi"/"Đổi ảnh" trông như ghost và badge "Đã liên kết" dạng outline — là chuyện variant
  của Button/Badge, tách issue riêng nếu cần.
- `packages/ui/src/components/card.tsx` (bản shadcn đầy đủ, hiện không app nào import) — giữ nguyên.
- Empty state của student (`overview/empty-state.tsx`, `history.tsx`) chỉ có `py-*` nhưng là khối căn giữa
  ngắn, không lỗi hiển thị — chỉ ghi nhận, không sửa.
