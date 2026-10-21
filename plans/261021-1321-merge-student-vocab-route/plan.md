---
title: "Student: gộp /vocab vào /practice/vocabulary thành một path duy nhất"
description: "Học viên đang có hai cửa vào từ vựng (/vocab hub đầy đủ và /practice/vocabulary lưới deck rút gọn đọc cùng API). Chuyển toàn bộ hub + route con sang /practice/vocabulary/*, /vocab/* redirect giữ query, bỏ mục nav 'Từ vựng' riêng và xoá VocabPracticeCatalog."
status: pending
priority: P2
effort: "3h"
issue: 387
branch: ai-handle-issue-387
tags: [frontend, student, routing, vocab]
blockedBy: []
blocks: []
created: 2026-10-21
---

# Gộp route từ vựng của học viên về `/practice/vocabulary`

## Overview

App student (`apps/student`) hiện có hai trang cho cùng một việc:

| Path | Nội dung | Nguồn dữ liệu |
|---|---|---|
| `/vocab` (+ `/vocab/$deckId`, `/vocab/$deckId/session`, `/vocab/courses`, `/vocab/courses/$courseId`) | Hub đầy đủ: gợi ý (#363), 5 thống kê SRS, countdown, phân bổ level, danh sách deck, CTA khóa học | `useVocabOverview` |
| `/practice/vocabulary` | `VocabPracticeCatalog`: lưới deck rút gọn + progress bar, mỗi card link sang `/vocab/$deckId` | `useVocabOverview` (cùng query) |

Sidebar cũng có hai mục trùng: "Luyện tập › Vocabulary" và "Từ vựng". Hai path
dư thừa, dữ liệu như nhau, người học không biết nên vào đâu.

**Quyết định (user chốt 2026-10-21):**

1. Canonical là **`/practice/vocabulary`**. Hub đầy đủ của `/vocab` chuyển vào đây;
   route con dời sang `/practice/vocabulary/$deckId`, `/practice/vocabulary/$deckId/session`,
   `/practice/vocabulary/courses`, `/practice/vocabulary/courses/$courseId`.
2. **Bỏ mục nav "Từ vựng" riêng**; chỉ còn "Luyện tập › Vocabulary".
3. `/vocab/*` cũ **redirect (replace)** sang path mới, giữ nguyên phần đuôi và query
   (`?course=`, `?mode=`, `?q=`) để bookmark/link cũ không gãy.

## Scope Challenge

- Existing code: toàn bộ UI hub, deck detail, session, courses đã có — chỉ dời file
  và đổi link, không viết UI mới. `VocabPracticeCatalog` trở nên thừa và bị xoá.
- Requested scope: một path duy nhất cho từ vựng ở mode student; giao trọn.
- Complexity: ~14 file sửa/dời (5 route dời, 2 route redirect, nav, trang chủ,
  `$skill.tsx`, 2 component vocab, 1 unit test, 4 e2e spec). Không thêm service/class.
- Selected mode: HOLD SCOPE.

## Non-goals

- Không đổi app giáo viên (`apps/web` `/vocab` hub giáo viên giữ nguyên — e2e
  `vocab-hub-suggestion.spec.ts` có phần teacher dùng `WEB_ORIGIN/vocab`, KHÔNG sửa phần đó).
- Không đổi API `/api/student/vocab/*`, query key React Query, schema DB.
- Không redesign UI hub; chỉ đồng bộ header theo khuôn trang Luyện tập.
- Không thêm highlight active cho nav con (xem Open questions).

## Phases

| # | Phase | Status | Depends | File |
|---|---|---|---|---|
| 1 | Dời route + redirect legacy + dọn nav/link | pending | — | [phase-01-route-move-and-redirect.md](phase-01-route-move-and-redirect.md) |
| 2 | Cập nhật test + e2e + verify 3 viewport | pending | 1 | [phase-02-tests-and-e2e.md](phase-02-tests-and-e2e.md) |

## Acceptance Criteria

1. `/practice/vocabulary` render hub đầy đủ (gợi ý, 5 thống kê, countdown, level,
   danh sách deck, CTA khóa học) với `data-testid="vocab-overview-page"`.
2. Deck detail, session, courses, course detail chạy dưới `/practice/vocabulary/*`;
   mọi link nội bộ (card deck, gợi ý accept, CTA, breadcrumb "←", exit session,
   lesson card, course switcher) trỏ path mới — `grep -rn "\"/vocab" apps/student/src`
   (trừ file redirect legacy và `routeTree.gen.ts`) trả rỗng.
3. Truy cập `/vocab`, `/vocab/<deckId>?course=X`, `/vocab/<deckId>/session?mode=review`,
   `/vocab/courses?q=IELTS`, `/vocab/courses/<id>` đều redirect (replace history)
   sang path tương ứng dưới `/practice/vocabulary`, query giữ nguyên.
4. Sidebar không còn mục "Từ vựng"; "Luyện tập › Vocabulary" mở hub; khi ở mọi
   trang `/practice/vocabulary/*` thì section "Luyện tập" active.
5. `VocabPracticeCatalog` bị xoá; `$skill.tsx` không còn nhánh `vocabulary`.
6. Gate local xanh: `pnpm check`, `pnpm check-types`, `pnpm --filter student test`,
   các e2e spec vocab + student-practice + student-class-detail (port override AGENTS.md),
   rồi full e2e trước khi merge (memory: full e2e before merge).

## Risks

| Rủi ro | Giảm thiểu |
|---|---|
| Static segment `practice/vocabulary/` xung đột với `practice/$skill` | TanStack Router ưu tiên static hơn param; bỏ `vocabulary` khỏi `SKILL_SLUGS` để `$skill` không bao giờ nhận nó. Verify bằng `routeTree.gen.ts` sau `vite build`. |
| `$deckId.tsx` là layout có child `session` (dùng `hasChildMatch` + `<Outlet/>`) | Dời nguyên cặp file giữ cấu trúc flat-route `$deckId.tsx` + `$deckId.session.tsx`; sửa `createFileRoute` id. |
| Link/bookmark cũ (email, lịch sử trình duyệt) | Redirect legacy splat giữ đuôi path + search. |
| E2E teacher `/vocab` bị sửa nhầm | Chỉ sửa assertion có `STUDENT_ORIGIN`/trang student. |

## Open questions

- Nav con "Vocabulary" hiện không tự highlight (`useStudentActiveKey` chỉ trả `practice`,
  cả 5 skill đều vậy) — giữ nguyên hành vi hiện tại, ngoài scope.
