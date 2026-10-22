# Phase 4 — Trích editor đề từ `apps/web` sang `packages/ui`

## Context

Editor soạn passage và câu hỏi (≈13 dạng) nằm trong `apps/web/src/components/assignments/*` (`question-key-editor`, `answer-key-grid`, `cloze-editor`, `option-bank-editor`, `pin-editor`, `table-grid-editor`, `bulk-key-paste`, `assignment-presets`) và `apps/web/src/components/ui/rich-text-editor.tsx` (Tiptap). Chúng import primitive riêng của web: `@/components/ui/{button,field,card,chip-filter,section-label}`, `@/lib/cn`, `@/lib/image-pin`. `apps/admin` không được import từ `apps/web`; viết lại editor là nhân đôi ~3.000 dòng + test. Quyết định: **trích nguyên trạng** sang `packages/ui`, `apps/web` giữ shim re-export.

## Requirements

- Không đổi hành vi, markup, class, `data-testid` của web.
- `git mv` file nguồn và test đi kèm để giữ lịch sử; mọi import trong web trỏ lại qua shim (file cũ chỉ còn `export * from "@teacher-os/ui/..."`), nên không phải sửa call site hàng loạt.
- Primitive web trùng tên với shadcn trong `packages/ui` (`button.tsx`, `card.tsx`): đặt bản web vào thư mục con `packages/ui/src/components/web-kit/` để không va chạm; admin dùng bộ này cho editor, UI khung (shell, bảng) của admin dùng primitive `packages/ui` gốc.
- Thêm dependency Tiptap (`@tiptap/react`, `starter-kit`, `extension-placeholder`, đều `catalog:`) vào `packages/ui/package.json`; web giữ nguyên dependency của mình cho các chỗ khác.
- Khuyến nghị tách bước: (a) primitive + `cn` + `image-pin` + `rich-text-editor`, (b) editor câu hỏi. Mỗi bước một commit, web xanh sau mỗi bước.

## Files

Chuyển (nguồn → đích `packages/ui/src/components/`):
- `apps/web/src/components/ui/{button,field,card,chip-filter,section-label,rich-text-editor}.tsx` → `web-kit/…`
- `apps/web/src/lib/{cn,image-pin}.ts` → `packages/ui/src/lib/`
- `apps/web/src/components/assignments/{answer-key-grid,question-key-editor,cloze-editor,option-bank-editor,pin-editor,table-grid-editor,bulk-key-paste,assignment-presets}.ts(x)` → `assignments/editor/…`

Để lại shim cùng đường dẫn cũ trong `apps/web`. `prompt-composer.tsx` ở lại web trong phase này (UI form teacher, admin dựng form riêng ở phase 6 nhưng dùng `QuestionKeyEditor`).

Sửa: `packages/ui/package.json` (deps), có thể `vitest` config cho `packages/ui` nếu chưa chạy test (hiện chỉ có `check-types`; test di chuyển cần runner — thêm `vitest` + `jsdom` + `@testing-library/react` theo catalog và script `test`, nối vào `turbo test`).

## Steps

1. Ghi lại baseline: `pnpm --filter web test` và đếm số test pass/fail trước khi đổi.
2. Bước (a): chuyển primitive và rich-text-editor + test, thêm shim, chạy test web.
3. Bước (b): chuyển editor câu hỏi + test, thêm shim, chạy test web và `packages/ui`.
4. Chạy e2e các spec `assignment-prompt-*` và `assignment-test-create` (đường dùng editor thật).
5. Kiểm bundle: `pnpm --filter web build` không tăng đáng kể (Tiptap vẫn chung chunk).

## Validation

```bash
pnpm --filter web test
pnpm --filter @teacher-os/ui test
pnpm check-types && pnpm check
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 \
  pnpm --filter e2e e2e -- specs/assignment-prompt-create.spec.ts specs/assignment-prompt-reading-types.spec.ts specs/assignment-prompt-map-listening.spec.ts specs/assignment-test-create.spec.ts
```

Pass khi: số test web bằng baseline, không test nào bị xóa/skip; 4 spec e2e xanh; `git log --follow` còn lịch sử file đã chuyển.

## Risks / Rollback

- Rủi ro cao nhất của cả plan về khối lượng. Nếu phát sinh coupling ẩn (editor dùng context/store của web), **dừng**, ghi vào báo cáo và quay lại hỏi user: phương án dự phòng là admin dùng form đơn giản hơn cho vài dạng câu (không phải mặc định).
- Rollback: mỗi bước là một commit riêng, `git revert` từng bước; shim bảo đảm web không phụ thuộc đường dẫn mới theo kiểu hai chiều.
