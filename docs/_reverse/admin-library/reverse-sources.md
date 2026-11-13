---
feature: admin-library
type: reverse-source-map
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-sources — admin-library

Bảng tài nguyên S. Range kiểm bằng đếm dòng thực tế (awk END NR), không dùng wc -l.

| S-id | Path | Loại | Range | Confidence | Encoding | Ghi chú |
|---|---|---|---|---|---|---|
| S1 | apps/server/src/routes/admin-library.ts | code | 1-1198 | ✅ | ts | 19 route; header plan #413/#425/#305 dòng 66-79 |
| S2 | packages/api/src/library-contracts.ts | code | 1-548 | ✅ | ts | hợp đồng đề/part + partIssues + validateTestReady |
| S3 | packages/db/src/schema/library-test.ts | code | 1-103 | ✅ | ts | library_test + library_test_part |
| S4 | packages/db/src/schema/study-pack.ts | code | 1-146 | ✅ | ts | 4 bảng: exercise/pack/item/class |
| S5 | apps/server/src/lib/require-admin.ts | code | 1-70 | ✅ | ts | cổng admin phase 1 + /me |
| S6 | apps/server/src/lib/media-response.ts | code | 1-46 | ✅ | ts | header media an toàn + RFC8187 |
| S7 | apps/server/src/lib/study-pack-clone.ts | code | 1-940 | ✅ | ts | validate item + vật hóa + bảo toàn mã mục |
| S8 | apps/server/src/app.ts | code | 1-481 | ✅ | ts | mount route thư viện + bootstrap |
| S9 | packages/api/src/contracts.ts | code | 1-4799 | ✅ | ts | phần dùng chung: preset 410-447, pack 4456-4714 |
| S10 | packages/db/src/migrations/0043_rainy_edwin_jarvis.sql | migration | 1-40 | ✅ | sql | sinh 2 bảng đề + part |
| S11 | packages/db/src/migrations/0044_library_part_groups.sql | migration | 1-1 | ✅ | sql | thêm cột groups (mặc định `[]`) |
| S12 | packages/db/src/migrations/0060_study_pack.sql | migration | 1-79 | ✅ | sql | 4 bảng pack + library_ref vật hóa |
| S13 | packages/db/src/migrations/0061_petite_dormammu.sql | migration | 1-1 | ✅ | sql | chỉnh chỉ mục pack |
| S14 | apps/admin/src/routes/_auth/library/tests/index.tsx | client route | 1-280 | ✅ | tsx | danh sách + lọc + xóa |
| S15 | apps/admin/src/routes/_auth/library/tests/new.tsx | client route | 1-122 | ✅ | tsx | form tạo đề |
| S16 | apps/admin/src/routes/_auth/library/tests/$testId.tsx | client route | 1-779 | ✅ | tsx | trang soạn: header, part, audio, publish, preview |
| S17 | apps/admin/src/routes/_auth/library/packs.tsx | client route | 1-446 | ✅ | tsx | bài tập + bộ đề hệ thống (JSON textarea) |
| S18 | apps/admin/src/lib/repos/library.ts | client lib | 1-315 | ✅ | ts | fetchers + LibraryHttpError + upload XHR |
| S19 | apps/admin/src/components/library/library-filters.ts | client component | 1-169 | ✅ | ts | state lọc + sync search params |
| S20 | apps/admin/src/components/library/library-error.ts | client component | 1-46 | ✅ | ts | map mã lỗi → wording tiếng Việt |
| S21 | apps/admin/src/components/library/publish-bar.tsx | client component | 1-140 | ✅ | tsx | thanh trạng thái + nút xuất bản/hạ |
| S22 | apps/admin/src/components/library/delete-test-dialog.tsx | client component | 1-87 | ✅ | tsx | hộp thoại xóa đề |
| S23 | apps/admin/src/components/library/test-table.tsx | client component | 1-125 | ✅ | tsx | bảng đề |
| S24 | apps/admin/src/components/library/audio-uploader.tsx | client component | 1-317 | ✅ | tsx | uploader progress + hủy |
| S25 | apps/admin/src/components/library/part-form.tsx | client component | 1-946 | ✅ | tsx | form part; banner nhóm hỏng 804-826 |
| S26 | apps/admin/src/components/library/test-header-form.tsx | client component | 1-323 | ✅ | tsx | metadata header lưu theo blur |
| S27 | apps/admin/src/components/library/part-issues.ts | client component | 1-144 | ✅ | ts | format lý do tiếng Việt |
| S28 | apps/admin/src/components/library/effective-parts.ts | client component | 1-126 | ✅ | ts | gộp part lưu + đang soạn |
| S29 | apps/admin/src/components/library/test-outline-model.ts | client component | 1-171 | ✅ | ts | khung part theo kỹ năng |
| S30 | apps/admin/src/components/library/test-preview-model.ts | client component | 1-139 | ✅ | ts | model xem trước |
| S31 | apps/admin/src/components/library/answers-overview.ts | client component | 1-81 | ✅ | ts | tổng hợp đáp án |
| S32 | apps/admin/src/components/layout/admin-shell.tsx | client component | 1-76 | ✅ | tsx | nav console (1 mục "Thư viện đề") |
| S33 | apps/server/src/routes/admin-library.test.ts | test | 1-1656 | ✅ | ts | 29 test: role/CSRF/nhóm hỏng/pack (R1) |
| S34 | apps/server/src/routes/admin-library-audio.test.ts | test | 1-647 | ✅ | ts | 15 test audio CAS/purge/503 (R1; WORKING TREE — khác HEAD) |
| S35 | apps/e2e/specs/admin-library-listening.spec.ts | e2e | 1-326 | ✅ | ts | soạn đề nghe + upload audio + publish |
| S36 | apps/e2e/specs/admin-library-reading.spec.ts | e2e | 1-824 | ✅ | ts | soạn đề đọc + publish + preview |
| S37 | apps/e2e/specs/vocab-library-clone.spec.ts | e2e | 1-604 | ✅ | ts | precedent `vocab_library_*` (#361) — mô hình "kho dùng chung + sao xuống lớp" mà route thư viện noi theo |

Ghi chú phạm vi bảng S: chỉ liệt kê tệp có bằng chứng trực tiếp cho feature; các tệp
chung hạ tầng (contracts.ts, app.ts) ghi kèm dòng đoạn liên quan trong ghi chú.

Không có S-id nào trỏ tài liệu `.md` trong repo (không có tài liệu feature hiện có — Mục 0.3).
