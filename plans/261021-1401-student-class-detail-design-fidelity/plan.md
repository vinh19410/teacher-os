---
title: "Student: kéo trang chi tiết lớp (/classes/$classId) về đúng design v2"
description: "Trang chi tiết lớp của học viên còn lệch design v2 ở header, thẻ thông tin lớp, banner bài tập, ring, tabs, timeline buổi học, bảng bài tập, giáo trình và avatar bạn cùng lớp; phần lớn là sót lại token/class của design v1 sau #378. Plan này liệt kê từng điểm lệch và sửa theo dữ liệu thật đang có, không bịa dữ liệu."
status: pending
priority: P2
effort: "7h"
issue: 389
branch: feat/student-class-detail-design-fidelity
tags: [frontend, student, design-v2, fidelity]
blockedBy: []
blocks: []
created: 2026-10-21
---

# Trang chi tiết lớp (student) lệch design v2

Nguồn design: `vinh19410/teacheros-design-v2@7a53fc0`, file `src/pages/StudentClass.tsx` (đã có bản
checkout ở `/tmp/teacheros-design-v2`; harness `scripts/design-compare/fetch-design.sh` tự clone đúng SHA).
Ảnh đối chiếu hiện tại: `plans/261020-1446-378-redesign-design-v2/screenshots/s-class-detail/desktop-light.png`.

## Outcome / Non-goals / Acceptance

- **Outcome:** màn `s-class-detail` khớp cấu trúc + token design v2 ở 3 viewport × 2 theme.
- **Non-goals:** không đổi API/contract/DB; không thêm dữ liệu design có mà server chưa trả; không đụng
  danh sách lớp (`/classes`) ngoài việc không làm vỡ `ClassBadges`/`ClassProgress` đang dùng chung.
- **Acceptance:** (1) `pnpm design:compare --screens s-class-detail --side app --label fidelity` PASS ở 1440/768/375,
  light + dark; (2) `pnpm check`, `pnpm check-types`, `pnpm --filter student test` xanh;
  (3) `student-class-detail.spec.ts` + `student-classmates.spec.ts` xanh; (4) không còn class dead/xung đột trong các file đụng tới.

## Bảng điểm lệch (design v2 vs app hiện tại)

| # | Khối | Design v2 | App hiện tại | Dữ liệu |
|---|---|---|---|---|
| 1 | Banner việc cần làm | Thanh `bg-primary` "Bạn còn N bài chưa làm trong {lớp}" + nút **Làm ngay** | Không có | Có: `assignments` chưa nộp |
| 2 | Header | `h1` `text-2xl md:text-3xl font-semibold`, badge trạng thái "Đang học", nút hành động bên phải | Eyebrow mono "LỚP HỌC", `h1` `extrabold` clamp 32–56px (kiểu v1), tag mono uppercase, thanh tiến độ riêng | Có `cls.status` |
| 3 | Back link | Nút ghost `← My classes` | Link chữ nhỏ `← Trang chủ` (giữ nguyên đích, xem câu hỏi mở) | — |
| 4 | Thẻ thông tin lớp | Card `dl` 4 cột: Khoá, Lịch, Hình thức, Giáo viên, Số buổi đã học, Ngày khai giảng; footer: số tháng, giờ, "Buổi tới: …" | Không có; giáo viên là một card riêng nằm ngang | Có một phần (xem "Không có dữ liệu") |
| 5 | Ring | Track `stroke-muted`, cung `stroke-primary`, icon chuyên cần `CircleCheck` | `stroke-surface` / `stroke-hot` — **token không tồn tại** trong `globals.css` (grep rỗng), `rounded-lg rounded-xl` xung đột | Đủ |
| 6 | Tabs | Segmented `h-9 rounded-lg bg-muted p-[3px]`, tab chọn `bg-background shadow-sm` | Tự viết: `rounded-lg rounded-md`, tab chọn chữ cam viền `border-input` | — |
| 7 | Hành trình học | Timeline: chấm tròn 32px (Check/X/CircleDashed) + đường dọc, buổi tới là card `bg-muted/40` + badge "Buổi tới", buổi tương lai `opacity-60`, "Session N · Thứ Ngày" | Danh sách hàng `border-t` phẳng, badge mono uppercase | Có (trừ bài về nhà) |
| 8 | Bài tập | `Table` (Bài tập, Hạn, Trạng thái, hành động Start/Feedback) | `AssignmentList` kiểu card/danh sách | Có (trừ cột Skill) |
| 9 | Giáo trình | Card, hàng có `Check` tròn / `CircleDashed` | Số thứ tự trong ô vuông; một card duy nhất theo chủ đề | Có (không có module/kiểm tra) |
| 10 | Bạn cùng lớp | Avatar tròn `bg-muted size-8` + tên (+ "(bạn)") | Ô vuông viền `size-11` | Có (chỉ tên) |

### Không có dữ liệu → bỏ khối, KHÔNG bịa (ghi vào `DESIGN.md` mục lệch có chủ đích)

Bài về nhà theo buổi, Địa điểm/phòng, Học phí của lớp, "Tham gia từ buổi", cột Skill của bài tập, nhóm module
và nhãn Mid/Final test trong giáo trình, "Target band" của bạn cùng lớp (cố tình không trả — quyền riêng #378),
nút "Join online class" (chưa có link lớp online).

## Phases

| # | Phase | Status | Effort | Phụ thuộc |
|---|---|---|---|---|
| 1 | [Primitive Tabs/Badge/Avatar cho student + sửa Ring](./phase-01-primitives-and-ring.md) | Pending | 1.5h | — |
| 2 | [Header, banner, thẻ thông tin lớp](./phase-02-header-banner-info.md) | Pending | 2.5h | 1 |
| 3 | [Timeline, bảng bài tập, giáo trình, bạn cùng lớp](./phase-03-journey-assignments-syllabus-classmates.md) | Pending | 2h | 1 |
| 4 | [Test, e2e, so ảnh, DESIGN.md](./phase-04-verify-and-docs.md) | Pending | 1h | 2, 3 |

Phase 2 và 3 sửa file khác nhau (xem cột Files từng phase) nên có thể làm song song sau phase 1,
nhưng cả hai cùng import vào `class-detail-view.tsx` → merge tuần tự để tránh xung đột.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| `ClassBadges`/`ClassProgress`/`Tag` dùng chung với `/classes` | Không sửa; trang chi tiết dùng `Badge` mới, chỉ thôi import `ClassBadges` |
| e2e bám `heading "Buổi học"`, `aria-current="true"` trên `li`, link `Trang chủ` (exact), `mailto:` email giáo viên, tab `Bài tập`, link `Làm bài: …` | Giữ nguyên các hook này (liệt kê ở phase 4) |
| Bảng bài tập mất dòng link `Xem lại kết quả` | Hành động cuối hàng giữ `aria-label` cũ |
| Tabs trùng code với `apps/web/src/components/ui/tabs.tsx` | Xem câu hỏi mở về chuyển lên `packages/ui` |

## Câu hỏi mở

1. Back link: design trỏ về danh sách lớp ("My classes"); app đang trỏ `/` và e2e bấm "Trang chủ". Mặc định plan **giữ nguyên đích `/`**; đổi sang `/classes` cần sửa e2e — chọn hướng nào?
2. Tabs/Badge/Avatar đã có ở `apps/web/src/components/ui`; `packages/ui` chưa có. Mặc định plan **copy sang `apps/student`** (nhỏ, không đổi web); chuyển lên `packages/ui` dùng chung thì gọn hơn nhưng đụng cả `apps/web` — làm trong PR này hay tách?
3. Nút hành động bên phải header: mặc định **"Nhắn giáo viên" (mailto)** cho mọi lớp vì chưa có link lớp online — đồng ý?
