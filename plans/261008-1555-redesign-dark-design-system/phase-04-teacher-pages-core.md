---
phase: 4
title: "Trang giáo viên: dashboard, lớp, học viên, lịch, giáo trình, hồ sơ, báo cáo"
status: pending
priority: P2
effort: "6h"
dependencies: [3]
---

# Phase 4: Trang giáo viên — nhóm vận hành lớp

## Goal

Các trang vận hành lớp khớp bố cục design (`src/pages/Teacher.tsx`: `Dashboard`, `Classes`,
`ClassDetail`, `Students`, `StudentDetail`, `Schedule`, `Syllabus`, `Profile`) trên dữ liệu thật.
Section nào app có mà design không vẽ thì dùng cùng pattern; section design có mà app không có
thì **không thêm**.

## Quy tắc chung cho mọi trang

- `PageHead`: lead ngắn dạng số liệu/ngữ cảnh ("3 lớp đang hoạt động", "Tuần 41 · 05–11/10")
  chuyển thành `kicker`; câu giải thích dài giữ ở `lead`. Nút hành động chính chuyển vào `action`.
- Tiêu đề section `h2`: `font-display font-extrabold text-2xl tracking-[-0.045em]`; nhãn nhỏ dùng
  `SectionLabel` (mono uppercase). Giữ cấp heading và nội dung chữ (e2e dùng heading name).
- Link quay lại ("← Lớp học"): mono 12px `text-meta hover:text-hot`.
- Danh sách dạng hàng (`border-t border-line py-4`, hover chữ cam) cho lịch hôm nay, rủi ro.
- Số liệu (giờ, %, band, tiền) dùng `font-mono`.

## Ánh xạ trang

| Route | File | Design | Thay đổi chính |
|---|---|---|---|
| `/dashboard` | `routes/_auth/dashboard.tsx` | `Dashboard` | kicker = thứ/ngày (tiếng Việt), lời chào làm tiêu đề, `MorningSpot` ở `action` (ẩn < md); stat tiles nếu đã có số; "Lịch hôm nay" dạng hàng `grid-cols-[80px_1fr_auto]` giờ mono 2xl; "Học viên rủi ro" thành card `neu` bên phải với kicker cam |
| `/classes` | `routes/_auth/classes/index.tsx`, `components/modals/add-class-modal.tsx` | `Classes` | lưới card `neu` 2 cột: dòng mono `01 · loại` + phòng, tên lớp extrabold 2xl hover cam, lịch, khoảng ngày, thanh tiến độ `neu-in` + fill cam nếu đã có dữ liệu tiến độ; modal tạo lớp: chọn thứ dạng nút `neu-sm` liền nhau, chọn = `neu-in text-hot`; modal xung đột: nhãn mono `TRÙNG LỊCH` nền cam |
| `/classes/$classId` | `routes/_auth/classes/$classId.tsx`, `components/class-detail/*`, `components/classes/class-assignments-tab.tsx` | `ClassDetail` | Tabs segmented; roster `DataTable`, trạng thái ghi danh `Tag` (`hot` khi "Đã mời"), band/điểm danh mono, học phí `Badge`; tab tiến độ dùng pattern `SyllabusTree` |
| `/students` | `routes/_auth/students/index.tsx`, `components/students/pending-invitations-list.tsx`, `modals/invite-student-modal.tsx`, `modals/enroll-student-modal.tsx` | `Students` | kicker số học viên; bảng; email `text-meta` |
| `/students/$studentId` | `routes/_auth/students/$studentId.tsx`, `components/tuition/student-tuition-summary.tsx` | `StudentDetail` | badge học phí ở `action`; 3 `StatCard` (dùng `hot` khi số cần chú ý: Còn lại > 0, chuyên cần thấp); Tabs segmented |
| `/schedule` | `routes/_auth/schedule.tsx`, `components/schedule/*`, `components/class-detail/session-*-modal.tsx`, `class-sessions-manage-modal.tsx` | `Schedule` | kicker tuần; nút ←/Tuần này/→ `secondary` ở `action`; 7 cột card `neu` min-h 220px, hôm nay `ring-2 ring-hot/30` + nhãn cam; buổi = `neu-in` card nhỏ, giờ mono, buổi hủy `opacity-50 line-through`; buổi dự kiến giữ cách phân biệt hiện có (viền đứt); modal điểm danh: nút trạng thái mono `neu-in text-hot` / nền cam |
| `/syllabus`, `/syllabus/$syllabusId` | `routes/_auth/syllabus/*`, `components/syllabus/*`, `modals/add-*-modal.tsx`, `edit-*-modal.tsx`, `import-syllabus-modal.tsx` | `Syllabus`, `SyllabusTree` | module tiêu đề extrabold xl gạch dưới `line`; bài: số thứ tự mono `01`, đã xong `text-meta line-through decoration-hot`, loại bài `Tag` (`hot` cho cuối kỳ), chấm tròn `bg-hot` khi xong / `neu-in` khi chưa; nút xóa syllabus = `destructive` |
| `/profile` | `routes/_auth/profile.tsx`, `components/profile/*`, `components/payments/bank-link-panel.tsx`, `modals/bank-hub-link-modal.tsx` | `Profile` | 2 cột: form trái dùng `Field`, card `neu` "SePay Bank Hub" phải với kicker cam, số tài khoản mono; nút hủy liên kết = `destructive` |
| `/reports` | `routes/_auth/reports.tsx`, `modals/create-report-modal.tsx` | (không có) | áp quy tắc chung: PageHead kicker, `DataTable`, `SectionLabel` |

Tất cả path tương đối `apps/web/src/`.

## Tasks & Steps

1. Mỗi trang: đọc component design tương ứng → sửa class/bố cục → chạy unit test đi kèm.
2. Không đổi query/hook/mutation; nếu cần dữ liệu cho phần design (ví dụ % tiến độ lớp) mà
   snapshot chưa có → **bỏ phần đó**, ghi vào "Ghi chú lệch design" cuối file.
3. Thay `variant="danger"` ở nút/link phá hủy trong các file trên sang kiểu `destructive`
   (Button `danger` đã đỏ sau phase 2); chữ trạng thái nợ/quá hạn giữ `text-danger` (= cam).
4. Selector e2e bám class (xem bảng "E2E bám class" trong [plan.md](./plan.md)): giữ `lesson-block`
   và quy ước `opacity-60` cho buổi hủy/đã qua; `class-roster-tuition-debt` (`div.mt-8`),
   `class-sessions-manage-modal` (`div.overflow-hidden`), `student-tuition-summary`
   (`.grid.grid-cols-3 > div`) → đổi sang role/label/testid trong cùng commit đổi markup; cập
   nhật `student-tuition-summary.test.tsx:155` theo `StatCard` mới.
5. Chụp nhanh mỗi trang 1440 + 375 ở dark để tự soát trước phase 7.

## Verification

- `pnpm --filter web test` (class-roster-tab, class-assignments-tab, add-class-modal(.conflict),
  invite-student-modal, pending-invitations-list, student-tuition-summary, reports).
- E2E (port override): `class-operations`, `class-roster-tuition-debt`, `class-sessions-manage-modal`,
  `create-class-*`, `enroll-existing-student`, `student-row-detail`, `student-tuition-summary`,
  `schedule-session-modal`, `session-occurrence`, `projected-sessions`, `syllabus-*`, `profile`.

## Ghi chú lệch design

Điền khi thực thi (2026-10-09):

- **Class detail** không có PageHead riêng (app có Card header + 6 StatCard,
  design không vẽ chi tiết này) → giữ cấu trúc, khoác ngôn ngữ mới: h1 extrabold
  3xl, thêm link quay lại mono "← Lớp học", StatCard tự theo primitive mới.
- **`/classes`** đổi từ DataTable sang **lưới card neu 2 cột** theo design
  `Classes` (e2e không bám bảng này — specs navigate bằng tên lớp).
- **student-tuition-summary**: "Còn lại > 0" dùng **StatCard `hot`** (nền ink, số
  cam) thay vì `[&>div:first-child]:text-danger`; unit test #347 đổi assertion
  sang `bg-fg` cùng commit.
- **Schedule**: 7 cột ngày → card `neu` min-h 220px, hôm nay `ring-2 ring-hot/30`
  + nhãn cam (đúng plan); lesson-block + opacity-60/75/35 **giữ nguyên** (e2e bám).
- **Syllabus**: module card `neu rounded-md`, tiêu đề extrabold xl; dot trạng thái
  done/current = `bg-hot`, upcoming = `bg-surface border-line` (theo design
  SyllabusTree); tint buổi thi đổi từ amber sang `bg-warn-soft` (đơn sắc xám).
- **Profile**: 2 cột `[1.4fr_1fr]` — trái form/avatar/google, phải card Bank Hub
  với kicker cam "SEPAY BANK HUB"; nút Huỷ liên kết → `variant="danger"` (đỏ).
- **Reports** (`/reports`): kicker = ngữ cảnh Zalo OA + số báo cáo; h2 extrabold.

## Rollback

Revert commit phase 4; không ảnh hưởng phase 5/6.
