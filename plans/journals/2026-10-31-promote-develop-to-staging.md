---
title: Promote develop to staging
date: 2026-10-31
summary: "Promote develop lên staging qua PR #523; owner chấp nhận rủi ro chỉ cho staging, blocker nằm ở #524"
---

# Promote develop to staging

**Date**: 2026-10-31 19:58
**Severity**: Medium
**Component**: release staging, E2E `invoice-detail.spec.ts`, unit test `student-history.test.ts`
**Status**: Staging đã deploy; production chưa được chấp nhận

## What happened

PR #523 merge bằng merge commit `312099d6`. Deploy Staging run `41236061566` thành công. `/readyz` trả 200, `/public/placement-test` trả 503 đúng như dự kiến.

Merge gate fail vì review findings, và owner là người ra quyết định. Blocker release nằm ở tracking issue #524. Owner chấp nhận rủi ro **chỉ cho staging, không cho production**. Staging xanh không có nghĩa là production được phép đi.

## The brutal truth

Hai lỗi này đều được sửa bằng cách đổi test, không phải đổi code sản phẩm. Nực cười nhất là `student-history.test.ts`: hardcode tháng `2026-10` rồi vỡ khi giờ Việt Nam sang 01/11, tức test có hạn sử dụng ngay từ lúc viết. Bực hơn nữa là ca E2E bị phân loại sai ngay lần đầu.

## Technical details

**E2E, `invoice-detail.spec.ts`:** URL đổi trước khi lazy detail route render xong, nên list vẫn đang hiển thị 4 nút "Đã nhận" (mỗi invoice seed một nút) và strict mode fail. Tester phân loại ban đầu là shared DB/test order; kết luận đó sai. Fix ở `9e03934e`: chờ invoice heading rồi mới click. Full E2E sau fix: 249 passed, 1 skipped.

**CI, `student-history.test.ts`:** fix ở `361a3bbc` bằng cách freeze clock tại `2026-10-31T17:30:00Z`, thời điểm tháng theo UTC và theo giờ Việt Nam khác nhau. Không fix thì lỗi này cũng làm fail quality gate của deploy-staging.

## Decisions

- Không rerun E2E sau `361a3bbc`, vì commit đó chỉ đổi một unit test. Kết quả 249 passed là của lần chạy trước commit này.
- Chấp nhận rủi ro ở phạm vi staging, do owner quyết định; production giữ lại theo #524.

## Process note

`staging` không phải mode token của ak-ship. Agent lúc đầu nói sai là không cần hỏi, sau đó tự sửa và hỏi lại. Đây là suýt tự suy diễn quyền: token không có trong mode thì phải hỏi ngay từ đầu.

## Lessons

- Trong E2E, URL đổi không chứng minh route đã render. Với lazy route, phải chờ một phần tử chỉ có ở trang đích rồi mới tương tác.
- Strict mode báo nhiều match thì kiểm tra trước xem đang đứng ở trang nào, đừng vội đổ cho shared DB hay test order.
- Test có logic theo tháng phải freeze clock, và nên chọn thời điểm mà UTC và giờ Việt Nam lệch tháng.

## Next steps

- Xử lý các blocker trong #524 trước khi tính tới production. Việc chấp nhận rủi ro cho staging không được tính sang production.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
