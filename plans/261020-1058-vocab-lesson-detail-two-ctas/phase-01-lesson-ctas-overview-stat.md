---
phase: 1
title: "UI: 2 nút ở lesson detail, session mode, thẻ Từ mới tổng"
status: pending
effort: 2h
---

# Phase 1 — 2 nút Ôn tập / Bắt đầu học + thẻ Từ mới tổng

## Files

| File | Action |
|---|---|
| `apps/student/src/routes/_auth/vocab/$deckId.tsx` | modify — bỏ grid 3 thẻ, thay CTA bằng 2 nút |
| `apps/student/src/routes/_auth/vocab/$deckId.session.tsx` | modify — `validateSearch` thêm `mode`, truyền xuống view |
| `apps/student/src/components/vocab/vocab-session-view.tsx` | modify — prop `mode?: "learn" \| "review"` quyết định engine |
| `apps/student/src/routes/_auth/vocab/index.tsx` | modify — thêm thẻ Từ mới tổng vào hàng thống kê |

## Steps

1. **Session route `mode` search param** (`$deckId.session.tsx`):
   - `validateSearch` trả `{ course?: string; mode?: "learn" | "review" }`; `mode` chỉ nhận đúng `"learn"`/`"review"`, giá trị khác → `undefined`.
   - Truyền `mode` vào `<VocabSessionView mode={mode} … />`.
   - `handleExit` giữ nguyên: điều hướng về `/vocab/$deckId` chỉ với `course` (không mang `mode`).
2. **`VocabSessionView`**: thêm prop tùy chọn `mode`. Trong khối tạo engine (chỗ `hasNewCards ? "learn" : "review"`):
   - `const useLearn = mode === "review" ? false : hasNewCards;` (`mode === "learn"` mà không còn từ mới → fallback review; `mode` undefined → hành vi cũ).
   - Thay mọi chỗ dùng `hasNewCards` để chọn engine bằng `useLearn`. Không đổi gì khác trong engine/persist.
   - Engine vẫn tạo 1 lần theo `instanceKey` (deck + nonce) — `mode` không cần vào key vì mỗi lần vào session là một mount mới.
3. **Lesson detail** (`$deckId.tsx`):
   - Xóa khối `<div className="grid grid-cols-3 gap-4">…</div>` (3 thẻ) và biến `learnedCount` không còn dùng; giữ `newCount`, `dueCount`, `reviewCards`, hint `Đợt ôn tiếp theo`.
   - Xóa `ctaLabel`; thay `<Link data-testid="vocab-start-session-btn">` bằng nhóm `<div className="flex flex-wrap gap-2">` gồm 2 nút theo bảng "Hành vi 2 nút" trong `plan.md`:
     - Thứ tự hiển thị: **Ôn tập** (`variant: "outline"`) rồi **Bắt đầu học** (`variant: "default"`), hoặc ngược lại nếu `DESIGN.md` quy định primary đứng cuối/đầu — theo `DESIGN.md`.
     - Enabled → `<Link to="/vocab/$deckId/session" params={{ deckId }} search={{ ...(course ? { course } : {}), mode }}>`; disabled → `<button type="button" disabled title="…" className={buttonVariants(...)}>` cùng nhãn và testid.
   - Trên mobile 375px hai nút phải cùng hàng hoặc xuống dòng gọn (flex-wrap), không tràn ngang.
4. **Dashboard `/vocab`** (`index.tsx`):
   - `const totalNewCount = data.decks.reduce((sum, d) => sum + d.newCount, 0);`
   - Thêm thẻ đầu tiên trong "Stats row": nhãn `Từ mới`, giá trị `totalNewCount`, `data-testid="vocab-overview-new-count"`, cùng style các thẻ hiện có (token màu theo `DESIGN.md`; giữ `text-hot` cho Đến hạn ôn như hiện tại).
   - Grid đổi thành `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` để 5 thẻ không vỡ layout.

## Validation

- `pnpm check-types` sạch; mở `/vocab/<deck>` thấy không còn 3 thẻ, có 2 nút; bấm từng nút vào đúng chế độ (học: thẻ "Làm quen từ mới"; ôn: prompt ôn tập).
- `/vocab` hiển thị thẻ Từ mới tổng.
