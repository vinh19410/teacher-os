---
title: "Student Vocab Courses & Lessons UI kiểu MochiVocab (lưới bài học có ảnh, ribbon khóa học, resume)"
description: "Làm lại trải nghiệm chọn khóa học và bài học từ vựng trên Student Portal theo mô hình mochivocab: trang lưới bài học riêng với ảnh bìa, tên bài đánh số EN/VI, trạng thái hoàn thành/đang học, điểm 'Bắt đầu tại đây' và resume tự động."
status: completed
priority: P1
effort: 14h
issue: 369
branch: ai-handle-issue-369
tags: [feature, frontend, database, vocab, student-app, ui]
blockedBy: []
blocks: []
created: 2026-10-19
---

# Student Vocab Courses & Lessons UI kiểu MochiVocab

## Overview

Issue #366 đã cho học viên duyệt 20 khóa học / 968 bài từ vựng, nhưng trải nghiệm hiện tại là một catalog text đơn giản nằm cuối trang `/vocab` (card 2 cột, không ảnh, không mô tả tiếng Việt, không trạng thái bài học). Kế hoạch này làm lại **phần chọn khóa học + danh sách bài học** theo mô hình mochivocab (learn.mochidemy.com/learn — phân tích REA đầy đủ tại [`plans/reports/2026-10-19-mochivocab-learn-rea.md`](../reports/2026-10-19-mochivocab-learn-rea.md)):

1. **DB Schema & Migration `0040` (`vocab_library_deck.description`)**: Thêm cột `description` (nullable, additive 1 chiều — precedent `0039`) để lesson card hiển thị tên bài tiếng Việt đánh số ("84.Nhận thức của con người" — chuỗi CSV **đã chứa sẵn số thứ tự**, render nguyên văn như mochivocab, không cộng thêm prefix `sortOrder.`). Seed mapping thêm `lessonDescription` từ CSV, contract API thêm `description` cho cả teacher library deck lẫn student library deck.
2. **Tách route theo mô hình mochivocab**: `/vocab` giữ vai trò dashboard (stats, gợi ý, bộ từ đang học + CTA); thêm `/vocab/courses` (catalog 20 khóa, search URL param) và `/vocab/courses/$courseId` (trang lưới bài học riêng — ribbon tên khóa mở Dialog đổi khóa, lesson card có ảnh bìa CDN + tên VI đánh số + trạng thái, điểm "Bắt đầu tại đây", auto-scroll tới bài chưa hoàn thành đầu tiên).
3. **Luồng vào session liền mạch**: Từ lesson card bấm vào bài → `/vocab/$deckId?course=<courseId>` (engine SRS #359 giữ nguyên 100%); param `course` được preserve xuyên suốt qua session (`/vocab/$deckId/session`) và `handleExit` — nút quay lại của session trở về đúng trang lưới bài học của khóa.

Dữ liệu ảnh bìa **đã sẵn sàng**: `vocab_library_deck.image_url` đã được seed từ CSV (#361, URL CDN mochidemy, ~4.7KB/ảnh, đã verify tải OK qua redirect 301) và contract student deck đã expose `imageUrl` — chỉ thiếu UI sử dụng.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Migration `0040` thêm `vocab_library_deck.description` + seed `lessonDescription` + contract `description` (nullable) trên `vocabLibraryDeckSchema` và `vocabStudentLibraryDeckSchema`, mọi producer response cập nhật đồng bộ (`.strict()` additive) | P1 |
| 2 | Route `/vocab/courses/$courseId`: lưới lesson card kiểu mochivocab — ảnh bìa (`imageUrl`, object-contain, fallback text khi CDN lỗi), `{description}` VI nguyên văn từ CSV + `title` EN, trạng thái **Hoàn thành** / **Đang học x/y** / mới, mũi tên "Bắt đầu tại đây" ở bài chưa hoàn thành đầu tiên, auto-scroll resume, responsive grid dày (mobile 2 → desktop 5–6 cột) | P1 |
| 3 | Ribbon tên khóa học là button mở **Dialog đổi khóa** (danh sách 20 khóa + progress + click điều hướng) + nút "← Tất cả khóa học" về `/vocab/courses`; trang `/vocab/courses` có search theo URL search param debounce ~300ms (quy ước list page repo) | P1 |
| 4 | `/vocab` dashboard bỏ inline catalog (`VocabCourseCatalog`), thay bằng section CTA "Khóa học từ vựng" (+ danh mục khóa đang học rút gọn); session `/vocab/$deckId` có back-link thông minh về course page khi đến từ lesson grid (`?course=` param) | P1 |
| 5 | Pass toàn bộ gates local: `pnpm check`, `pnpm check-types`, unit tests các package đụng đến, E2E cập nhật theo route mới + screenshot 3 viewport (1440×900, 768×1024, 375×812) | P1 |

## Non-goals

- **Không** port FlowLearningGame overlay của mochivocab — engine SRS 5 cấp độ và route session `/vocab/$deckId` (#359) giữ nguyên.
- **Không** thêm premium lock / giới hạn 3 bài trial / banner upsell (sản phẩm không có tier trả phí cho vocab).
- **Không** thêm multi-path lộ trình (path_basic/ielts/toeic…) — dùng `sortOrder` hiện có của 20 khóa.
- **Không** thêm 2 khóa mới của mochidemy (id 25, 26) — scope là UI, dữ liệu catalog giữ 20 khóa.
- **Không** tự host / proxy ảnh bìa (968 ảnh ~4.5MB) — hotlink CDN mochidemy như precedent `audioUrl`, có fallback text khi ảnh lỗi.
- **Không** thay đổi clone flow giáo viên (#361), gợi ý bộ từ (#363), luồng SRS dual-source (#366).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [DB Migration 0040, Seed & Contracts (deck description)](./phase-01-db-contracts.md) | Completed |
| 2 | [Student Routes: /vocab/courses Catalog + Lesson Grid kiểu MochiVocab](./phase-02-student-routes-ui.md) | Completed |
| 3 | [Session Back-link, Tests, E2E & Verification Gates](./phase-03-tests-e2e-gates.md) | Completed |

## Dependencies

- Phase 1 là nền cho Phase 2 (lesson card cần `description`) và Phase 3 (contract test).
- Phase 2 định nghĩa route mới + điều hướng; Phase 3 cập nhật E2E spec cũ của #366 theo route mới và chốt verification.
- **Deploy order (bắt buộc cùng release train)**: migration `0040` + re-seed library (D1 `seedVocabLibrary` upsert idempotent) TRƯỚC; sau đó deploy `apps/server` + `apps/student` **cùng lúc** — client runtime strict-parse (`repos/vocab.ts` gọi `.parse()`), server cũ thiếu key `description` làm client mới đổ; server mới trả thêm key cũng làm SPA cũ đang cache parse fail (`.strict()` chặn unknown key). Không được deploy lệch pha server/student.

## Success Criteria

- [x] Học viên vào `/vocab` thấy dashboard (stats + gợi ý + bộ từ đang học + CTA "Khóa học từ vựng"), bấm CTA → `/vocab/courses` thấy đủ 20 khóa có progress cá nhân, search hoạt động theo URL param.
- [x] Chọn khóa → `/vocab/courses/libcourse-1` hiển thị lưới 100 bài: mỗi card có ảnh bìa (nếu CDN lỗi thì card vẫn hiển thị dạng text), tên EN + dòng VI đánh số nguyên văn từ CSV ("1.Trường học" — không nhân đôi số); bài đã học hết có trạng thái Hoàn thành, bài đang học có "Đang học x/y", bài chưa hoàn thành đầu tiên có "Bắt đầu tại đây" và trang auto-scroll tới đó.
- [x] Bấm ribbon tên khóa mở Dialog đổi khóa (danh sách đầy đủ, đang chọn được đánh dấu), chọn khóa khác điều hướng sang course page mới không reload shell.
- [x] Bấm lesson card → vào session SRS `/vocab/libdeck-*?course=libcourse-1`; học xong thoát khỏi session (handleExit) vẫn giữ `?course=`; nút quay lại trở về đúng `/vocab/courses/libcourse-1`.
- [x] `vocab_library_deck.description` được seed đúng từ CSV `lessonDescription` (re-seed idempotent, verify counts OK); mọi response API chứa `description` (teacher + student).
- [x] Toàn bộ gates pass: `pnpm check`, `pnpm check-types`, `pnpm --filter @teacher-os/db test`, `pnpm --filter @teacher-os/api test`, `pnpm --filter server test`, `pnpm --filter student test`, E2E `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e`, UI đạt `DESIGN.md`, không tràn ngang 3 viewport, screenshot kèm PR.

## Red Team & Validation Summary

Plan đã được phản biện độc lập (4 persona: Security Adversary & Fact Checker, Failure Mode Analyst, Assumption Destroyer, Scope Checker) với 10 tuyên bố đối chiếu trực tiếp codebase. Các phát hiện đã được resolve vào plan:

| # | Mức | Phát hiện | Giải pháp đã tích hợp |
|---|-----|-----------|----------------------|
| B1 | Critical | CSV `lessonDescription` **đã chứa prefix số** "N." (917/968 dòng) — render `{sortOrder}. {description}` sẽ nhân đôi số ("84. 84.Nhận thức...") | Chốt render **nguyên văn `{description}`** (faithful mochivocab — mochi cũng render description có sẵn số); bỏ prefix `sortOrder.` khỏi lesson card (Phase 2 §2.3, Phase 1 §1.6, E2E Phase 3) |
| A1 | High | "Deploy không cần cũng chạy được" là SAI: client runtime strict-parse (`repos/vocab.ts` `.parse()`) — server/client lệch pha là catalog đổ | Dependencies đã sửa: server + student **bắt buộc cùng release train** sau migration + re-seed |
| B2 | High | Param `?course=` chết khi qua `/vocab/$deckId/session`: CTA session không mang search, `handleExit` không preserve | Phase 2 §2.5: session route thêm `course` vào validateSearch, CTA truyền search, `handleExit` navigate giữ `course` |
| A2 | Medium | 4 test exact-shape sẽ đỏ lần chạy đầu nếu không biết trước | Phase 1 liệt kê đủ 4 site: `vocab-contracts.test.ts:291-299`, `:587-607`, `vocab-library.test.ts:291-309`, `vocab.test.ts:1310-1331` |
| B3 | Medium | E2E cũ #366 (`apps/e2e/specs/vocab-library-clone.spec.ts:332-448`) vỡ 7 điểm khi bỏ inline catalog | Phase 3 §3.1 enumerate 7 điểm sửa + screenshot path đổi sang plan mới; giữ testid `vocab-courses-section`/`vocab-selected-course-title`/`vocab-course-deck-*` trên UI mới |
| B4 | Medium | 47 deck CSV có description rác dạng "10 từ vựng" (không phải tên bài) | Phase 2 §2.3: helper subtitle fallback — description null HOẶC match `^\d+\s*từ vựng$` → chỉ hiện title |
| C2/D1 | Medium | Shortcut dashboard "className name-matching → courseId" là heuristic mỏng (overview deck item không có courseId, `className` = tên khóa) | Cắt shortcut — dashboard chỉ CTA thuần (`vocab-courses-cta`) |
| A3 | Low | Plan ghi spec ở `apps/e2e/src/**` — specs thật ở `apps/e2e/specs/` | Phase 3 đã sửa đường dẫn |
| B5 | Low | Empty-state `/vocab` copy "bên dưới..." sai chỉ hướng sau khi bỏ catalog | Phase 2 §2.4 cập nhật copy trỏ CTA |
| C3 | Low | packages/ui KHÔNG có dialog primitive | Chốt: tự viết overlay theo pattern `quiz-lifecycle-dialogs.tsx` (`role="dialog"`, Esc, focus-trap, list overflow-y) |

Confirm từ red-team (không cần đổi plan): TanStack Router `^1.170` static-beats-dynamic (`isFrameMoreSpecific` so `statics`) — `/vocab/courses` không bao giờ match thành `deckId="courses"`; e2e `boot.ts:84-87` **tự migrate + seed library** mỗi lần chạy (không cần bước seed thủ công); chỉ có đúng 2 producer của deck schema (`vocab.ts:548`, `vocab-library.ts:135`) đều select toàn cột; D1 100-biến không bị ảnh hưởng (thêm cột không thêm bind); suggestion flow (#363) không dính; migration tooling = `pnpm --filter @teacher-os/db db:generate` (drizzle-kit, journal tự update, 0040 là số kế tiếp).

### Whole-Plan Consistency Sweep
- Đã rà soát toàn bộ `plan.md` và `phase-01`..`phase-03` đối chiếu với 10 quyết định từ Red Team & Validation:
  - Sửa sót dòng Goal #2 trong `plan.md` (bỏ `{sortOrder}.` trước `{description}` để khớp hoàn toàn với B1 ở Overview, Success Criteria, Phase 1 §1.7, Phase 2 §2.3, Phase 3 §3.1).
  - Đường dẫn E2E (`apps/e2e/specs/vocab-library-clone.spec.ts`), quy tắc preserve `?course=` qua `/vocab/$deckId/session`, helper `deriveLessonSubtitle` lọc `"10 từ vựng"`, và yêu cầu deploy cùng release train (`apps/server` + `apps/student`) đã nhất quán xuyên suốt 4 file.
- Trạng thái: **0 mâu thuẫn tồn đọng (Ready for implementation)**.

## References

- REA report mochivocab: [`plans/reports/2026-10-19-mochivocab-learn-rea.md`](../reports/2026-10-19-mochivocab-learn-rea.md)
- Plan nền tảng #366: [`plans/261019-0648-student-full-vocab-courses/plan.md`](../261019-0648-student-full-vocab-courses/plan.md)
- Quy ước UI list page: `DESIGN.md`, `apps/web/src/components/ui/chip-filter.tsx`, route `/assignments`
