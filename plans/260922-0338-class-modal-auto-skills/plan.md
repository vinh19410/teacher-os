---
title: "Tự động chọn kỹ năng của lớp theo syllabus trong modal tạo lớp"
description: "Chọn template giáo trình trong modal 'Tạo lớp mới' tự động bật các chip kỹ năng của lớp theo kỹ năng của syllabus đó."
status: pending
priority: P2
effort: 3h
issue: 232
branch: vinh19410/feat/class-modal-auto-skills
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-09-22
---

# Tự động chọn kỹ năng của lớp theo syllabus trong modal tạo lớp

## Overview

Trong modal "Tạo lớp mới" (`apps/web/src/components/modals/add-class-modal.tsx`), chips "Kỹ năng *" đang độc lập với dropdown "Template giáo trình": người dùng chọn syllabus xong phải tự bấm lại chip kỹ năng. `ClassTemplatePicker` (cùng file, `:37-82`) mới chỉ hiển thị kỹ năng của syllabus dạng Tag thông tin, không đụng state `skills` của lớp.

Plan này nối hai nguồn lại: khi chọn một syllabus ở dropdown, `AddClassModal` tự động set `skills` bằng kỹ năng của syllabus đó (thứ tự canonical theo `IELTS_SKILLS`). Thay đổi nằm hoàn toàn trong web state — **shape payload `add-class` cùng kernel command, contracts, schema đều không đổi** (giá trị `skills` gửi đi giờ đi theo syllabus chọn — xem Design Decisions). Người dùng vẫn bấm tay để chỉnh lại sau khi auto-fill (auto-fill chỉ chạy lúc change template).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Chọn syllabus có ≥1 kỹ năng → chips kỹ năng của lớp tự bật đúng kỹ năng đó | P1 |
| 2 | Chọn "— Lớp trống —" / syllabus 0 kỹ năng → giữ nguyên selection tay hiện tại (không xóa trắng) | P1 |
| 3 | Chuyển sang template khác → ghi đè selection tay (đúng nghĩa "tự động define theo syllabus chọn") | P1 |
| 4 | Không vỡ contract test regex trên source modal, component test render đầu, và 2 e2e specs hiện có | P1 |

## Phases

| Phase | Name | Status |
| ----- | ---- | ------ |
| 1 | [UI — tự động chọn kỹ năng theo syllabus](./phase-01-ui-auto-skills.md) | Pending |
| 2 | [Tests — component test và e2e guard](./phase-02-tests-e2e.md) | Pending |

## Design Decisions

- **Auto-fill trong handler `changeTemplateId(next)` của `AddClassModal`**, thay cho `onTemplateId={setTemplateId}` hiện tại tại `add-class-modal.tsx:262`. Đây là site đấu dây duy nhất của `onTemplateId` (đã enumerate: `setTemplateId` chỉ xuất hiện tại `:97` khai báo state, `:122` resetForm, `:262` wiring). Handler set `templateId` rồi, nếu template tồn tại và có skills, gọi `setSkills(skillsFromTemplate(template.skills))`.
- **Pure helper tách riêng `skillsFromTemplate(templateSkills: readonly string[]): string[]` = `IELTS_SKILLS.filter((s) => templateSkills.includes(s))`**, export ở module scope để unit-test trực tiếp. Lý do: `apps/web` chỉ có `renderToStaticMarkup` (không jsdom/@testing-library) nên không simulate được event `onChange` của `<select>` — phải test logic qua helper. Filter theo `IELTS_SKILLS` (contracts.ts:37-42) tự cho: thứ tự canonical, dedupe, và phòng thủ giá trị lạ — dù `syllabusCreateSchema.skills` (contracts.ts:152-164) đã enforce cùng enum nên dữ liệu snapshot hợp lệ, filter gần như free nên giữ (belt-and-suspenders, zero cost).
- **"— Lớp trống —" và syllabus 0 kỹ năng → giữ nguyên selection tay.** Xóa trắng sẽ phá selection người dùng đã bấm tay mà không có gì thay thế; text "Syllabus chưa khai báo kỹ năng" (`:76`) đã giải thích tại sao không có gì tự điền. Chỉ template có skills mới ghi đè.
- **Template mới ghi đè selection tay.** Nếu chỉ merge, người dùng đổi syllabus sẽ mang kỹ năng của template cũ theo — sai nghĩa "tự động define theo syllabus chọn".
- **`ClassTemplatePicker` không đổi** (display-only, có test riêng). Không thêm hint "đã tự điền": hàng Tag "Kỹ năng giáo trình" ngay trên + chips nhấn sáng là tự giải thích. YAGNI.
- **Payload shape giữ nguyên** (`templateId,` vẫn liền trước `schedule:` tại `:189`) → regex contract test `kernel-runtime.contract.test.ts:150-155` vẫn pass. Kernel command `add-class` không đổi.
- **Thay thế có chủ đích non-goal của plan `260922-0246-create-class-syllabus-skills`**: plan đó ghi "Không copy skill giáo trình vào payload `skills`" vì scope lúc đó chỉ là hiển thị thông tin (Tag row) để người dùng tự quyết. Feature này được yêu cầu tường minh sau đó — bây giờ skills của syllabus được đưa vào state (và qua đó vào payload) theo lựa chọn template. Việc thay đổi payload chỉ là hệ quả của state, không đổi schema (cùng enum `IELTS_SKILLS`, đã verify `classCreateSchema.skills` contracts.ts:51-57).
- **`classType === "communication"` vô hại**: chips ẩn và payload vẫn `skills: []` nhờ gate sẵn có tại `:187` — auto-fill chỉ đổi state, không đổi gate.

## Non-Goals

- Đổi backend, kernel command `add-class`, contracts, schema, snapshot API.
- Sync ngược (đổi chip kỹ năng lớp → đổi selection template) — auto-fill chỉ chạy một chiều lúc change template.
- Auto chọn level/type/mode theo syllabus template.
- Hiển thị hint "đã tự điền kỹ năng" hay toast.
- Đổi `ClassTemplatePicker` (props, rendering).

## Success Criteria

- [ ] Chọn syllabus có skills → chips kỹ năng lớp bật đúng bằng kỹ năng syllabus, đúng thứ tự canonical, không trùng.
- [ ] Chọn "— Lớp trống —" / syllabus 0 kỹ năng → chips giữ nguyên trạng thái trước đó.
- [ ] Đã bấm chip tay, rồi chọn template khác → selection bị ghi đè bằng skills của template mới.
- [ ] Payload `add-class` shape không đổi; `templateId,` vẫn liền trước `schedule:`; `resetForm()` vẫn reset `skills: []`, `templateId: ""`.
- [ ] `pnpm --filter web test` pass (kể cả contract test regex và test render đầu `aria-pressed="false"`).
- [ ] `pnpm check` pass; 2 e2e specs `syllabus-detail-import-overwrite`, `syllabus-test-session-mark` pass.

## Dependencies

- Không có cross-plan dependency (blockedBy trống).
- Phụ thuộc logic vào plan `260922-0246-create-class-syllabus-skills` (đã merge): `templates` từ `useSyllabus()` (`use-syllabus.ts:24`, filter `classId === null`) và `Syllabus.skills: string[]` là nền cho auto-fill.

## Validation Log

### Verification Results
- Claims checked: 12 (5 phase-01, 5 phase-02, 2 cấu trúc)
- Verified: 12 | Failed: 0 | Unverified: 0
- Tier: Light (Fact Checker — plan 2 phases)
- Bằng chứng chính: `add-class-modal.tsx:29,122,132,187,189,262`; `add-class-modal.test.tsx:108-109` (`aria-pressed="false"`); `syllabus-detail-import-overwrite.spec.ts:101-106` (click Writing → selectOption); `chip-multi.tsx:40` (`aria-pressed={value.includes(option.value)}`); `CHANGELOG.md:13,15` (`## 2026-09-22` + `### Added`); contract regex `kernel-runtime.contract.test.ts:150-155`.
- Ghi chú: verification thực hiện trong phiên planning (grep/đọc trực tiếp), không spawn agent riêng — tier Light với plan nhỏ.

### Whole-Plan Consistency Sweep
- Đã re-read cả 3 file sau khi viết. Phát hiện + sửa 1 mâu thuẫn chữ nghĩa: Overview cũ viết "payload `add-class` … không đổi" trong khi feature thay đổi GIÁ TRỊ `skills` trong payload (shape giữ nguyên) → đã sửa thành "shape payload … không đổi (giá trị `skills` gửi đi giờ đi theo syllabus chọn)" khớp với Design Decisions và Success Criteria.
- Không còn từ cũ / mâu thuẫn còn lại: "ghi đè selection tay" dùng nhất quán ở Goals #3, Design Decisions, phase-01; "giữ nguyên selection" nhất quán ở Goals #2, phase-01, Success Criteria.

### Re-verification sau rebase lên PR #233 (VND currency input)
- develop fast-forward thêm 2 commit (feature VND đã merge, đụng cả `add-class-modal.tsx`) → re-check toàn bộ claim `file:line` của modal: các dòng lệch hỗn hợp (+1/+2/−1), đã cập nhật: `SKILL_OPTIONS` :27→:29, state :96→:97, resetForm :121→:122, changeStart :131→:132, notice :75→:76, gate :188→:187, payload :190→:189, wiring :263→:262, picker range :36-81→:37-82.
- Các file ref khác không bị PR #233 đụng (contracts, contract test, component test, 2 e2e specs, chip-multi, use-syllabus, CHANGELOG `:13,15`) → claim giữ nguyên, đã spot-check lại.
- Kết luận: 0 failed sau re-verify; plan sẵn sàng cook.
