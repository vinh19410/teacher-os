---
phase: 3
title: "Màn sửa đề trong apps/web"
status: pending
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
- Move: `apps/profile/public/kiem-tra-dau-vao/questions.json` và `audio/*.mp3` sang `apps/web/public/placement-seed/`, bỏ `status`, `version`, `src`
- Modify: `apps/web/src/components/layout/sidebar.tsx` (mục nav, `ACTIVE_KEY_BY_PREFIX`), `apps/web/src/security-headers.ts`
- Modify: `apps/server/src/lead-catalog-drift.test.ts` (dòng 107-115 đang đọc `questions.json` ở profile: đổi sang đường dẫn đề gốc mới, thêm kiểm đề gốc qua `validatePlacementForPublish` khi gắn `audioId` giả)

## Tasks & Steps

1. Đọc `DESIGN.md` và `REVIEW.md` trước. Dùng `PageHead`, `Card`, `Button`, `Modal`, `inputCls` như `/leads`.
2. Repo theo mẫu `lib/repos/leads.ts`: `fetchPlacementTest`, `saveDraft`, `uploadAudio` (XMLHttpRequest để có tiến trình, như `uploadLibraryAudio` của admin), `fetchAudioBlobUrl`, `publishPlacementTest`.
3. Bố cục màn:
   - Đầu trang: trạng thái "Đã phát hành v{n} lúc …" hoặc "Chưa phát hành", nhãn "Có thay đổi chưa phát hành", nút Lưu nháp và Phát hành.
   - Mục Phần 1: danh sách câu, sửa `prompt`, 4 đáp án, radio đáp án đúng, `kind`, `level`; thêm, xóa, đổi thứ tự.
   - Mục Phần 2: danh sách đoạn nghe, sửa tiêu đề, `level`, `maxPlays`, audio; mỗi đoạn có câu hỏi như trên.
   - Mục Ngưỡng: bảng `min`, `max`, `cefr`, khóa (select từ `LEAD_COURSE_LABELS`), hiện tổng điểm hiện tại.
   - `isLeadOrg === false` thì hiện cảnh báo org này không gắn với trang profile.
4. Luồng lưu: state nháp cục bộ, `dirty` so với bản đã tải. Có guard `beforeunload` và chặn điều hướng nội bộ bằng `useBlocker` của TanStack Router khi còn thay đổi chưa lưu; `apps/web` chưa có precedent cho việc này nên viết gọn trong route. Nhận 409 thì báo "Đề đã được sửa ở tab khác, tải lại để tiếp tục", không ghi đè.
5. Luồng Phát hành: lưu nháp nếu còn dirty, chạy `validatePlacementForPublish` ở client để hiện lỗi và cuộn tới câu lỗi. Hợp lệ thì mở hộp xác nhận nêu số câu, số đoạn và cảnh báo học viên đang làm dở sẽ phải làm lại; xác nhận mới gọi publish. Lỗi 422 từ server hiện cùng dạng.
6. Nhập đề gốc: khi `draft === null`, hiện trạng thái rỗng với nút "Nhập đề gốc (30 câu, 5 audio)". Tải `questions.json` và 5 MP3 từ `/placement-seed/`, upload lần lượt, xong mới `saveDraft`. Lỗi giữa chừng thì báo, chưa tạo nháp, bấm lại được.
7. Thêm `media-src 'self' blob:` vào CSP, rồi xác nhận `<audio src="blob:…">` phát được dưới header thật. `submission-media-player` cũng đi đường `blob:` nên được hưởng lợi; không sửa gì thêm ở đó.
8. Ẩn mục sidebar với vai trò không có `canAccessFinance`, bằng cách thêm key vào `FINANCE_NAV_KEY_MAP` mà `teacherNavForViewer` (`sidebar.tsx:122`) đang lọc.

## Verification

- `pnpm --filter web test placement-test`: `content-model` thêm, xóa, đổi thứ tự; ngưỡng cập nhật tổng điểm; render lỗi 409 và 422; không cho phát hành khi còn lỗi.
- Test `security-headers` khẳng định có `media-src 'self' blob:`.
- Kiểm UI ở 1440×900, 768×1024, 375×812 và focus bàn phím theo `REVIEW.md`; PR kèm screenshot và chạy `pnpm design:compare`.
- `pnpm exec biome check .` và `pnpm check-types` qua.
