# Gaps, Open Questions, Conflicts — assignment-prompt-bank

## Open Questions (OQ)

| ID | Câu hỏi | Bằng chứng code hiện tại | Vì sao code không trả lời được | Nhãn |
|----|---------|--------------------------|-------------------------------|------|
| OQ-1 | Ngân hàng có chủ ý không cho xóa đề, hay thiếu chức năng xóa? | Không có route DELETE `/assignments/prompts` (chỉ tests route có DELETE `apps/server/src/routes/assignments/tests.ts:135`), không có action `delete-assignment-prompt` (grep toàn repo: 0 kết quả), không có nút "Xóa đề" trên UI (grep "Xóa đề|Xoá đề": 0 kết quả) | Ý định sản phẩm (giữ lịch sử đề đã giao?) không nằm trong code | 🟡 |
| OQ-2 | Đề đã giao bị hạ về "Bản nháp" là hành vi chấp nhận hay cần chặn? | `status` nằm trong metadata không khóa (`apps/server/src/routes/assignments/index.ts:471`), `promptStatus` ưu tiên draft trước used (`apps/web/src/components/assignments/assignment-status.ts:198-206`); hàng đề đã giao vẫn gửi được PATCH status="draft" (test metadata `apps/server/src/routes/assignments/prompt-content-lock.test.ts:401`) | Không có test/case policy nói về ready→draft trên đề đã dùng | 🟡 |
| OQ-3 | Ngân hàng có cần giới hạn số đề/org hoặc phân trang không? | Query snapshot chỉ order by createdAt (`apps/server/src/routes/snapshot.ts:347`), danh sách render toàn bộ (`apps/web/src/routes/_auth/assignments/index.tsx:459-525`), không thấy limit/offset | Quy mô kỳ vọng (số đề/teacher) là thông tin nghiệp vụ | 🟡 |
| OQ-4 | Cột `band` là "band mục tiêu" cho ai — đề hay lớp? Vì sao default 7.0? | `band` default "7.0" (`packages/db/src/schema/assignment-prompt.ts:31`), enum 5.0–8.0 (`packages/api/src/contracts.ts:815-823`), UI suy band từ trình độ lớp khi tạo từ ?classId (`apps/web/src/components/assignments/assignment-presets.ts:12-58`), hiển thị "Band {band}" (`apps/web/src/routes/_auth/assignments/index.tsx:519-521`) | Ý nghĩa nghiệp vụ (đầu ra mục tiêu của đề?) không có trong code | 🟡 |
| OQ-5 | `source` ("nguồn đề", vd "Cambridge 10") chỉ là nhãn tự do? | text max 200, default "" (`packages/api/src/contracts.ts:838`), dùng cho tìm kiếm + hiển thị (`apps/web/src/routes/_auth/assignments/index.tsx:67-75,503-507`) | Có cần từ điển nguồn/kiểm soát trùng lặp không — không có trong code | 🟡 |
| OQ-6 | Ưu tiên P0/P1/P2 của từng FR | Code không ghi priority; chỉ suy được độ phủ E2E/unit | Business priority là thông tin ngoài code | 🟡 |
| OQ-7 | Đề vật hóa từ thư viện (`library_ref` không null) bị ẩn khỏi ngân hàng giáo viên — ai quản lý vòng đời/sửa/xóa chúng? | Snapshot loại trừ (`apps/server/src/routes/snapshot.ts:341-346`), tạo bởi study-pack clone `status "ready"` + `library_ref` (`apps/server/src/lib/study-pack-clone.ts:711,740-752`), không có UI riêng | Sự thuộc feature nào (study-pack?) và nhu cầu quản lý | 🟡 |
| OQ-8 | "Đã dùng N lớp" — N là số lớp distinct; có cần đếm số lượt giao hoặc số học viên không? | Map theo `classAssignments` theo promptId, đếm `Set<classId>` (`apps/web/src/routes/_auth/assignments/index.tsx:162-170`); label `Đã dùng ${used} lớp` (`apps/web/src/components/assignments/assignment-status.ts:202-204`) | Ý nghĩa báo cáo giáo viên không có trong code | 🟡 |
| OQ-9 | Mọi thành viên org đều sửa được toàn bộ ngân hàng — chấp nhận? | Route assignments không có role gate (`apps/server/src/routes/kernel.ts:448-453` + `apps/server/src/routes/assignments/index.ts:199-201` — PATCH chỉ check kernelCtx); chỉ student/admin bị chặn ở bootstrap (`apps/server/src/app.ts:222-240`); membership role teacher/assistant đều qua | Chính sách phân quyền nội org | 🟡 |
| OQ-10 | PATCH không đổi gì trả 200 `{id}` (no-op) — UI cần phân biệt "không có gì thay đổi" không? | `apps/server/src/routes/assignments/index.ts:511-512` | Quy ước UX | 🟡 |
| OQ-11 | TTL autosave 7 ngày và cap 512KB là con số cuối cùng? | TTL 7 ngày + cap 512KB (`apps/web/src/lib/assignment-draft-store.ts:17-23`) — comment giải thích lý do cap (~2.5x markup) nhưng không có nguồn nghiệp vụ cho 7 ngày | Hệ số nghiệp vụ (chu kỳ soạn đề) | 🟡 |

## Gaps (thứ code KHÔNG có)

| ID | Gap | Negative search đã làm | Nhãn |
|----|-----|------------------------|------|
| Gap-1 | Không xóa/lưu trữ đề khỏi ngân hàng (DB, API, UI đều không có) | `grep -rn "delete-assignment-prompt\|deleteAssignmentPrompt" apps/ packages/` → 0; `routes.delete\|kernel.delete` trong apps/server/src/routes/assignments + kernel.ts → chỉ tests.ts:135 và các route khác; UI "Xóa đề|Xoá đề" → 0 | 🟡 |
| Gap-2 | Không phân trang / infinite scroll / giới hạn số đề trả về | query snapshot không limit (`apps/server/src/routes/snapshot.ts:338-347`); UI map toàn bộ (`apps/web/src/lib/repos/assignment-prompts.ts:5-34`) | 🟡 |
| Gap-3 | Không có audit trail (ai sửa đề, khi nào — chỉ có `created_at`) | schema chỉ có createdAt (`packages/db/src/schema/assignment-prompt.ts:56-58`); PATCH không ghi log thay đổi (S1:465-509) | 🟡 |
| Gap-4 | Không có API đọc 1 đề riêng (GET /prompts/:id) — đọc qua snapshot; PATCH tự nạp row | route chỉ GET "/" (grading legacy), POST /prompts, PATCH /prompts/:id, POST /:id/grade (S1:103-193,199-525) | ✅ (mức chắc: code phủ nhận sự tồn tại) |
| Gap-5 | Không có nhân bản (duplicate) đề trong ngân hàng | grep "duplicate" chỉ ra rule sentend (contracts:1111-1121); không action clone | ✅ |
| Gap-6 | Không phân quyền theo role trong org trên route ngân hàng | xem OQ-9 | 🟡 |
| Gap-7 | Không kiểm tra trùng tiêu đề (2 đề cùng title hợp lệ) | title chỉ max 200 (`packages/api/src/contracts.ts:836`); create không check trùng (S1:113-153); reconcile create thậm chí khớp row theo title+skill (`apps/web/src/routes/_auth/assignments/new.tsx:997-1000`) — có thể khớp nhầm đề khác cùng tiêu đề | 🔵 |
| Gap-8 | Không có i18n — toàn bộ wording tiếng Việt hard-code trong component | wording tiếng Việt rải rác S4/S5/S24/S25; không thấy bảng message | ✅ |

## Conflicts (2 khẳng định code mâu thuẫn hoặc dễ hiểu sai)

| ID | Mâu thuẫn | Bên A | Bên B | Đề xuất |
|----|-----------|-------|-------|---------|
| Conflict-1 | Comment contract nói "ready = hiện khi giao từ trang Lớp học, draft = bản nháp riêng tư" (`packages/api/src/contracts.ts:827-830`) nhưng PATCH cho phép đưa đề đã giao về draft (metadata luôn sửa, `apps/server/src/routes/assignments/index.ts:471`) và nhãn ưu tiên draft trước "Đã dùng" (`apps/web/src/components/assignments/assignment-status.ts:199-205`) → đề đã giao có thể hiển thị "Bản nháp" | Contract comment + gate giao đề ready-only (`apps/server/src/routes/kernel.ts:1540-1542`) | Route PATCH + promptStatus | Quyết định OQ-2: chặn ready→draft khi `used>0`, hoặc đổi thứ tự nhãn |
| Conflict-2 | Schema định nghĩa 20+ message lỗi chi tiết ("audio required when ready"...), nhưng route gộp mọi lỗi schema thành `invalid body` 400 (`apps/server/src/routes/assignments/index.ts:96-99`) → message chi tiết không bao giờ lên wire; client phải tự mirror rules để tránh 400 mù (`apps/web/src/components/assignments/composer-transitions.ts:214-222` comment "the server only replies with a field-less 'invalid body'") | Catalog message chi tiết (contracts.ts:872-1124) | Wire thực tế | Giữ nguyên (client mirror là thiết kế) hay trả message chi tiết — cần chủ feature xác nhận |

## Inferred (suy luận có bằng chứng)

| ID | Suy luận | Bằng chứng | Nhãn |
|----|----------|-----------|------|
| Inf-1 | Tên feature "assignment-prompt-bank" — bank-first (#202), giao bài là luồng riêng (#208) | `apps/server/src/routes/assignments/index.ts:48-49,110-112`, `apps/e2e/specs/assignment-prompt-create.spec.ts:13-17` | 🔵 |
| Inf-2 | Seed demo dùng id prefix `demo-prompt:%` và bị loại khỏi snapshot thật | `apps/server/src/routes/snapshot.ts:343`, `apps/server/src/kernel.test.ts` (insert assignmentPrompt) | 🔵 |
| Inf-3 | assignment-tests là feature kế bên: dùng prompt làm nguyên liệu (PATCH prompt = "nguyên liệu nút Apply phase-5") nhưng có bảng/route/test riêng | `apps/server/src/routes/assignments/index.ts:49,195-199,527-529`, `apps/server/src/routes/assignments/tests.ts:20-29`, `packages/db/src/schema/assignment-test.ts` | 🔵 |
| Inf-4 | TTL 7 ngày của draft có lý do code sẵn: "Teacher-visible drafts expire after a week (no infinite resurrect banner)" | `apps/web/src/lib/assignment-draft-store.ts:17-18` | ✅ |
| Inf-5 | Client mirror toàn bộ rule ready để "không bao giờ gặp 400 mù": comment nói server chỉ trả "invalid body" không field | `apps/web/src/components/assignments/composer-transitions.ts:153-160,214-222`, `apps/web/src/routes/_auth/assignments/new.tsx:733-743` | 🔵 |
