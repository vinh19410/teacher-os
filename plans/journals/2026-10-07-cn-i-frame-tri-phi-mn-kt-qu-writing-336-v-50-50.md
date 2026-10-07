---
title: "Cân đối frame trái/phải màn kết quả Writing (#336): 50/50 + card thẳng hàng"
date: 2026-10-07
summary: "Grid chia 2 khung về grid-cols-2; AttemptGradeCard nhánh split đổi sang heading + Chấm lúc ngoài card để 2 card thẳng biên trên"
---

# Cân đối frame trái/phải màn kết quả Writing (#336): 50/50 + card thẳng hàng

## What happened
- Yêu cầu 1: cân đối lại frame trái (bài viết) / phải (kết quả chấm) cho bằng nhau (screenshot user cho thấy lệch 60/40).
- Nguyên nhân: `$attemptId.tsx:217` dùng `app:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]` (tỷ lệ 3:2 từ #336).
- Fix 1 dòng: `app:grid-cols-2` (= `repeat(2, minmax(0,1fr))` — giữ nguyên semantics chống tràn `minmax(0,…)`).
- Yêu cầu 2 (follow-up): card kết quả phải nằm ngang hàng card bài viết. Nguyên nhân: heading "Kết quả chấm của giáo viên" nằm TRONG card border (section có border), còn cột trái heading nằm NGOÀI → biên trên 2 card lệch ~58px.
- Restructure `AttemptGradeCard` nhánh `scrollable`: heading + meta "Chấm lúc" (text-sm, thay vị trí "195 từ" bên trái) render trên card; card thật (`attempt-grade-body`, testid mới) chứa band + criteria + nhận xét, nhận border + vùng cuộn. Section giữ `app:sticky app:top-20` + `app:max-h-[calc(100svh-6rem)] app:flex-col`; body `app:flex-1 app:min-h-0 app:overflow-y-auto`. Nhánh không scrollable (Speaking, writing chưa chia khung) giữ markup cũ nguyên vẹn.

## Decision
- Chọn `grid-cols-2` thay vì viết tay `minmax(0,1fr)_minmax(0,1fr)`: cùng kết quả, idiom Tailwind ngắn hơn.
- Mirror cấu trúc cột trái (heading → meta → card) thay vì nhét heading vào card bài viết: giữ nhất quán với "Bài nói của bạn" (heading ngoài) và giúp "Chấm lúc" luôn nhìn thấy khi card dính sticky.
- Giữ max-h `calc(100svh-6rem)` trên SECTION (không phải body) → công thức clamp sticky e2e không đổi (720−24−624=72 ∈ band [64,88]).
- `scrollable` giờ mang 2 ý nghĩa (chia khung + vùng cuộn) — chỉ 1 call site dùng true, gộp thay vì thêm prop thứ 2 luôn đi cùng nhau.
- Unit test chỉ assert presence `writing-result-split`/`app:sticky`/`min-w-0`, không assert ratio → không vỡ.

## Verification
- `pnpm --filter student test`: 251/251 pass (thêm assert cấu trúc mới: attempt-grade-body, "Chấm lúc" ngoài card, nhánh Speaking không đổi). `pnpm check` + `pnpm check-types`: sạch.
- E2E `teacher-essay-annotations` (E2E_*_PORT=8100/8101/8103 do dev stack chiếm 8000/8001/8003): 2/2 pass — e2e đổi so sánh: heading↔heading và card-top↔card-top (≤4px), keyboard scroll chuyển sang gradeBody (focus + ArrowDown + scrollTop poll).
- Spec dùng một lúc (đã xoá) verify geometry: desktop 1440×900 width lệch <2px + card top lệch ≤2px; 768×1024 & 375×812 xếp dọc (lưu ý: `toHaveCount(0)` dưới breakpoint là SAI vì split container render mọi viewport, chỉ class `app:` là responsive).
- Screenshot 3 viewport: `apps/e2e/test-results/split-*.png` (bản copy `/tmp/split-desktop-aligned.png`).

## Next steps
- Chưa commit (không trong phạm vi yêu cầu) — 4 file modified sẵn sàng commit `fix(student): equalize and top-align writing result split frames`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
