# Nguồn truy vết — assignment-prompt-bank

Repo: /root/projects/teacher-os @ develop d6c0f6b5 (working tree). "Phạm vi dòng" là phần đọc/được trích dẫn. Encoding UTF-8 toàn bộ.

| ID | Path (repo-relative) | Phạm vi dòng | Loại | Confidence | Encoding | Phần feature |
|----|----------------------|--------------|------|------------|----------|--------------|
| S1 | apps/server/src/routes/assignments/index.ts | 1-533 | route server (Hono) | cao | utf-8 | POST/PATCH prompt, khóa nội dung, mount tests, bodyLimit, GET legacy grading |
| S2 | packages/db/src/schema/assignment-prompt.ts | 1-68 | schema DB (drizzle sqlite) | cao | utf-8 | bảng `assignment_prompt`, index, chú thích thiết kế |
| S3 | packages/api/src/contracts.ts | 316-334, 337-527, 660-830, 831-1181, 1790-1956 | hợp đồng zod + type dùng chung | cao | utf-8 | catalog kỹ năng/part/type, question/writing schema, create/update schema, error codes, Kernel rows/snapshot |
| S4 | apps/web/src/routes/_auth/assignments/index.tsx | 1-541 | trang web (TanStack Router) | cao | utf-8 | danh sách ngân hàng, lọc/tìm/đếm, preview aside |
| S5 | apps/web/src/routes/_auth/assignments/new.tsx | 1-1252 | trang web (form soạn/sửa) | cao | utf-8 | gate thiếu mục, confirm cấu trúc, field-diff, reconcile, autosave, banner |
| S6 | apps/web/src/routes/_auth/assignments/preview.tsx | 1-80 (đầu) | trang web | cao | utf-8 | chế độ bank ?id= vs draft handoff |
| S7 | apps/e2e/specs/assignment-prompt-create.spec.ts | 1-767 | E2E Playwright (active) | cao | utf-8 | 13 test: tạo ready/draft, gate, preview, listening, grid, autosave, confirm, bulk paste, explanation |
| S8 | apps/e2e/specs/assignment-bank.spec.ts | 1-120 | E2E (active) | cao | utf-8 | danh sách + lọc + tìm + preview + reload |
| S9 | apps/e2e/specs/assignment-prompt-reading-types.spec.ts | 19-657 | E2E (active) | cao | utf-8 | 9 test reading types: bank, sentend, cloze, tablecomp, caps |
| S10 | apps/e2e/specs/assignment-prompt-map-listening.spec.ts | 12-127 | E2E (active) | cao | utf-8 | 2 test: listening map pin/bank/audio; writing task1 không gate ảnh |
| S11 | apps/server/src/routes/assignments/prompt-content-lock.test.ts | 1-581 | API test vitest (active) | cao | utf-8 | 9 case khóa nội dung/Writing, org scope, metadata, legacy |
| S12 | apps/web/src/lib/repos/assignment-prompts.ts (+ .test.ts 1-171) | 1-35; 1-171 | projection + unit | cao | utf-8 | map snapshot → UI row, fallback legacy |
| S13 | apps/web/src/lib/use-kernel-form-submit.ts | 1-136 | hook web | cao | utf-8 | outcome model, thông báo 409 lock, reconcile |
| S14 | apps/web/src/lib/repos/kernel.ts | 187-193, 302-309, 412-430, 669-680 | command bus web | cao | utf-8 | ánh xạ lệnh → endpoint, KernelCommandResult |
| S15 | apps/web/src/components/assignments/assignment-status.ts | 34-37, 192-206 | helper web | cao | utf-8 | promptStatus draft/used/ready, fmtDate VN |
| S16 | apps/web/src/components/assignments/composer-transitions.ts | 1-293 | pure logic web | cao | utf-8 | structuralChangeKind, rule giữ/mất dữ liệu, mirror bank/cloze/pin |
| S17 | packages/ui/src/components/assignments/editor/assignment-presets.ts | 1-439 | catalog UI package | cao | utf-8 | SKILLS/part/type/label, KIND, bankable, image pairs, qStart |
| S18 | apps/web/src/lib/assignment-draft-store.ts | 1-233 | store web | cao | utf-8 | autosave localStorage, TTL, cap, shape guard |
| S19 | apps/web/src/lib/assignment-preview-draft.ts | 1-79 | store web | cao | utf-8 | sessionStorage handoff, save/read/take |
| S20 | apps/server/src/routes/kernel.ts | 189-211, 448, 1511-1542, 3492-3495 | route server | cao | utf-8 | CSRF Origin/JSON, GET /kernel snapshot, gate giao đề ready, mount /assignments |
| S21 | apps/server/src/app.ts | 200-303, 478 | bootstrap server | cao | utf-8 | session→kernelCtx, chặn student/admin, teacher allowlist |
| S22 | apps/server/src/routes/snapshot.ts | 140-232, 330-347, 744-790 | route server | cao | utf-8 | parse questions/optionBank an toàn, query prompt (loại demo/library), projection |
| S23 | packages/db/src/migrations/0017_wet_jetstream.sql, 0019_solid_boomer.sql, 0027_unknown_lizard.sql, 0028_salty_purifiers.sql, 0060_study_pack.sql (7-8), 0063_green_ghost_rider.sql | toàn file | migration SQL | cao | utf-8 | lịch sử cột assignment_prompt |
| S24 | apps/web/src/components/assignments/prompt-preview-aside.tsx | 1-237 | component web | cao | utf-8 | preview aside, ghi chú chưa giao, nút Xem trước/Chỉnh sửa |
| S25 | apps/web/src/components/assignments/create-success-card.tsx | 1-90 | component web | cao | utf-8 | 3 heading thành công, tóm tắt |
| S26 | apps/web/src/lib/data-actions.ts (+ data-store-reducer.ts 90-106) | 80-85, 285-292 | type lệnh web | cao | utf-8 | create/update-assignment-prompt action |
| S27 | apps/server/src/routes/assignments/tests.ts | 1-40, 135 | route server (feature kế bên) | cao | utf-8 | ranh giới assignment-tests, DELETE test (không có DELETE prompt) |
| S28 | docs/project-overview-pdr.md | 3, 20, 24, 26, 27 | doc chính | cao | utf-8 | so sánh 0.3 |
| S29 | apps/web/src/lib/mock-data.ts | 83-108 | type UI | cao | utf-8 | AssignmentPrompt (view model) |
| S30 | apps/web/src/components/classes/class-assignments-tab.tsx | 221 | component web (feature classes) | cao | utf-8 | chỉ liệt kê đề ready khi giao |
| S31 | apps/server/src/lib/study-pack-clone.ts, apps/server/src/lib/exam-import/publish-to-bank.ts, packages/api/src/lib/ielts-band.ts (35-37), packages/api/src/rich-text.ts (129-160), packages/ui/src/components/assignments/editor/answer-key-grid.tsx (38-47), apps/web/src/components/assignments/answer-key-grid.tsx | rải rác | lib phụ trợ | cao | utf-8 | materialize library_ref, isAutoGradableSkill, richTextField, caps câu hỏi |
