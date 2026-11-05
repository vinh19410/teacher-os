---
phase: 3
title: "Đối soát trung thực ở edit mode"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 3: Đối soát trung thực ở edit mode

## Goal

Sau khi lưu bị `outcome-unknown`, bấm đối soát chỉ báo "Đã cập nhật" khi dữ liệu mới từ server khớp với nội dung đã gửi. Nếu không khớp, form được giữ nguyên để giáo viên lưu lại.

## Files to Create / Modify

- Modify: `apps/web/src/routes/_auth/assignments/new.tsx` — `handleReconcile` (dòng 831).
- Modify: `apps/web/src/routes/_auth/assignments/new-submit.test.tsx`.

## Nguyên nhân

Trong edit mode, `handleReconcile` tìm đề theo `id`. Đề này luôn tồn tại nên nhánh lỗi không bao giờ chạy, và `setSaved` hiện màn hình thành công dù server chưa ghi. `data` trong closure cũng là dữ liệu trước khi refresh. Edit mode không autosave, nên chuyển sang màn hình thành công làm mất phần đã sửa.

## Tasks & Steps

1. Viết test edit mode:
   - PATCH thực ra đã ghi, refresh trả dữ liệu mới → hiện màn hình thành công.
   - PATCH chưa ghi, refresh trả dữ liệu cũ → không hiện thành công, có thông báo lỗi, form giữ nguyên và lưu lại được.
   - Refresh thất bại → giữ hành vi `reconcile-failed` hiện tại.
2. Lấy dòng đề mới nhất sau `submit.reconcile()` thay vì `data` trong closure. Đọc snapshot mới từ query `['kernel']` qua `useQueryClient().getQueryData` và cùng mapper `data-provider.tsx` đang dùng. Nếu cách này kéo theo thay đổi lớn, dùng `useRef` theo dõi `data` và xác minh ref đã cập nhật khi refresh resolve.
3. So sánh dòng mới với giá trị đã gửi: `title`, `type`, `band`, `source`, `prompt`, `passage`, `intro`, `transcript`, `cueTopic`, `cuePoints`, `audioName`, `imageUrl`, `note`, `questions`, `optionBank`, `status`, và phần writing. Dùng cùng cách `trim()` như lúc tạo payload.
4. Không khớp: `submit.setError` với thông báo "Đã tải lại dữ liệu nhưng thay đổi của bạn chưa được lưu. Vui lòng lưu lại.", không gọi `setSaved`.
5. Không đổi hành vi đối soát của luồng tạo mới.

## Verification

- `pnpm --filter web test -- new-submit`.
- Toàn bộ gate trước khi ship: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.
