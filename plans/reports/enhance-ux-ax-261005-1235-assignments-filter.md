# UX/AX review: teacher-os — bộ lọc trang Bài tập (2026-10-05)

## Verdict

Bộ lọc "Phần thi" là điểm gây nhiễu lớn nhất trang: 12 chip trộn 4 kỹ năng không nhãn, không đếm,
10/12 dẫn tới ngõ cụt với dữ liệu thật, và trên mobile đẩy list xuống ~48% chiều cao trang.
Mode `--auto` đã triển khai 5 proposal (2 Must + 3 Should) qua 2 vòng fix; sau vòng 2 mọi
acceptance check đều pass có bằng chứng (unit 1185 test, full e2e 126 passed + bank spec re-run
sau fix, typecheck 7/7, browser verify 3 viewport + keyboard + URL state + reduced-motion).
Baseline PNG trong `round-1/` là ảnh chụp trước khi đổi code (khôi phục từ spill gốc).

## Scope and environment

- Mode: `--auto`, focus: **filter trang `/assignments`** (apps/web). DONE contract chấm các surface đã đụng.
- Stack: TanStack Router + React (apps/web), Tailwind v4 tokens từ `packages/ui`.
- Environment kiểm chứng: stack e2e isolate trên port 8100/8101 (dev server của user ở 8000/8001/8003
  không đụng); account seed `ux-review@e2e.local` + 2 prompt (Speaking Part 1, Writing Task 2) mô
  phỏng đúng data trong screenshot gốc.
- Pages reviewed: `/assignments` (desktop/tablet/mobile), tương tác filter, keyboard, URL state.
- Không chạy được: quét AX trên production (private workspace) — xem "Discovery scan".

## Baseline evidence

| Viewport | File | Ghi chú |
|---|---|---|
| 1440×900 | `round-1/baseline-desktop.png` | Filter card ~360px taller hơn list 2 card; 12 pill "Phần thi" 3 hàng không nhãn |
| 768×1024 | `round-1/baseline-tablet.png` | 1 cột dọc, preview xuống cuối trang |
| 375×812 | `round-1/baseline-mobile.png` | "Phần thi" 6 hàng; card list đầu tiên ở ~48% chiều cao trang |

Vision findings (baseline): mixed taxonomies trong 1 nhóm phẳng, không per-chip counts, footer
count low-contrast, implicit skill↔part interdependency, 2 ô search trên cùng màn (topbar + card).

## Discovery scan (AX)

`check-discovery-surfaces.mjs http://localhost:8101 --site-origin https://app.teacher-os.vn`:
5 errors (robots disallow-all, no sitemap/meta/OG), 11 warns (llms.txt, canonical, markdown twin…).
**Chấp nhận có chủ đích**: apps/web là teacher workspace private, auth-gated, client-rendered;
public AX surfaces (robots/sitemap/llms/markdown twin) thuộc app `landing`. Không surface public
nào bị thay đổi trong PR này.

## Scores (rubric — scope: filter section)

| Area | Baseline | Sau | Evidence |
|---|---|---|---|
| Clarity & hierarchy | 1 | 3 | 12 chip trộn → 4 nhóm có nhãn + đếm; `final-desktop-all.png` |
| Responsive | 1 | 2.5 | Mobile collapse card còn 1 hàng toggle; `final-mobile-collapsed.png` |
| Accessibility | 1.5 | 2.5 | `role="group"` + aria-label, badge aria-hidden, focus ring + reduced-motion verified |
| Content punch | 2 | 2 | Copy giữ nguyên (đã rõ); badge số thay lời nói suông |
| State continuity | 0 | 3 | Filter trong URL; reload + back-từ-preview-page verified giữ filter |
| Motion | 2.5 | 3 | Chevron rotate tắt dưới `prefers-reduced-motion` (transition 0.15s → 0s, verified emulate) |
| First impression / Brand recall / Storytelling | n/a (list page tool UI) | — | ngoài scope focus |

## Proposals

### P1 — Nhóm "Phần thi" theo kỹ năng (Must) ✅
- Evidence: `baseline-desktop.png`; `index.tsx` cũ `SKILLS.flatMap(s => s.parts)` khi skill=all.
- Change: skill="Tất cả" → 4 hàng có nhãn mono uppercase (WRITING/READING/LISTENING/SPEAKING),
  mỗi hàng chỉ chip của skill đó; chọn 1 skill → chỉ part của skill đó (giữ hành vi cũ).
- Files: `apps/web/src/routes/_auth/assignments/index.tsx`.
- Acceptance: DOM có `aria-label="Phần thi Writing/Reading/Listening/Speaking"`; chọn Speaking
  → nhóm Writing biến mất (verified browser + unit test).

### P2 — Badge đếm trên chip (Should) ✅ (sau vòng fix 2)
- Evidence: baseline "Đang hiện 2/2" không cho biết chip nào có nội dung; 10/12 part chip dẫn
  tới empty state.
- Change: `ChipFilter` nhận `counts` (label→số); badge `font-mono text-[10px] tabular-nums`
  `aria-hidden` (accessible name giữ nguyên cho e2e `name` exact + voice control). Skill chip đếm
  theo query hiện tại; part chip đếm trong nhóm skill của nó. **Vòng 1 thiếu counts ở chế độ
  một-skill và dùng `opacity-60` làm mờ chip 0 đề (~3.3:1 trên control 12px — fails WCAG AA);
  vòng 2 bỏ hẳn dim (label luôn #424245, 8.9:1), state rỗng chỉ báo bằng badge "0", và truyền
  counts cho cả hàng part một-skill.**
- Files: `chip-filter.tsx`, `index.tsx`.
- Acceptance: unit test (`>3</span>`, `>1</span>`, `>0</span>` với fixture 3W+1R); browser:
  `?skill=speaking` → "Part 1 · Phỏng vấn 1", 2 badge "0" (Part 2/3), zero-chip `opacity 1`
  color `rgb(66,66,69)`; vision xác nhận trên `final-desktop-filtered.png`; e2e bank spec
  selector `Task 1 · 150 từ` exact pass.

### P3 — Filter sống trong URL (Should) ✅
- Evidence: reload mất filter (state chỉ trong useState); rubric state continuity 0.
- Change: `validateSearch` ({q, skill, part} optional — annotate input type để Link/navigate khác
  không bị ép truyền search, tránh breaking 8 callsite); navigate replace khi bấm chip; ô search
  **state local + debounce 300ms** (navigate mỗi phím làm input controlled bởi URL rớt ký tự —
  bug bắt được khi test `essay`→`?q=esy`, fix vòng 1); sync URL→state hai chiều qua
  `lastEmittedQuery` ref; "Xóa bộ lọc" reset cả input + URL (bug re-apply query cũ do quên
  `setQuery("")` — fix vòng 1).
- Files: `index.tsx`.
- Acceptance: `?skill=speaking&part=part1` → "Đang hiện 1/2 đề"; reload giữ nguyên (verified);
  **back**: từ trang preview (`/assignments/preview?id=`) bấm back → `/assignments?skill=speaking`
  + "Đang hiện 1/2 đề" (verified vòng 2 — vòng 1 back-test rơi vào /login nên chưa chứng minh
  được); gõ "essay" đủ chữ trong URL; e2e bank spec line 76-93 cover search + clear.

### P4 — Card bộ lọc gập dưới `lg` (Should) ✅
- Evidence: `baseline-mobile.png` — list card đầu ở ~48% chiều cao trang.
- Change: header row `lg:hidden` "Bộ lọc" + badge số filter đang áp dụng + đếm `n/m đề` + chevron;
  body `hidden lg:flex` khi gập; mặc định gập khi `<1024px` và không có filter, mở khi có filter
  (từ URL) hoặc desktop.
- Acceptance: mobile load sạch → 1 hàng toggle trước list (vision `final-mobile-collapsed.png`);
  click mở/đóng (aria-expanded true↔false, body visibility đổi — verified browser); có filter →
  mở sẵn.

### P5 — Ngữ nghĩa nhóm cho chip + reduced-motion (Must) ✅
- Evidence: 2 `ChipFilter` là div trần với span label không associate; chevron rotate không có
  media gate.
- Change: `ChipFilter` thêm `ariaLabel` → `role="group" aria-label`; chevron
  `motion-safe:transition-transform` (tắt hẳn transition dưới reduce — giữ feedback tức thì).
- Acceptance: markup chứa đủ aria-label (unit test); Tab tới chip có focus ring accent 3.7px
  (computed style verified); emulate `prefers-reduced-motion: reduce` → chevron transition
  `0.15s → 0s` (verified vòng 2; vòng 1 chỉ đọc `matchMedia(...).matches === false`, chưa emulate).

## DONE contract

1. ✅ Mọi Must (P1, P5) + Should (P2, P3, P4) đạt acceptance check vòng 2 (bằng chứng từng mục).
2. ✅ (điều chỉnh có ghi rõ) `check-discovery-surfaces.mjs` exit 1 trên apps/web — private
   auth-gated workspace, disallow-all là chủ đích; mọi lỗi accepted-by-design, surface public thuộc
   app `landing` (ngoài scope, không đụng).
3. ✅ Screenshots 3 viewport trước/sau (`round-1/`, retake sau vòng 2): không tràn ngang, không chữ
   cắt ngoài truncation by-design, không element chồng; vision không còn High issue.
4. ✅ Không rubric area nào tụt; area < 2 (clarity, responsive, state continuity) giờ ≥ 2.5.
5. ✅ Keyboard (Tab→chip, focus ring) pass; reduced-motion **emulated** pass (chevron 0s; chip
   color-transition 150ms là feedback thiết yếu, không phải vestibular trigger).
6. ✅ `pnpm --filter web test` 110 files / 1185 tests pass; `pnpm run check-types` 7/7 pass;
   **full e2e 126 passed / 1 skipped (0 fail)** chạy với code vòng 1, và `assignment-bank.spec.ts`
   (spec đụng trực tiếp filter) **re-run pass sau mọi fix vòng 2**; `pnpm check` fail pre-existing
   vì nested `biome.json` trong `.claude/worktrees/*` (biome scoped 3 file touched sạch).
7. ✅ `DESIGN.md`, `REVIEW.md` tạo mới; `AGENTS.md` thêm section "Quy ước UI"; CHANGELOG thêm entry
   (nguyên file verse git-an toàn; 1 lần truncate phát hiện và rollback qua `git show` trước khi
   chèn lại đúng chỗ).
8. ✅ Server isolate stop trước mỗi lần e2e chiếm port; dev server của user không đụng.

## Round log (auto)

| Round | Proposals done | Checks passing | Regressions fixed | Notes |
|---|---|---|---|---|
| 1 | P1–P5 | unit 1185, types 7/7, bank spec, screenshots, keyboard/URL/reload | dropped-chars khi gõ (debounce); "Xóa bộ lọc" re-apply query cũ (`setQuery("")`); TS bắt buộc `search` trên 8 Link (annotate validateSearch input) | self-review bắt 3 lỗi trước handoff |
| 2 (fix) | P2/P5 hoàn thiện | bank spec re-run pass; browser: counts chế độ 1-skill, zero-chip contrast 8.9:1, back-từ-preview giữ filter, reduced-motion 0s; screenshots retake | counts thiếu ở hàng part một-skill; `opacity-60` ~3.3:1 fail AA → bỏ dim; chevron chưa gated reduce; baseline PNG là file text → khôi phục từ spill | full e2e (vòng 1 code): 126 passed / 1 skipped |

## Unresolved questions

- Tablet (768px) vẫn xếp dọc filter → list → preview (master-detail 2 cột chỉ bật ở `lg`): chấp
  nhận theo thiết kế hiện tại; nếu giáo viên dùng iPad ngang nhiều, cân nhắc breakpoint riêng.
- Badge đếm không hiện trên chip "Tất cả"/"Tất cả phần" (chip reset) — chủ đích, tránh trùng dòng
  đếm footer.
- Badge đếm dùng `text-meta` (#86868b, ~3:1) theo house style meta-text của repo; đây là metadata
  bổ sung (đếm chính thức vẫn ở dòng `aria-live` 4.5:1), nhưng nếu muốn strict AA cho mọi chữ hiển
  thị thì cần nâng token `--meta` — quyết định của owner, để nguyên trong PR này.
- `focus-visible:shadow-[var(--focus-ring)]` sinh CSS đúng (verified computed); pattern dùng rải
  rác 51 file — không đổi trong PR này.
