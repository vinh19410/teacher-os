# Phase 3 — Session Back-link, Tests, E2E & Verification Gates

> Mục tiêu: cập nhật E2E spec của #366 theo route mới, bổ sung luồng mới, chốt toàn bộ gates local + screenshot 3 viewport cho PR.

## 3.1 E2E spec cập nhật (`apps/e2e/specs/` — lưu ý: specs nằm ở `specs/`, không phải `src/`)

Spec hiện tại của #366 (`apps/e2e/specs/vocab-library-clone.spec.ts`) đang đi `/vocab?courseId=...` — **7 điểm sẽ vỡ, sửa theo bảng**:

| Dòng cũ | Đang assert | Sửa thành |
|---|---|---|
| :332 | `vocab-courses-section` trên `/vocab` | Section này giờ ở `/vocab/courses` (testid giữ nguyên trên page mới) |
| :335-337 | Đếm `vocab-course-card-*` trên `/vocab` | Đếm trên `/vocab/courses` sau khi bấm CTA |
| :359-360 | URL `courseId=libcourse-15` trên `/vocab` | URL `/vocab/courses/libcourse-15` |
| :369 | `vocab-course-back-btn` quay catalog inline | Quay `/vocab/courses` |
| :405 | Click deck không mang search | Click lesson card → `/vocab/libdeck-*?course=libcourse-15` |
| :427-433 | Back "← Danh sách bộ từ" kỳ vọng land `/vocab` + `vocab-deck-source-*` | Khi có `?course=` → land `/vocab/courses/libcourse-15`; assertion `vocab-deck-source` chuyển sang tương ứng UI mới (hoặc bỏ nếu không còn) |
| :434-448 | Screenshot path `plans/261019-0648-student-full-vocab-courses/screenshots/` | Đổi sang `plans/261019-2239-student-vocab-mochivocab-lessons-ui/screenshots/` (restore screenshots cũ trước commit nếu regen đụng plan #366) |

Luồng E2E mới đầy đủ:

1. **Dashboard CTA**: login student → `/vocab` → thấy `vocab-courses-cta` → click → land `/vocab/courses`.
2. **Catalog**: thấy ≥ 20 `vocab-course-card-*`; gõ search debounce → URL có `?q=`; clear.
3. **Lesson grid**: click course card đầu → `/vocab/courses/libcourse-1` → thấy `vocab-selected-course-title` + lưới `vocab-course-deck-*`; assert card đầu có subtitle VI **nguyên văn từ CSV** ("1.Trường học" — không nhân đôi số) và có `img` (src chứa CDN) hoặc placeholder.
4. **Start-here + resume**: bài chưa hoàn thành đầu tiên có `vocab-lesson-start-here`.
5. **Dialog đổi khóa**: click `vocab-course-switcher` → dialog hiện danh sách khóa → chọn khóa khác → URL đổi course + grid đổi theo → đóng.
6. **Vào session + back giữ course**: click lesson card → URL `/vocab/libdeck-*?course=libcourse-1` → CTA "Học từ mới" vào `/vocab/$deckId/session?course=libcourse-1` → Learn ≥1 từ → `handleExit` thoát về `/vocab/libdeck-*?course=libcourse-1` → bấm "← Bài học trong khóa" → `/vocab/courses/libcourse-1`.
7. **Progress hiển thị**: sau khi học, quay lại course page thấy chip "Đang học 1/N" (invalidate `["student","vocab-library"]` đã có từ #366 — verify không stale).

Lưu ý vận hành E2E (memory): boot wipe DB + mail-log mỗi lần chạy; **boot đã tự migrate + seed library** (`apps/e2e/src/boot.ts:84-87` gọi `migrate()` + `seedVocabLibrary(client)` — red-team đã xác nhận, KHÔNG cần bước seed thủ công); override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`.

## 3.2 Screenshots 3 viewport

- Theo `REVIEW.md`: `1440×900`, `768×1024`, `375×812` cho 3 màn: `/vocab/courses`, `/vocab/courses/libcourse-1` (grid bài), dialog đổi khóa mở (desktop + mobile).
- Kiểm keyboard focus: ribbon → dialog → item → Enter; trap focus trong dialog; "← Tất cả khóa học" reachable bằng Tab.
- Screenshot lưu vào plan `screenshots/` (precedent #366) và đính kèm PR body.

## 3.3 Unit/integration tests tổng hợp

- `apps/student`: đã covered ở Phase 2 (status helper, dialog, lesson card, CTA, back-link condition).
- `apps/server`: test `GET /vocab/library/courses/:courseId/decks` response chứa `description` (Phase 1); giữ nguyên test hiện có của #366.
- `packages/api`: contract parse fixture có `description: null` (deck thiếu mô tả CSV) vẫn pass.
- Không thêm test mới cho `packages/db` schema (cột nullable, migration smoke qua db test suite hiện có).

## 3.4 Verification gates (chạy đủ, theo thứ tự)

```bash
pnpm check
pnpm check-types
pnpm --filter @teacher-os/db test
pnpm --filter @teacher-os/api test
pnpm --filter server test
pnpm --filter student test
pnpm --filter web test          # không đụng web nhưng chạy chéo theo precedent
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e
```

E2E boot **đã tự migrate + seed library từ CSV** (`apps/e2e/src/boot.ts:84-87`) — description có sẵn sau Phase 1, không cần thao tác thêm.

## 3.5 Deploy checklist

1. `db:migrate:deploy` (0040) lên staging → chạy `seedVocabLibrary` re-seed (D1 REST, upsert idempotent) → verify counts.
2. Deploy worker (`apps/server`) + `apps/student` **cùng lúc, cùng release train** (runtime strict-parse — không được lệch pha, xem plan.md Dependencies).
3. Post-deploy smoke: `/vocab/courses` load, lesson grid có description, ảnh CDN hiển thị.
4. Rollback app an toàn (cột nullable) — nhưng rollback phải quay lại CẢ server lẫn student về cùng commit cũ; giữ nguyên migration 0040.

## Success Criteria

- [x] E2E mới pass toàn bộ 7 bước ở 3.1 (kèm spec cũ đã cập nhật, không còn tham chiếu `/vocab?courseId=`).
- [x] Screenshot 3 viewport × 3 màn nằm trong plan `screenshots/` + PR; không tràn ngang 375px (grid 2 cột, card co giãn).
- [x] Tất cả lệnh gates ở 3.4 exit 0.
- [x] PR body tiếng Việt theo precedent repo, kèm bảng so sánh trước/sau + Relates-to issue.

## Files Owned

- `apps/e2e/specs/vocab-library-clone.spec.ts` (7 điểm sửa §3.1) + mọi spec khác tham chiếu `/vocab?courseId=`
- `plans/261019-2239-student-vocab-mochivocab-lessons-ui/screenshots/**`
- PR body draft
