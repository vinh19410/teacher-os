---
title: Plan assignment bank create page
date: 2026-09-18
summary: "ak-plan --github (hard mode) cho trang tạo bài tập theo thiết kế mới: chọn assignment-create-3.html 'Thêm đề vào ngân hàng' (mới nhất + primary:true) làm chuẩn trong 3 bản iterate của project Open Design f2f4d498 (v1/v2 giao thẳng lớp → v3 bank-first); phát hiện AddAssignmentModal chỉ là placeholder và bảng assignment là grading-only gắn học viên → thiết kế vertical-slice mới: bảng assignment_prompt không FK student, POST /api/assignments/prompts, KernelSnapshot.assignmentPrompts (web glue phải land cùng phase 1 vì guard compile-time SNAPSHOT_COLLECTION_KEYS), trang /assignments/new (composer 2 cột + bank context + preview + sticky bar + success state), xóa modal placeholder; honest-UI: bỏ 'Đã dùng N lớp' vì chưa có link đề→lớp; subagent delegation lỗi harness (reasoning-level-missing, đã知issue từ journal ship 0.0.4) → scout + red-team 4 personas chạy inline, 18/18 claims verify được file:line; issue #202 gán ready to review"
---

# Plan: Trang tạo bài tập — Thêm đề vào ngân hàng (thiết kế mới)

`ak-plan --github`, hard mode, 2026-09-18. Plan dir: `plans/260918-0725-assignment-bank-create-page/` · Issue [#202](https://github.com/vinh19410/teacher-os/issues/202) · 3 phases · ~12h · P2.

## Chọn bản thiết kế nào trong 3 bản

Project Open Design chứa 3 iterate của cùng một trang: v1/v2 "Tạo bài tập Writing IELTS" (soạn đề → chọn lớp → chọn học viên → hạn nộp → giao), v3 "Thêm đề vào ngân hàng" (soạn đề → status Bản nháp/Sẵn sàng → lưu bank; giao bài là việc trang Lớp học). Quyết định theo **v3** vì mới nhất (13:59), `artifact.json` ghi `primary: true`, và hướng bank-first khớp roadmap M5 ("tạo assignment" là ứng viên feature). Giả định này được ghi tường minh vào Assumptions của plan + mục "Cần xác nhận" trên issue #202 — nếu chủ sản phẩm muốn v2 thì phase 2 phải đổi hướng, không phát hiện muộn.

## Hai phát định hình kiến trúc

1. **Không có gì để tái dùng cho "tạo"**: `AddAssignmentModal` là placeholder redirect (tính năng chưa từng tồn tại), bảng `assignment` là grading-only với `studentId` notNull — đề trong ngân hàng tồn tại *trước* khi giao. → Bảng mới `assignment_prompt` không FK student/class; giao bài sau này tạo row `assignment` tham chiếu (plan tương lai).
2. **Mở rộng snapshot là thay đổi cross-cutting**: `KernelSnapshot.assignmentPrompts` kích hoạt guard compile-time `MissingSnapshotKey extends never` ở web (`SNAPSHOT_COLLECTION_KEYS`) — nếu contract land một mình, `check-types` gãy. Khác plan #179 (settings không qua snapshot), phase 1 ở đây **bắt buộc** gộp web glue (mapper + collection key + MockData slice + reducer case inert) để mỗi phase green.

## Quyết định "honest UI" đáng nhớ

Design v3 hiển thị "Đã dùng 2 lớp" trong list "Đề đã có" — nhưng chưa hề có dữ liệu link đề→lớp (bảng `assignment` không có `promptId`). Theo convention trung thực của repo (#172 Zalo honest), plan **bỏ** tag usage count, chỉ hiện status + nguồn; breadcrumb bỏ nấc "Ngân hàng" (chưa có trang list ngân hàng — không render link chết). Ghi thành Key Decision #4 để cook không "trung thành mù" với mock design.

## Deviation: scout + red-team inline

Agent tool fail toàn bộ (`reasoning-level-missing` — lỗi harness đã gặp trong journal ship 0.0.4 ngày hôm nay). Scout 18 nguồn đọc trực tiếp (schema, contracts, snapshot, kernel routes, reporting precedent, data-actions, kernel repo, use-kernel-form-submit, app-shell, routes-matcher, list page + test, e2e helpers, roadmap, 3 bản design + artifact.json); red-team 4 personas (Assumptions/Failure/Scope/Security) chạy inline với bằng chứng file:line — 18/18 claims VERIFIED, 0 fail. Verdict GO, 0 blocker. Ghi rõ trong Red-Team Record rằng đây là inline, không phải verdict subagent độc lập.

## Nghịch lý nhỏ của pipeline

`ak plan create` sinh Phases table 4 cột (`# | Phase | Status`) nhưng hook can thiệp yêu cầu canonical 3 cột (`Phase | Name | Status`) — sửa tay 1 lần rồi `ak plan reindex` + `ak plan validate` → `[OK]`. CLI và hook đang có nhẹ một bước nhảy format; đáng báo cho ak sau.

## Evidence

- Plan files: `plan.md` (frontmatter đầy đủ, issue 202) + 3 phase files có file-path cụ thể, code snippet schema/contract, verification commands từng phase.
- `ak plan validate ./plans/260918-0725-assignment-bank-create-page` → `[OK]`; `ak plan list` → tracked `teacher-os/260918-0725 pending active`.
- Issue #202 tạo thành công với label `ready to review` (skill contract --github).
- Task hydration: không có surface task-management runtime khả dụng trong session (subagent infra down) → plan files + `ak plan` store là tracker bền; cook handoff qua `/ak:cook`.

## Next steps

- Xác nhận trên #202 (v3 vs v2) → `/ak:cook /Users/vinhtran/Documents/project/personal/teacher-os/plans/260918-0725-assignment-bank-create-page/plan.md` (branch `feat/assignment-bank-create-page`).
- Cook xong: `ak plan status` cập nhật phase; comment lên #202; E2E `assignment-prompt-create.spec.ts` phải xanh trước merge.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
