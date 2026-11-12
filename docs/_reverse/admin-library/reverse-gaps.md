---
feature: admin-library
type: reverse-gaps
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-gaps — admin-library

## OQ (câu hỏi mở — kèm 🟡 trong spec)

| OQ | Câu hỏi | Vì sao không tự trả lời được | Bằng chứng hiện có |
|---|---|---|---|
| OQ-01 | Ai là người dùng thực tế của console thư viện (biên tập viên riêng hay admin vận hành)? | Chỉ có một cổng admin; không thấy phân vai tinh hơn trong code hay tài liệu | apps/server/src/lib/require-admin.ts:11-14 |
| OQ-02 | Bộ sưu tập/nhóm đề phục vụ ai — chỉ lọc trong console hay là danh mục catalog học viên? | Nghiệp vụ đích không ghi trong code; phía học viên có lọc bộ sưu tập khớp chính xác | apps/server/src/routes/admin-library.ts:425-428, apps/server/src/routes/student-practice.ts:251-259 |
| OQ-03 | Xóa đề không chặn khi đang được tham chiếu qua bản vật hóa — chính sách là gì? | Không comment ý đồ; hành vi trái ngược với pack (chặn tham chiếu) | apps/server/src/routes/admin-library.ts:589-613, apps/server/src/routes/admin-library.ts:1177-1187 |
| OQ-04 | Sửa part khi đang xuất bản được phép nhưng xóa part/audio bị chặn — nguyên tắc nào đằng sau? | Hành vi nhất quán nhưng không có comment giải thích ranh giới | apps/server/src/routes/admin-library.ts:656-670, apps/server/src/routes/admin-library.ts:703-705 |
| OQ-05 | Quy tắc nghiệp vụ gốc của "đủ ngân hàng đáp án theo dạng bài"? | Luật tái dùng khối ngân hàng bài tập lớp; ý nghĩa gốc nằm ngoài feature | packages/api/src/library-contracts.ts:143-152 |
| OQ-06 | Trách nhiệm chất lượng ghim ảnh khi soạn (đủ số ghim) thuộc ai? | Chỉ thấy luật từ chối, không thấy hướng dẫn quy trình | packages/api/src/library-contracts.ts:263-438 |
| OQ-07 | Căn cứ các trần 50 MB / 366 ngày / 10 mục ngày / 200 mục? | Hằng số không comment căn cứ (50 MB có ghi chú khớp media nói) | packages/api/src/library-contracts.ts:35-36, packages/api/src/contracts.ts:4478-4480 |
| OQ-08 | Quy trình "dọn tay" object mồ côi audio — ai làm, tần suất? | Chỉ có comment chấp nhận trạng thái + log | apps/server/src/routes/admin-library.ts:601-602, apps/server/src/routes/admin-library.ts:820-825 |
| OQ-09 | Nguồn nhóm hỏng là schema siết chặt (#425) — khi nào lớp bảo vệ này có thể bỏ? | Comment ghi nguồn quá khứ nhưng không có kế hoạch gỡ | apps/server/src/routes/admin-library.ts:159-165, apps/server/src/routes/admin-library.ts:631-633 |
| OQ-10 | GET audio chưa hỗ trợ Range — có nhu cầu tua/đoạn trong học nghe? | Comment "chưa Range" không nêu kế hoạch | apps/server/src/routes/admin-library.ts:832-833 |
| OQ-11 | Wording riêng cho 409 xóa bị chặn (client chỉ toast chung, không nói lớp/bộ nào đang dùng)? | Client nuốt chi tiết lỗi, hiện thông báo chung | apps/admin/src/routes/_auth/library/packs.tsx:171-173, apps/admin/src/routes/_auth/library/packs.tsx:212-214 |
| OQ-12 | Bộ đề hệ thống có cần vòng đời nháp/sẵn sàng có ý nghĩa như đề không? | Cột trạng thái tồn tại nhưng route cho đặt tùy ý, không có luật sẵn sàng cho pack | apps/server/src/routes/admin-library.ts:1086-1092, packages/db/src/schema/study-pack.ts:58 |
| OQ-13 | Thay đổi chưa commit trong test audio (cỡ dữ liệu nền 4 → 16) phục vụ điều gì? | Diff không kèm message; là thay đổi cục bộ ngoài HEAD | apps/server/src/routes/admin-library-audio.test.ts:228, apps/server/src/routes/admin-library-audio.test.ts:306 (so với HEAD) |
| OQ-14 | Môi trường nào chạy thiếu kho audio và chính sách thông báo người dùng cuối? | Binding cấu hình nằm ngoài repo; chỉ thấy nhánh degrade | apps/server/src/routes/admin-library.ts:83-85, apps/admin/src/components/library/library-error.ts:20-21 |

## GAP (khoảng trống chứng minh)

| GAP | Mô tả | Đã kiểm |
|---|---|---|
| GAP-01 | Xóa đề khi đang tham chiếu qua bản vật hóa KHÔNG có test nào chốt hành vi (tạo đề → vật hóa → xóa đề → bài giao vẫn chạy?) | test xóa đề chỉ phủ happy path + 404 lần 2 — apps/server/src/routes/admin-library.test.ts:740-773 |
| GAP-02 | Chuỗi "AUDIO_CHANGED" không được test khẳng định trực tiếp (CAS thua chỉ khẳng định HTTP 409 + dọn object); nhánh CAS thua khi XÓA audio không có test | apps/server/src/routes/admin-library-audio.test.ts:452-486; grep AUDIO_CHANGED cả 2 tệp test → 0 match |
| GAP-03 | Packs/exercises chưa có e2e; chỉ test API | apps/e2e/specs/ chỉ có reading/listening cho library |
| GAP-04 | Luật trần pack (366/10/200) chưa thấy test API riêng ở admin-library.test.ts (chỉ ở tầng schema) | grep MAX_PACK_DAYS trong test — không có |
| GAP-05 | (đã kiểm lại — RÚT GAP) UI xem trước CÓ test: test-preview-model.test.ts và test-preview-overlay.test.tsx; thư viện admin có 15 tệp component test | apps/admin/src/components/library/test-preview-model.test.ts, apps/admin/src/components/library/test-preview-overlay.test.tsx |

## INF (suy luận nhiều bằng chứng — 🔵)

| INF | Kết luận | Bằng chứng |
|---|---|---|
| INF-01 | Học viên không bao giờ đọc trực tiếp bảng đề thư viện — mọi đề đến học viên qua bản chụp assignment_prompt | apps/server/src/routes/student-practice.ts:44-90; packages/db/src/migrations/0060_study_pack.sql (library_ref); grep app học viên không select library_test |
| INF-02 | Route thư viện cố ý tách khỏi kernel org-scoped vì dữ liệu toàn hệ thống (precedent vocab_library) | apps/server/src/routes/admin-library.ts:66-72; S37 vocab-library-clone; schema library_test không có org_id |
| INF-03 | Giao lớp luôn vật hóa bản sao (không dùng chung) để sửa hai phía độc lập | apps/server/src/lib/study-pack-clone.ts:354-632; 0060_study_pack.sql unique org+library_ref; BR-16 |
| INF-04 | Xóa audio idempotent theo thiết kế (đọc lại bản ghi sau xóa bản ghi để phân định thua CAS) | apps/server/src/routes/admin-library.ts:884-892 (re-read sau update); FR-27 |

## CF (xung đột dữ liệu)

| CF | Mô tả | Giải quyết |
|---|---|---|
| CF-01 | Comment hợp đồng nói "PATCH metadata không có status" nhưng route PATCH chấp nhận và xử lý status (publish/unpublish) | Code là chuẩn (route xử lý status ngoài schema, dòng 525-534); comment coi như lỗi thời — ghi nhận ở FR-10, không sửa code (read-only) |
| CF-02 | Working tree admin-library-audio.test.ts khác HEAD (cỡ dữ liệu 4 → 16 × 2 chỗ) | Dùng bản working tree làm bằng chứng chính + 🟡 OQ-13; không checkout/đảo ngược |
| CF-03 | Comment migrate 0043 ghi "mặc định 60 phút" (timeLimitSeconds 3600) — giờ không phút nhưng comment đúng nghĩa 3600 giây | Không mâu thuẫn thực chất; ghi chú là đủ |

## Negative searches (chứng minh không tồn tại)

- Không có marker test bỏ qua: `grep -rn "test\.skip\|describe\.skip\|it\.skip\|test\.only\|\.todo" apps/server/src/routes/admin-library*.test.ts apps/e2e/specs/admin-library-*.spec.ts` → 0 match.
- Không có i18n catalog trong admin: `grep -rn "i18n\|useTranslation" apps/admin/src/components/library apps/admin/src/routes/_auth/library` → 0 match (wording ghim trực tiếp trong component — R2).
- Không app học viên/giáo viên select bảng đề trực tiếp: `grep -rn "libraryTest\b\|library_test\"" apps/server/src/routes apps/server/src/lib | grep -v admin-library` → chỉ study-pack-clone vật hóa qua library_ref, không select thẳng bảng đề.
- Không có route xóa-hàng-loạt / import đề từ file: `grep -n "import\b" apps/server/src/routes/admin-library.ts` → không có handler upload đề.
