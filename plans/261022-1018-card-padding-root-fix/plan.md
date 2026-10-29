---
title: "Card v2 mất padding ngang — sửa tận gốc ở primitive"
status: completed
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
Card của `apps/web` chưa bao giờ có các sub-component đó — 73 chỗ `<Card` trong 30 file (`grep -rEn '<Card'
--include='*.tsx' apps/web/src | grep -v '\.test\.'`) truyền nội dung trực tiếp theo hợp đồng v1 "Card tự
lo padding". Kết quả:

1. Mất padding ngang: mọi call site không có `p-*`/`px-*` riêng (12 chỗ `<Card>` / `<Card variant="white">`
   trần — tập con của 26 chỗ không có `p-*`/`px-*`/`py-*` tường minh, cộng các chỗ chỉ truyền `py-4`,
   `flex flex-col gap-*`, `text-center`, `mt-*`, `self-start`…).
2. Khoảng dọc phình: `gap-6` cộng thêm vào `mt-3/mt-4/mb-3` sẵn có của con (thẻ syllabus, SectionLabel).

Primitive anh em `Section` (`p-5`) và `StatCard` (`p-5`) đã giữ padding đầy đủ — chỉ riêng `Card` lệch.

## Hướng sửa

Sửa **một chỗ** ở primitive, khôi phục hợp đồng v1 bằng token v2:
`rounded-xl border bg-card p-6 text-card-foreground shadow-sm` (bỏ `flex flex-col gap-6`, đổi `py-6` → `p-6`).
Call site đã override (`p-0`, `p-5`, `p-8`, `px-4 py-3`, `py-4`, `flex flex-col gap-4`) vẫn thắng nhờ `cn`/twMerge.
Giả định twMerge cần thực nghiệm khi cài deps: chạy `twMerge('p-6 py-4')` phải giữ cả hai; nếu tailwind-merge
drop `p-6`, fallback = đổi class gốc thành `px-6 py-6` (tương đương, override `py-4` vẫn thắng một nửa đúng ý).
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
- Empty-state của **apps/student** (`overview/empty-state.tsx`, `history.tsx`) chỉ có `py-*` nhưng là khối căn
  giữa ngắn — apps/student không import Card primitive của apps/web (không có `card.tsx` trong
  `apps/student/src/components/ui/`), không bị ảnh hưởng bởi plan này; chỉ ghi nhận.

## Red Team Review

### Session — 2026-10-22
**Reviewers:** 3 lens song song (Security Adversary + Fact Checker; Failure Mode Analyst + Fact Checker;
Assumption Destroyer + Contract Verifier) — tier Standard (3 phases). Tất cả findings đều có evidence
`file:line`, qua evidence filter. Sau dedupe: 8 cụm finding, **8 accepted (0 rejected)**.
**Severity breakdown:** 2 Critical, 4 High, 5 Medium (19 finding gốc → 8 cụm sau dedupe).

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 2 chỉ phủ 8/30 file consumer; nhiều Card trần phụ thuộc `gap-6` nằm ngoài danh sách (`profile.tsx:125`, `tuition/$invoiceId.tsx:236,266`, `bank-link-panel.tsx:35`…) | Critical | Accept | Phase 2 |
| 2 | Heuristic phase 2 hở: margin lồng wrapper depth-2, call site truyền `flex` không `flex-col` (mất hướng cột của Card v2 — `assignments/$assignmentId.tsx:61`), divider `border-b pb-*`, `pt-*`/`pb-*` | High | Accept | Phase 2 |
| 3 | Phase 3 route list phải derive từ audit map (thiếu `/reports`, `/dashboard`, `/schedule`, `/vocab`, `/assignments/$id`, `/assignments/tests/*`, `/tuition`, `/students`); `design:compare` là capture-only — gate thật = đối chiếu trước/sau từng route; e2e không assert visual | High | Accept | Phase 3 |
| 4 | Test hợp đồng phải assert qua `toHaveClass` trên DOM node + case regression `px-*`-only + case `variant="white"` no-op | High | Accept | Phase 1 |
| 5 | twMerge `p-6`+`py-4` chưa thực nghiệm (worktree chưa có `node_modules`); cần smoke check + fallback `px-6 py-6` | Medium | Accept | Plan, Phase 1 |
| 6 | Số liệu "64 call site" sai — thực tế 73 occurrences/30 file; "12 chỗ trần" đúng pattern nhưng là tập con của 26 chỗ thiếu padding tường minh | Medium | Accept | Plan |
| 7 | Rollback "revert 1 file" sai sau khi phase 2 sửa call site (twMerge cho className call site thắng) | Medium | Accept | Phase 1 |
| 8 | Mục ngoài-phạm-vi empty-state student sai ngữ cảnh (apps/student không dùng Card) | Medium | Accept | Plan |

Ghi chú adjudication: đề xuất "bỏ prop `variant` (clean cutover 12 call site)" của Security Adversary
không chấp nhận trong scope này — lock bằng test no-op (finding 4); việc xoá variant là candidate issue
clean-up riêng.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03 (sau khi apply 8 finding).
- Decision deltas checked: 6 — số liệu 73/30/12/26; twMerge fallback `px-6 py-6`; audit toàn bộ consumer;
  heuristic mở rộng; route list phase 3 derive từ audit; rollback = revert primitive + call-site commits.
- Reconciled stale references: 5 (số "64" và "12 chỗ" trong plan.md; rollback note phase-01; danh sách 8
  file ưu tiên phase-02 → đổi thành audit toàn bộ; route list phase-03; heuristic quote trong phase-02).
- Unresolved contradictions: 0.
