---
title: "Fix issue #115: Số buổi=0 và đơn giá âm lọt form thêm học viên — parseInt||default và total min(0)"
date: 2026-08-31
summary: "QC P1 #115: form thêm học viên nhận Số buổi=0/đơn giá âm vì parseInt(x)||default ép 0→10 im lặng, contract server total min(0) chấp nhận gói 0 buổi, lỗi chỉ hiện banner chung không chỉ field. Fix: min(0)→min(1) cho total ở studentCreateSchema + enrollStudentSchema (price giữ min(0) — gói miễn phí hợp lệ), parse strict Number()+Number.isInteger với per-field errors, +5 server tests, e2e spec mới với POST counter observe-only + affirmative proof. Red-team 14 findings áp 13, kongming GO 2 lần. 4 gate xanh, e2e 5/5, review APPROVE."
---

# Fix issue #115: Số buổi=0 và đơn giá âm lọt form thêm học viên — parseInt||default và total min(0)

Branch `fix/115-student-package-min-validation`, vibe pipeline `--ship --beta --advice`, ngày 2026-08-31.

## What happened

QC P1 #115: form thêm học viên cho dữ liệu rác đi qua cả client lẫn server mà không ai kêu. Ba lỗ hổng chồng nhau:

- `parseInt(x) || default` biến "Số buổi = 0" thành 10 âm thầm — coercion falsy, cùng họ root cause với #105 ở modal tạo lớp.
- Contract server `total` đang `min(0)` — gói 0 buổi vào DB là hợp lệ.
- Lỗi validation chỉ hiện banner chung đầu form, không chỉ ra field nào sai.

## Fix

1. **contracts.ts:** `total` `min(0)` → `min(1)` cho `studentCreateSchema` + `enrollStudentSchema`. `price` giữ `min(0)` — gói miễn phí là hợp lệ, không siết oan. Defaults 10/400.000 giữ theo chủ đích #122, giờ được pin bằng test thay vì chỉ sống trong lời bình luận.
2. **add-student-modal.tsx:** parse strict `Number()` + `Number.isInteger` — chặn cả input rỗng lẫn thập phân (khác pattern #105 vốn truncate "10.5" → 10); per-field errors thay banner chung; validate chạy TRƯỚC nhánh mode nên nhánh enroll-existing cũng bị chặn; clear lỗi on change + switchMode; `noValidate` để native validation không can thiệp.
3. **+5 server tests**, trong đó 2 case `total=0` đi đỏ → xanh thật.
4. **E2e spec mới, 2 test:** asserts theo field; POST counter observe-only mirror `countInvoicePosts`, scope `/api/students`; kèm affirmative proof (case hợp lệ phải đếm đúng 1 POST); thêm case enroll bắt buộc và case thập phân.

## Quá trình và quyết định

Red-team plan 3 reviewer: 14 findings, áp 13. Nặng nhất: bỏ claim aria sai thực tế; thay kỹ thuật đếm POST bịa trong plan bằng observe-only listener; `Number()` thay `parseInt`; thêm case enroll bắt buộc; sửa path counter `/api/kernel/students` → `/api/students`. Kongming GO 2 lần — lần GO thứ 2 vẫn bắt thêm mâu thuẫn URL counter mà sweep bỏ sót. Quyết định process rút ra: delta từ review/red-team phải lan truyền qua TOÀN BỘ plan file, không chỉ vá file bị findings — sweep cục bộ chính là chỗ URL sai lọt qua.

## Bài học

- `parseInt` không phát hiện input thập phân; khi contract là integer, dùng `Number()` + `Number.isInteger`.
- Assertion phủ định (counter = 0) cần proof khẳng định đi kèm, nếu không test green một cách vacuously — pass cả khi counter không bao giờ đếm gì.
- Delta review phải propagate toàn plan file. Vá từng finding tại chỗ là bảo đảm sót.

## Evidence

- 4 gate xanh; e2e **5/5** (2 mới + 3 regression).
- Review **APPROVE**, 0 Critical / 0 Important, 4 minor — #1 fix ngay trong `ac4c494` (settle 100ms cho counter trước khi assert), #2–4 defer sang issue #141.
- Commits: `963b587` (fix), `ac4c494` (review minor #1).

## Next steps

- Merge branch → `develop`, canh CI e2e.
- #141: xử 3 minor còn lại.
- Rà các form khác còn pattern `parseInt(x)||default` — #105 và #115 đã là 2 lần cùng root cause trong một tuần, khả năng cao không phải case cuối.

Cảm nhận thật: đây là lần thứ hai trong một tuần bắt đúng họ bug coercion falsy (#105 rồi #115) — không hoảng, nhưng đủ thấy `parseInt||default` cần được săn toàn repo thay vì vá từng con. Phần đáng tiền nhất của round này là red-team bắt được kỹ thuật đếm POST bịa ngay ở tầng plan: nếu lọt vào test thật, e2e sẽ xanh một cách nói dối — và loại xanh đó nguy hiểm hơn cả đỏ.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
