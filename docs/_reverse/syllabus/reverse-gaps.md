# Gaps, Conflicts & Open Questions — feature `syllabus`

## Open Questions (OQ)

- [ ] **OQ-1** — Trần **52 buổi/lớp** (`apps/server/src/routes/syllabus.ts:492`, chuỗi lỗi "Template vượt quá giới hạn 52 buổi học của lớp.") là quy tắc sản phẩm (mỗi khóa học ≤ 52 tuần?) hay giới hạn kỹ thuật tạm? Ảnh hưởng: BR-syllabus-007, thông báo lỗi, test biên. Cần chủ sản phẩm xác nhận. Nhãn: 🟡.
- [ ] **OQ-2** — Không có route nào **sửa metadata template** (tên, trình độ, loại lớp, kỹ năng, mô tả) sau khi tạo — chỉ có thay toàn bộ cây nội dung (`replace-content`). GV gõ sai trình độ Band 6.5 → 6.5 thì phải tạo template mới hay có kế hoạch thêm? Nhãn: 🟡 (negative-search §7.1).
- [ ] **OQ-3** — Cột `total_lessons` được ghi lúc create/replace nhưng UI luôn recompute từ cây và gọi nó là "dead form value" (`apps/web/src/lib/repos/syllabus.ts:43-46`). Giữ cột chỉ để phục vụ gì (sort? seed? API ngoài)? Nếu không → xóa cột. Nhãn: 🟡.
- [ ] **OQ-4** — Quyền trên template dùng chung: code chỉ guard theo org (`orgId`), không có khái niệm "chủ template" hay per-teacher ACL. Giả định mọi giáo viên trong org sửa được template của nhau — đúng ý sản phẩm chưa? Nhãn: 🟡.
- [ ] **OQ-5** — Contract `syllabusModuleContentSchema` cho phép đặt `status` (`done`/`current`) cho bài của TEMPLATE qua create/replace (default `upcoming`, nhưng caller API trực tiếp có thể gửi `done`) — trong khi nguyên tắc nói "status là tiến độ per-lớp". Có phải lỗ hổng hợp đồng cần siết về `upcoming`? Nhãn: 🟡 (Conflict C-1).
- [ ] **OQ-6** — Trần 52 đếm theo SỐ BÀI của template (`tree.lessons.length`), trong khi trần 500 đếm module + bài + links. Kịch bản template >52 bài dùng nội bộ (lớp auto) vẫn import được nếu lớp đã có buổi — đây là chủ ý hay hệ quả nhánh `hasLesson`? Nhãn: 🟡.
- [ ] **OQ-7** — Success criteria nghiệp vụ (tỷ lệ import thành công, thời gian tạo giáo trình) chưa được đo ở bất kỳ đâu trong code — chỉ có test hành vi. Có cần metric không? Nhãn: 🟡.
- [ ] **OQ-8** — `schedulingMode` có thể bị ghi `NULL` trên lớp CÓ giáo trình trong 2 nhánh SQL phòng thủ (`apps/server/src/routes/syllabus.ts:533`, `apps/server/src/routes/kernel.ts:2575`). NULL nghĩa là "không xác định vì lớp theo copy" — cần chốt ngữ nghĩa để không phá logic `isManualClass`. Nhãn: 🟡.

## Gaps (điều code KHÔNG có — mặc dù nghiệp vụ có thể cần)

- **Gap-1: Không sửa metadata template sau tạo.** Negative-search: không có route PATCH/PUT hay handler update metadata trong `apps/server/src/routes/syllabus.ts` (chỉ create/replace/remove/import/remove-curriculum + content routes). Liên quan OQ-2.
- **Gap-2: Không có export giáo trình ra file** (ngược với import) — parse chỉ 1 chiều client→app.
- **Gap-3: Không có bản sao/duplicate template** ("nhân bản giáo trình để chỉnh nhẹ") — copy chỉ xảy ra khi import vào lớp.
- **Gap-4: Không có soft delete / thùng rác** — xóa template là hard delete, không có `deleted_at` trong schema (`packages/db/src/schema/syllabus.ts:12-51`). Nhãn: 🟡 cho giả định "không cần undo".
- **Gap-5: Không có thứ tự hiển thị riêng cho links tài liệu trên UI badge** — badge chỉ đếm (`apps/web/src/components/syllabus/lesson-bank-materials-badge.tsx:9-16`); xem/sửa qua modal Sửa buổi.
- **Gap-6: Không có cảnh báo trước khi ghi đè nếu lớp đang dùng template** — modal ghi đè nói "Các lớp đã nhập bản sao từ template này không bị ảnh hưởng" (`apps/web/src/routes/_auth/syllabus/$syllabusId.tsx:423-430`) nhưng không liệt kê lớp nào đang dùng ngay trong modal (danh sách lớp nằm dưới trang).

## Conflicts (mâu thuẫn giữa các nguồn trong code)

- **C-1 — status trên bài template:** comment schema (`packages/db/src/schema/syllabus.ts:93-99`) + `buildImportBatch` (`apps/server/src/lib/syllabus-curriculum.ts:192-197`) khẳng định status là "tiến độ per-lớp, reset upcoming khi copy", nhưng `syllabusModuleContentSchema` (`packages/api/src/contracts.ts:197`) vẫn nhận `done`/`current` cho template qua API. Mức độ: thấp (UI luôn gửi `upcoming`); đã ghi OQ-5.
- **C-2 — hai nguồn đếm số buổi:** `syllabus.total_lessons` (lưu) vs recompute từ cây trong UI (`apps/web/src/lib/repos/syllabus.ts:64`) và trong statistic (`apps/web/src/routes/_auth/syllabus/index.tsx:45`). Server ghi cả hai nơi khi replace (`apps/server/src/routes/syllabus.ts:212-245`) nhưng create từ file ghi `input.totalLessons` (form) — có thể lệch nếu caller tự do gửi totalLessons khác cây. Mức độ: thấp; đã ghi OQ-3.

## Inferred (suy ra từ code, không có statement tường minh)

- **I-1 (🔵):** Feature hướng giáo viên duy nhất — mọi route nằm sau kernel ctx và UI nằm trong `_auth`; không có đường cho học sinh. Hậu thuẫn: `apps/server/src/routes/syllabus.ts:51-53`, cây thư mục `apps/web/src/routes/_auth/`, negative-search student routes.
- **I-2 (🔵):** Template dùng chung tổ chức, không sở hữu cá nhân — wording UI "Đây là giáo trình mẫu của tổ chức" (`apps/web/src/components/syllabus/syllabus-mutations.tsx:154`) + badge đếm mức org.
- **I-3 (🔵):** Ưu tiên P0 cho tạo/import vào lớp vì có đầy đủ test e2e + unit dày đặc nhất (e2e 5 spec, unit 670-1..670-6) — độ đầu tư test phản ánh độ quan trọng.
- **I-4 (🔵):** Deep-copy (không tham chiếu) là quyết định kiến trúc cốt lõi: bản copy chịu chi phí dữ liệu gấp đôi để đổi lấy độc lập hoàn toàn giữa lớp và template. Hậu thuẫn: `buildImportBatch` sinh UUID mới toàn bộ (`apps/server/src/lib/syllabus-curriculum.ts:152-158`), comment `apps/server/src/routes/syllabus.ts:279-282`, migration 0009 backfill copy tree.
- **I-5 (🔵):** Trạng thái "kẹt" giữa import và backfill được chấp nhận tồn tại tạm thời và được heal khi có thao tác kế tiếp (self-heal thay vì distributed transaction). Hậu thuẫn: comment `apps/server/src/routes/syllabus.ts:363-367`, test 670-3 "partial backfill self-heals on retry".
- **I-6 (🔵):** Buổi thi (midterm/final) là phần của giáo trình, không phải entity riêng — chỉ là `kind` trên `syllabus_lesson` + hiển thị badge/tint. Hậu thuẫn: `apps/web/src/components/syllabus/lesson-kind.tsx:13-16`, migration 0014, e2e test-session-mark.
