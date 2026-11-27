---
phase: 3
title: "Phase 3: Redesigned Vocabulary Components & Route"
status: completed
priority: P1
effort: "2.5h"
dependencies: [1, 2]
---

# Phase 3: Redesigned Vocabulary Components & Route

## Goal
Xây dựng bộ component mới và cập nhật trang `/practice/vocabulary` theo `open-design/vocabulary.html` bằng token design v2 (Light + Dark), đồng bộ URL filter `?f=&lv=&q=`, bảo toàn 100% testids/nhãn/selector của các bộ test E2E và unit test hiện hữu, đảm bảo WCAG AA contrast và 320px reflow.

## Files to Create / Modify
- Modify: `apps/student/src/components/vocab/vocab-countdown.tsx`
- Create: `apps/student/src/components/vocab/vocab-today-hero.tsx`
- Create: `apps/student/src/components/vocab/vocab-memory-card.tsx`
- Create: `apps/student/src/components/vocab/vocab-deck-card.tsx`
- Modify: `apps/student/src/components/vocab/vocab-suggestion-list.tsx`
- Modify: `apps/student/src/components/vocab/vocab-courses-cta.tsx`
- Modify: `apps/student/src/routes/_auth/practice/vocabulary/index.tsx`
- Create: `apps/student/src/components/vocab/vocab-overview-page.test.tsx`

## Tasks & Steps

### Task 3.1 — Cập nhật `VocabCountdown` với single-fire `onExpired` và `variant="inline"`
- **Goal:** Sửa lỗi `onExpired` bị gọi mỗi giây khi quá hạn và hỗ trợ hiển thị `variant="inline"` trong khối Hero "Hôm nay" mà vẫn giữ nguyên `data-testid="vocab-countdown"`, `vocab-countdown-label` (`formatCountdown`), và `vocab-upcoming-label`.
- **Target files and symbols:**
  - `apps/student/src/components/vocab/vocab-countdown.tsx` (`VocabCountdown`)
- **Steps:**
  1. Thêm `expiredForRef = useRef<number | null>(null)` và `onExpiredRef` để đảm bảo mỗi giá trị `nextDueAt` chỉ gọi `onExpired` tối đa 1 lần khi `current >= nextDueAt`.
  2. Thêm prop `variant?: "card" | "inline"` (mặc định `"card"`). Ở `variant === "inline"`, render `<p data-testid="vocab-countdown" className="mt-2 text-muted-foreground text-sm">` chứa `"Lượt ôn tiếp theo sau "` + `<span data-testid="vocab-countdown-label" className="font-mono font-medium text-foreground tabular-nums">{formatCountdown(remainingMs)}</span>` + `" · "` + `<span data-testid="vocab-upcoming-label" className="tabular-nums">{clampedUpcoming} từ</span>`. Không đặt `aria-live` lên countdown.
- **Success criteria:** `vocab-countdown-label` giữ format `formatCountdown(remainingMs)` (`/^(1d 0h|23:59)/`), `onExpired` chỉ bắn 1 lần khi hết giờ.
- **Verify:** `pnpm --filter student check-types` exits 0.

### Task 3.2 — Tạo `VocabTodayHero`, `VocabMemoryCard` và `VocabDeckCard`
- **Goal:** Tạo 3 component mới khớp layout `open-design/vocabulary.html` nhưng chạy bằng token design v2, dữ liệu thật, WCAG AA contrast, stretched-link an toàn và 320px reflow.
- **Target files and symbols:**
  - `apps/student/src/components/vocab/vocab-today-hero.tsx` (`VocabTodayHero`)
  - `apps/student/src/components/vocab/vocab-memory-card.tsx` (`VocabMemoryCard`)
  - `apps/student/src/components/vocab/vocab-deck-card.tsx` (`VocabDeckCard`)
- **Steps:**
  1. `VocabTodayHero`:
     - Nhận `heroState`, `streak`, `streakDays`, `todayISO`, `onExpired?: () => void`.
     - Container 2 cột trên `lg:` (`lg:grid-cols-[minmax(0,1fr)_auto]`), 1 cột dưới `lg:`; viền nhấn `border-[1.5px] border-foreground` khi `heroState.kind === "due"`, `border border-border` ở 4 trạng thái còn lại.
     - Render đủ 5 trạng thái Hero:
       - `no-decks`: `"Bắt đầu bộ từ đầu tiên"` + `heroState.subtitle`.
       - `due`: `<span data-testid="vocab-overview-due-count">{heroState.dueCount}</span> từ đến hạn ôn`, sub phút/số bộ + `totalNewCount` (`data-testid="vocab-overview-new-count"` nếu > 0), CTA chính `"Bắt đầu ôn"` `<Link to="/practice/vocabulary/$deckId/session" params={{ deckId: heroState.topDueDeck.deckId }} search={{ mode: "review" }}>` (chỉ render khi `topDueDeck != null`), CTA phụ `"Học từ mới"` (nếu `topNewDeck != null`) tới `topNewDeck` với `mode: "learn"`.
       - `new-only`: `"Sẵn sàng học "` + `<span data-testid="vocab-overview-new-count">{heroState.totalNewCount}</span>` + `" từ mới"`, CTA chính `"Học từ mới"` tới `topNewDeck` với `mode: "learn"`.
       - `caught-up`: `"Bạn đã ôn xong hôm nay"`, inline `<VocabCountdown variant="inline" nextDueAt={heroState.nextDueAt} upcomingCount={heroState.upcomingCount} onExpired={onExpired} />`, CTA `"Học "` + `<span data-testid="vocab-overview-new-count">{heroState.totalNewCount}</span>` + `" từ mới"` (nếu `topNewDeck != null`).
       - `empty-decks`: `"Chưa có từ cần ôn hôm nay"` + `"Các bộ từ hiện tại chưa có từ vựng để bắt đầu."`.
     - Cột Chuỗi ngày học (luôn render ở cả 5 trạng thái): bỏ `min-w-[240px]` trên mobile (dùng `lg:min-w-[252px]`), bọc exact `<span data-testid="vocab-overview-streak">{streak} ngày</span>` rồi mới đặt `<span className="font-medium text-muted-foreground text-sm"> liên tiếp</span>` bên ngoài; lưới 7 ngày `grid-cols-7 gap-1 sm:gap-2`, dùng `buildStreakWeekDays(todayISO, streakDays)`, ô đạt dùng `bg-foreground border-foreground text-background` + `<Check aria-hidden="true" className="size-3.5" />`, ô hôm nay chưa học viền nét đứt `border-dashed border-foreground`, `<span aria-hidden="true">{day.shortLabel}</span>` kèm `<span className="sr-only">...</span>`.
  2. `VocabMemoryCard`:
     - Nhận `learnedCount`, `matureCount`, `retention`, `levelDistribution`, `activeLevel`, `onToggleLevel`.
     - Container card `p-4 sm:p-6`. 3 chỉ số (`grid-cols-3 gap-2 sm:gap-4`, mỗi ô có `min-w-0` và số `text-xl sm:text-2xl tabular-nums`): `data-testid="vocab-overview-learned"` (`từ đã thuộc`), `data-testid="vocab-overview-mature"` (`từ thành thạo`), và `retention !== null ? \`${retention}%\` : "—"` (`tỉ lệ nhớ` — không ghi `30 ngày`).
     - Thanh `.mbar` `h-3.5 rounded-full bg-muted ring-1 ring-inset ring-border overflow-hidden flex gap-0.5` (`role="img"` có `aria-label` tổng từ đang theo dõi).
     - 5 nút cấp trí nhớ trong `role="group" aria-label="Lọc bộ từ theo cấp trí nhớ"` (`grid-cols-2 sm:grid-cols-5 gap-2`), mỗi nút dùng `aria-pressed={activeLevel === lv.level}`, selected state `border-primary bg-muted ring-1 ring-primary` (theo `DESIGN.md:72,133`), swatch `size-2.5 rounded-[3px] ring-1 ring-inset ring-input ${lv.bgClass}`. Gắn `data-vocab-level={lv.level}` để nút `"Bỏ lọc"` trả focus chính xác về nút cấp vừa chọn.
  3. `VocabDeckCard`:
     - `<article data-testid={`vocab-deck-card-${deck.deckId}`} aria-labelledby={`vocab-deck-title-${deck.deckId}`} className={cn("group relative flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors duration-150", deck.dueCount > 0 ? "border-foreground" : "border-border")}>`.
     - **Không** đặt `relative`, `transform`, hoặc `contain` trên các `<div>` trung gian giữa `<article>` và title `<Link>`.
     - Eyebrow: `<p data-testid={`vocab-deck-source-${deck.deckId}`} className="font-medium text-muted-foreground text-xs uppercase tracking-wider">{formatVocabDeckSourceLabel(deck)}</p>`.
     - Title heading + stretched-link: `<h3 id={`vocab-deck-title-${deck.deckId}`} className="mt-1"><Link to="/practice/vocabulary/$deckId" params={{ deckId: deck.deckId }} className="inline-block font-semibold text-foreground text-lg tracking-tight group-hover:text-primary after:absolute after:inset-0 after:rounded-xl focus-visible:shadow-none focus-visible:outline-none focus-visible:after:shadow-[var(--focus-ring)]">{deck.title}</Link></h3>`.
     - Thanh tiến độ: `"Đã thuộc {learned}/{deck.total}"` + `"{pct}%"` (`tabular-nums`), thanh 8px phân bổ 5 cấp (`bg-vocab-lv-1..5`) + phần từ mới (`bg-muted ring-1 ring-inset ring-input/50`).
     - Footer (`flex flex-wrap items-center justify-between gap-2 mt-auto`): giữ nút CTA gọn bên phải (`ml-auto shrink-0`) và nội dung card đủ cao để tâm hình học của `<article>` luôn nằm trên stretched-link dẫn về `/$deckId`.
       - Nhóm chip trạng thái:
         - `deck.dueCount > 0`: `<span data-testid={`vocab-deck-due-${deck.deckId}`} className="inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-soft px-2.5 py-0.5 font-medium text-foreground text-xs tabular-nums"><Clock aria-hidden="true" className="size-3 text-warn" />{deck.dueCount} đến hạn</span>` (đảm bảo AA ≥ 4.5:1 cả Light/Dark!).
         - `deck.newCount > 0`: `<span data-testid={`vocab-deck-new-${deck.deckId}`} className="inline-flex items-center rounded-full border bg-background px-2.5 py-0.5 font-medium text-muted-foreground text-xs tabular-nums">{deck.newCount} từ mới</span>` (exact `"{deck.newCount} từ mới"`).
         - `done`: `<span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-2.5 py-0.5 font-medium text-foreground text-xs"><Check aria-hidden="true" className="size-3 text-success" />Đã thuộc hết</span>`.
         - Khi `activeLevel !== null && deck.levelDistribution[activeLevel - 1] > 0`: chip số từ ở cấp đang lọc.
       - Nút CTA ở footer:
         - `deck.dueCount > 0`: `<Link to="/practice/vocabulary/$deckId/session" params={{ deckId: deck.deckId }} search={{ mode: "review" }} aria-label={`Ôn ${deck.dueCount} từ trong ${deck.title}`} className={cn(buttonVariants({ variant: "default", size: "sm" }), "relative z-10 ml-auto min-h-9 shrink-0")}>Ôn <span className="tabular-nums">{deck.dueCount}</span> từ</Link>`.
         - `else if (deck.newCount > 0)`: `<Link to="/practice/vocabulary/$deckId/session" params={{ deckId: deck.deckId }} search={{ mode: "learn" }} aria-label={`Học ${deck.newCount} từ mới trong ${deck.title}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "relative z-10 ml-auto min-h-9 shrink-0")}><Plus aria-hidden="true" className="size-3.5" />Học <span className="tabular-nums">{deck.newCount}</span> từ mới</Link>`.
         - `else`: `<span aria-hidden="true" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ml-auto shrink-0")}>Xem bộ từ</span>` (trang trí trên stretched-link, không tạo tab stop trùng lặp).
- **Success criteria:** Cả 3 component đáp ứng thiết kế, WCAG AA, 320px reflow, và không chứa hex cứng.
- **Verify:** `pnpm --filter student check-types` exits 0.

### Task 3.3 — Cập nhật `VocabSuggestionList`, `VocabCoursesCta` và nối route `/practice/vocabulary`
- **Goal:** Hoàn thiện section "Gợi ý cho bạn", banner "Thư viện từ vựng", thanh tìm kiếm/bộ lọc đồng bộ URL `?f=&lv=&q=`, midnight rollover VN và toast dismiss trong `index.tsx`.
- **Target files and symbols:**
  - `apps/student/src/components/vocab/vocab-suggestion-list.tsx` (`VocabSuggestionList`)
  - `apps/student/src/components/vocab/vocab-courses-cta.tsx` (`VocabCoursesCta`)
  - `apps/student/src/routes/_auth/practice/vocabulary/index.tsx` (`Route`, `VocabOverviewPage`, `VocabOverviewContent`, `VocabOverviewContentProps`)
- **Steps:**
  1. Cập nhật `VocabSuggestionList`: sử dụng layout card của `open-design/vocabulary.html` (icon `Sparkles` + lý do/ngày ở trên, title, pill `{item.wordCount} từ` bên trái, nút ghost `"Ẩn"` + primary `"Bắt đầu học"`/`"Đang thêm…"` bên phải, lỗi `data-testid="vocab-suggestions-error"` với `role="alert" text-destructive`), đồng thời giữ nguyên `vocab-suggestions-section`, `vocab-suggestion-card-${id}`, `vocab-suggestion-note-${id}` (CHỈ render khi `Boolean(item.note?.trim())`), `vocab-suggestion-accept-${id}` (dùng `buttonVariants({ variant: "default", size: "sm" })`), `vocab-suggestion-dismiss-${id}` và các `aria-label`.
  2. Cập nhật `VocabCoursesCta`: dùng layout `.library` (`rounded-xl bg-muted p-6 flex flex-wrap items-center justify-between gap-4`) với icon `Library` trong ô `size-12 rounded-lg bg-background`, giữ `<Link data-testid="vocab-courses-cta" to="/practice/vocabulary/courses">`, dòng `"Thư viện từ vựng · ${summary.courseCount} khóa · ${summary.lessonCount} bài"` và `<span aria-hidden="true" className={cn(buttonVariants({ variant: "outline" }), "border-input")}>Khám phá thư viện</span>` (viền `--input` đạt ≥ 3:1 trên nền `bg-muted`).
  3. Cập nhật `apps/student/src/routes/_auth/practice/vocabulary/index.tsx`:
     - Gắn `validateSearch: (search: Record<string, unknown>) => parseVocabOverviewSearch(search)` lên `Route`.
     - Trong `VocabOverviewPage`, giữ `nowMs` trong `useState(() => Date.now())`, suy `todayISO = vietnamTodayISO(new Date(nowMs))`, chạy interval 60s + `visibilitychange` (pattern `apps/student/src/routes/_auth/index.tsx:161-187`) để cập nhật `nowMs` và `invalidateQueries({ queryKey: ["student", "vocab-overview"] })` khi `todayISO` sang ngày mới VN, đồng thời truyền `todayISO={todayISO}` xuống `VocabOverviewContent`.
     - Thêm `pendingSearchRef` (`class-detail-view.tsx:227-253`) trong `VocabOverviewPage` và `handleSearchChange` dùng `navigate({ to: "/practice/vocabulary", search: (prev) => buildVocabOverviewSearch(updater(parseVocabOverviewSearch(prev as Record<string, unknown>))), replace: true, resetScroll: false })`.
     - Trong `handleDismissSuggestion`, sau `dismissVocabSuggestion` + invalidate thành công, gọi `toast.success(\`Đã ẩn gợi ý “${suggestion.title}”.\`)`.
     - Trên `VocabOverviewContentProps`, giữ `searchState?: VocabOverviewSearchState`, `onSearchChange?: ...`, `todayISO?: string` là optional (fallback state cục bộ + `vietnamTodayISO()` khi uncontrolled để `vocab-course-catalog.test.tsx` render độc lập không cần Router vẫn pass).
     - Không bọc `<main>`, không thêm inline breadcrumb (`StudentShell` đã cung cấp).
     - Trong `VocabOverviewContent`, áp dụng đầy đủ `lastEmittedRef` + `debounceTimerRef` + `clearTimeout` từ `ClassMaterialsTab` (`class-materials-tab.tsx:251-286`): cả nút xóa `"X"` lẫn `"Xem tất cả bộ từ"` phải `clearTimeout(debounceTimerRef.current)` và đặt `lastEmittedRef.current = ""` + `setDraft("")` đồng bộ trước khi gọi `onSearchChange`, tránh timer cũ bắn ngược `?q=` sau khi reset hoặc ghi đè chữ đang gõ khi bấm `f`/`lv`.
     - Render header `"Từ vựng"` + mô tả `"Ôn đúng lúc bạn sắp quên — mỗi ngày vài phút là đủ."`, `VocabTodayHero` (truyền đủ `onExpired`), `VocabMemoryCard`, `VocabSuggestionList`, section `"Bộ từ đang học"` (ẩn thanh search + filter khi `data.decks.length === 0` và giữ nguyên `data-testid="vocab-decks-empty"` + copy #573; khi có deck hiển thị ô tìm kiếm debounce 300ms + nút xóa X + segmented 4 nút `flex-wrap` `Tất cả | Đến hạn | Đang học | Đã thuộc hết`, badge cấp trí nhớ đang lọc + `"Bỏ lọc"` trả focus về `[data-vocab-level="${lv}"]`, `data-testid="vocab-decks-filter-empty"` khi lọc rỗng, đúng 1 vùng `<p aria-live="polite" className="sr-only">`), và `VocabCoursesCta`.
- **Success criteria:** Tất cả các trang con/luồng điều hướng nguyên vẹn, test cũ (`vocab-course-catalog.test.tsx`, `vocab-suggestion-list.test.tsx`) giữ xanh không sửa assertion.
- **Verify:** `pnpm --filter student test -- vocab-course-catalog.test.tsx vocab-suggestion-list.test.tsx && pnpm --filter student check-types` exits 0.

### Task 3.4 — Viết bộ test UI `vocab-overview-page.test.tsx` (TDD)
- **Goal:** Bao phủ toàn bộ tương tác và invariants UI của `VocabOverviewContent` + `VocabCountdown` qua React Testing Library.
- **Target files and symbols:**
  - `apps/student/src/components/vocab/vocab-overview-page.test.tsx`
- **Steps:**
  1. Tạo `vocab-overview-page.test.tsx` với mock `@tanstack/react-router` `Link` serialize đầy đủ `params` + `search` (`mode`, `f`, `lv`, `q`, `course`), kiểm tra:
     - Render đủ 5 trạng thái Hero, kiểm exact text `vocab-overview-due-count`, `vocab-overview-new-count` (single match), `vocab-overview-streak` (`"1 ngày"`), `vocab-overview-learned`, `vocab-overview-mature`, `tỉ lệ nhớ` (`87%` / `—`), `vocab-countdown-label`.
     - Hero CTA links trỏ đúng `topDueDeck` (`?mode=review`) và `topNewDeck` (`?mode=learn`) ngay cả khi deck đầu tiên chỉ có `due > 0, new === 0`.
     - Stretched-link trên deck card trỏ `/practice/vocabulary/$deckId`, CTA footer trỏ `/practice/vocabulary/$deckId/session?mode=review|learn`, deck 0 từ không hiện `NaN%` hay `"Đã thuộc hết"`, không tạo link thứ 2 cho `"Xem bộ từ"`.
     - Bấm lọc cấp trí nhớ (`aria-pressed`), bấm `"Bỏ lọc"` trả focus về nút cấp; bấm segmented filter `due`/`learning`/`done`; gõ search tiếng Việt không dấu `"moi truong"` debounce 300ms gọi `onSearchChange`; gõ search rồi bấm reset/xóa trong vòng < 300ms huỷ timer debounce và không ghi đè ngược URL.
     - Đúng 1 phần tử `aria-live="polite"` trong DOM.
     - `VocabCountdown` với `vi.useFakeTimers()`: `onExpired` chỉ chạy 1 lần khi chạm mốc `nextDueAt` (kể cả qua `VocabTodayHero` ở trạng thái `caught-up`).
  2. Chạy toàn bộ test suite `apps/student`, `biome check .` và `check-types`.
- **Success criteria:** 100% unit tests `apps/student` pass, 0 lỗi lint/typecheck.
- **Verify:** `pnpm --filter student test && pnpm exec biome check . && pnpm check-types` exits 0.

## Verification
- `pnpm --filter student test && pnpm exec biome check . && pnpm check-types`

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
