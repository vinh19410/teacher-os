# Plan #821 — Căn thẳng icon calendar của date input & bỏ field Link Zoom

- **Issue:** https://github.com/vinh19410/teacher-os/issues/821
- **Branch:** `fix/821-date-input-remove-zoom` (base: `origin/develop`)
- **Status:** in progress

## Acceptance Criteria (Done means)

1. `SessionActionsModal` dùng `DatePickerInput` cho **Dời sang ngày** (định dạng `dd/mm/yyyy`, icon calendar căn phải, popover lịch tiếng Việt, chặn lưu khi ngày gõ không hợp lệ) và không còn render field `Link Zoom`.
2. `AddClassSessionModal` và `LessonEditForm` không còn render field Link Zoom; `LessonEditForm` giữ nguyên `lesson.zoom` gốc trong payload full-replace và xếp 3 trường `Thứ` / `Giờ (HH:MM)` / `Thời lượng (phút)` cân đối.
3. Primitive `Input` (`packages/ui/src/components/web-kit/field.tsx`, đồng bộ với `packages/ui/src/components/input.tsx`) sửa layout cho `type="date"` sao cho icon calendar căn sát mép phải và căn giữa dọc trên toàn bộ 7 ô `<Input type="date">` còn lại.
4. Pass đầy đủ `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.
5. Xác minh trực quan & lưu ảnh chụp 3 viewport (`1440×900`, `768×1024`, `375×812`) + dark mode vào `plans/reports/`.
6. Review độc lập đạt trạng thái sạch; PR mở vào `develop`, CI quality pass, merge vào `develop`, đăng POT có ảnh permalink SHA và chuyển issue sang `shipped`.

## Phases & File Ownership

| Phase | Owner | Files | Dependencies |
|---|---|---|---|
| Phase 1A | Subagent `ui-date-input` (`share`) | `packages/ui/src/components/web-kit/field.tsx`, `packages/ui/src/components/input.tsx`, `packages/ui/src/components/web-kit/field.test.tsx` | None |
| Phase 1B | Subagent `web-forms-cleanup` (`share`) | `apps/web/src/components/class-detail/session-actions-modal.tsx`, `apps/web/src/components/modals/add-class-session-modal.tsx`, `apps/web/src/components/schedule/lesson-edit-form.tsx`, `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx`, `apps/web/src/components/modals/add-class-session-modal.test.tsx`, `apps/web/src/routes/_auth/schedule.test.tsx` | None |
| Phase 2 | Orchestrator | Integrate Phase 1A + 1B, run full local gates (`biome check`, `check-types`, `pnpm test`), boot local stack on override ports (`8100`/`8101`), capture 3-viewport + dark mode screenshots in Chromium to verify alignment empirically | 1A, 1B |
| Phase 3 | Subagent `isolated-reviewer` | Read-only isolated review against `REVIEW.md`, `DESIGN.md`, and Handoff Brief; fix any findings and re-review until clean | Phase 2 |
| Phase 4 | Orchestrator | Push branch, open PR into `develop`, wait for CI quality, merge (`--merge --beta`), post POT with SHA permalink images on #821, transition label to `shipped`, clean up worktrees/processes | Phase 3 |
