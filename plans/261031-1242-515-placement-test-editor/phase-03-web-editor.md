---
phase: 3
title: "Màn sửa đề trong apps/web"
status: completed
priority: P2
effort: "1.5d"
dependencies: [2]
---

# Phase 3: Màn sửa đề trong apps/web

## Goal

Giáo viên làm toàn bộ việc sửa đề, thay audio, nhập đề gốc và phát hành trên một màn.

## Files to Create / Modify

- Create: `apps/web/src/routes/_auth/placement-test/index.tsx` (kèm test)
- Create: `apps/web/src/components/placement-test/` gồm `question-card.tsx`, `clip-card.tsx`, `clip-audio-field.tsx`, `bands-editor.tsx`, `publish-dialog.tsx`, `seed-empty-state.tsx`, `content-model.ts` (kèm test)
- Create: `apps/web/src/lib/repos/placement-test.ts`
<!-- Updated: Red Team Review - routes-matcher.ts + app-shell.tsx + useFinanceRouteGuard + MIME check in fetchAudioBlobUrl + copy seed files first so profile build stays green until Phase 4 -->
- Copy: `apps/profile/public/kiem-tra-dau-vao/questions.json` và `audio/*.mp3` sang `apps/web/public/placement-seed/` (`questions.json` bỏ `status`, `version`, đổi `src` thành `"audioId": null`; 5 file MP3 đặt tại `apps/web/public/placement-seed/clip-1.mp3`..`clip-5.mp3` khớp `${clip.id}.mp3`; bản cũ ở `apps/profile` xóa ở Phase 4 cùng lúc sửa `build.mjs`)
- Modify: `apps/web/src/components/layout/sidebar.tsx` (mục nav, `FINANCE_NAV_KEY_MAP`, `ACTIVE_KEY_BY_PREFIX`), `apps/web/src/components/layout/sidebar.test.tsx`, `apps/web/src/components/layout/app-shell.tsx` (`ROUTE_CRUMBS`), `apps/web/src/routes-matcher.ts` (`VALID_EXACT_ROUTES`, `STATIC_ASSET_EXT_REGEX` thêm `mp3`), `apps/web/src/routes-matcher.test.ts`, `apps/web/src/security-headers.ts`, `apps/web/src/security-headers.test.ts`
- Modify: `apps/server/src/lead-catalog-drift.test.ts` (dòng 107-115: đọc đề gốc ở `apps/web/public/placement-seed/questions.json`, thêm kiểm đề gốc qua `validatePlacementForPublish` khi gắn `audioId` UUID giả)

## Tasks & Steps

1. Đọc `DESIGN.md` và `REVIEW.md` trước. Dùng `PageHead`, `Card`, `Button`, `Modal`, `inputCls` như `/leads`.
2. Repo `apps/web/src/lib/repos/placement-test.ts` theo mẫu `lib/repos/leads.ts` và `lib/repos/grading.ts`: `fetchPlacementTest`, `saveDraft`, `uploadAudio` (XMLHttpRequest `PUT /api/placement-test/audio` kèm `X-File-Name: encodeURIComponent(file.name)` để có tiến trình như `uploadLibraryAudio`), `fetchAudioBlobUrl` (kiểm `normalizeMediaType(res.headers.get("Content-Type"))` thuộc `LIBRARY_AUDIO_MIME` rồi bọc `new Blob([await res.blob()], { type })` trước `URL.createObjectURL`), `publishPlacementTest`.
3. Bố cục màn (`apps/web/src/routes/_auth/placement-test/index.tsx`):
   - Gọi `useFinanceRouteGuard()` ở đầu component để chuyển hướng `ta` và `class_teacher` về `/dashboard` như `/debts` và `/tuition`.
   - Đầu trang: trạng thái "Đã phát hành v{n} lúc …" hoặc "Chưa phát hành", nhãn "Có thay đổi chưa phát hành" (khi `dirty` từ server hoặc có thay đổi cục bộ chưa lưu), nút "Lưu nháp" và "Phát hành".
   - Mục Phần 1: danh sách câu, sửa `prompt`, 4 đáp án, radio đáp án đúng, `kind`, `level`; thêm, xóa, đổi thứ tự.
   - Mục Phần 2: danh sách đoạn nghe, sửa tiêu đề, `level`, `maxPlays`, audio (upload + nghe thử qua `blob:`); mỗi đoạn có câu hỏi như trên; thêm, xóa, đổi thứ tự đoạn và câu.
   - Mục Ngưỡng: bảng `min`, `max`, `cefr`, khóa (select từ `LEAD_COURSE_LABELS`), hiện tổng điểm hiện tại; thêm, xóa ngưỡng.
   - `isLeadOrg === false` thì hiện cảnh báo org này không gắn với trang profile.
4. Luồng lưu: state nháp cục bộ, `hasUnsavedChanges` so với bản đã tải/lưu. Có guard `beforeunload` và chặn điều hướng nội bộ bằng `useBlocker` của TanStack Router khi còn thay đổi chưa lưu. Nhận 409 thì báo "Đề đã được sửa ở tab khác, tải lại để tiếp tục", không ghi đè.
5. Luồng Phát hành: lưu nháp trước nếu còn `hasUnsavedChanges`, chạy `validatePlacementForPublish` ở client để hiện danh sách lỗi và cuộn tới phần/câu lỗi. Hợp lệ thì mở hộp xác nhận nêu số câu, số đoạn và cảnh báo học viên đang làm dở sẽ phải làm lại; xác nhận mới gọi `publishPlacementTest`. Lỗi 422 từ server hiện cùng dạng.
6. Nhập đề gốc: khi `draft === null`, hiện trạng thái rỗng với nút "Nhập đề gốc (30 câu, 5 audio)". Tải `/placement-seed/questions.json` và 5 file `/placement-seed/${clip.id}.mp3`, upload lần lượt qua `uploadAudio`, gán `audioId` vào từng đoạn, xong mới `saveDraft(0, content)`. Lỗi giữa chừng thì báo lỗi, chưa tạo nháp, bấm lại được.
7. Thêm `media-src 'self' blob:` vào `SECURITY_HEADERS["Content-Security-Policy"]` trong `apps/web/src/security-headers.ts` và cập nhật `security-headers.test.ts`.
8. Mở route `/placement-test` và đuôi `.mp3` trong `apps/web/src/routes-matcher.ts` (`VALID_EXACT_ROUTES` + `STATIC_ASSET_EXT_REGEX`), thêm `"placement-test"` vào `TEACHER_NAV` (cạnh `/leads`), `FINANCE_NAV_KEY_MAP` và `ACTIVE_KEY_BY_PREFIX` trong `sidebar.tsx`, và thêm `"/_auth/placement-test/": ["Bài test đầu vào"]` vào `ROUTE_CRUMBS` trong `app-shell.tsx`.

## Verification

- Verify: `pnpm --filter web test placement-test`, `pnpm --filter web test routes-matcher`, `pnpm --filter web test sidebar`, `pnpm --filter web test security-headers` exit 0 (`content-model` thêm, xóa, đổi thứ tự; ngưỡng cập nhật tổng điểm; render lỗi 409 và 422; không cho phát hành khi còn lỗi; `media-src 'self' blob:` có mặt; route drift guard xanh).
- Verify: `pnpm --filter server test lead-catalog-drift` exits 0.
- Verify: `pnpm exec biome check .` and `pnpm check-types` exit 0.

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
