---
feature: study-pack
type: reverse-source-map
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-sources — study-pack

Bảng tài nguyên S. Range kiểm bằng đếm dòng thực tế (awk 'END{print NR}'), không
dùng wc -l (tệp không kết thúc bằng newline vẫn đúng).

| S-id | Path | Loại | Range | Confidence | Encoding | Ghi chú |
|---|---|---|---|---|---|---|
| S1 | apps/server/src/routes/study-pack.ts | code | 1-454 | ✅ | ts | 8 route + cổng vai trò + cửa đọc thân JSON |
| S2 | apps/server/src/lib/study-pack-clone.ts | code | 1-940 | ✅ | ts | validate nguồn mục + vật hoá đề + view pack; chunk D1 :30-35 |
| S3 | apps/server/src/lib/study-pack-assign.ts | code | 1-908 | ✅ | ts | lịch + gán + huỷ + bù học viên muộn + view lớp |
| S4 | packages/db/src/schema/study-pack.ts | code | 1-146 | ✅ | ts | 4 bảng: exercise/pack/item/classStudyPack |
| S5 | packages/db/src/migrations/0060_study_pack.sql | migration | 1-79 | ✅ | sql | 4 bảng + available_at/class_study_pack_id + library_ref unique + dọn #526 |
| S6 | packages/db/src/migrations/0061_petite_dormammu.sql | migration | 1-1 | ✅ | sql | tái tạo unique (org, source_pack_id) của study_pack |
| S7 | packages/api/src/contracts.ts | code | 1-4801 | ✅ | ts | đoạn feature 4456-4801: hằng số + schema + view DTO |
| S8 | apps/web/src/routes/_auth/assignments/packs.tsx | client route | 1-733 | ✅ | tsx | kho bộ đề GVD: 2 phạm vi, soạn, nhân bản, xoá |
| S9 | apps/web/src/components/classes/class-study-pack-section.tsx | client component | 1-481 | ✅ | tsx | gán lớp + xem trước lịch + tiến độ + huỷ |
| S10 | apps/web/src/lib/repos/study-pack.ts | client lib | 1-151 | ✅ | ts | 8 fetcher + gắn studyPackErrorCode vào lỗi |
| S11 | apps/e2e/specs/study-pack.spec.ts | e2e | 1-334 | ✅ | ts | 1 test trọn tuyến (R1) + check 3 khổ |
| S12 | apps/server/src/routes/study-pack.test.ts | test | 1-926 | ✅ | ts | 4 test API (R1) |
| S13 | apps/server/src/lib/study-pack-assign.test.ts | test | 1-619 | ✅ | ts | 3 test lịch/gán/huỷ (R1) |
| S14 | apps/server/src/lib/study-pack-clone.test.ts | test | 1-360 | ✅ | ts | 3 test chunk/validate/vật hoá (R1) |
| S15 | apps/server/src/study-pack-migration.test.ts | test | 1-446 | ✅ | ts | 5 test migration 0060 + hợp đồng Zod (R1) |
| S16 | apps/web/src/components/classes/class-study-pack-section.test.tsx | test | 1-301 | ✅ | tsx | 5 test component (R1) |
| S17 | packages/auth/src/role.ts | code | 1-177 | ✅ | ts | hai nhóm vai mượn từ khối chấm bài :105-142 |
| S18 | apps/server/src/lib/assignment-visibility.ts | code | 1-16 | ✅ | ts | bộ lọc thời điểm mở bài dùng chung |
| S19 | apps/server/src/routes/enrollment-activation.ts | code | 1-776 | ✅ | ts | 3 đường kích hoạt gọi bù mục tiêu :697, :748, :769 |
| S20 | apps/server/src/routes/kernel.ts | code | 1-3523 | ✅ | ts | mount router :3493 (sau middleware Origin/content-type :3490-3491) |
| S21 | packages/api/src/vietnam-date.ts | code | 1-316 | ✅ | ts | hôm nay/cộng ngày/múi giờ Việt Nam :27-46, :99 |
| S22 | apps/server/src/routes/holidays.ts | code | 1-1012 | ✅ | ts | đọc ngày nghỉ theo tổ chức+phạm vi lớp :166-171 |
| S23 | apps/server/src/routes/admin-library.ts | code (cross-ref) | 1-1244 | ✅ | ts | phía hệ thống: DELETE pack đếm lượt gán :1214-1241 (không soạn lại) |
| S24 | apps/server/src/routes/student.ts | code (cross-ref) | 1-2468 | ✅ | ts | cổng học viên: 404 trước giờ :1354-1383, :918 |
| S25 | apps/server/src/kernel.test.ts | test (cross-ref) | 1-7844 | ✅ | ts | 1 test liên quan: bù KHÔNG đụng bài giao thường :6712-6737 |
| S26 | apps/e2e/src/boot.ts | e2e boot (cross-ref) | 1-299 | ✅ | ts | công cụ dịch available_at/due_at :216-275 |
| S27 | apps/e2e/specs/class-assign.spec.ts | e2e (cross-ref) | 1-411 | ✅ | ts | dịch due_at để kiểm quá hạn :389-400 |
| S28 | apps/web/src/routes/_auth/assignments/index.tsx | client route | 1-540 | ✅ | tsx | nút dẫn "Bộ đề tự học" :276-287 |
| S29 | apps/web/src/routes/_auth/classes/$classId.tsx | client route | 1-511 | ✅ | tsx | tab "Buổi học & luyện tập" :312 + chế độ "Bộ đề tự học" :340-366 |
| S30 | apps/student/src/components/overview/assignment-row.tsx | client component (cross-ref) | 1-77 | ✅ | tsx | nhãn "Làm bài: <đề>" :67-71 |
| S31 | packages/db/src/schema/class-assignment.ts | code (cross-ref) | 1-78 | ✅ | ts | cột available_at :38, class_study_pack_id :39, index :47 |
| S32 | plans/261101-1357-533-study-pack-scheduled-release/plan.md | doc (plan) | 1-115 | ✅ | md | kế hoạch #533: quyết định đã chốt :21-30, non-goal :40-44, RT-1..6 :84-91 |
| S33 | plans/261101-1357-533-study-pack-scheduled-release/phase-01-schema-migration-contracts.md | doc (plan) | 1-144 | ✅ | md | phase schema/migration/hợp đồng, gỡ #526 |
| S34 | plans/261101-1357-533-study-pack-scheduled-release/phase-02-grammar-vocabulary-exercises.md | doc (plan) | 1-119 | ✅ | md | phase dạng bài grammar/vocabulary tự chấm |
| S35 | plans/261101-1357-533-study-pack-scheduled-release/phase-03-pack-library-and-org-api.md | doc (plan) | 1-89 | ✅ | md | phase API org + thư viện hệ thống; cổng vai :66; clone :71 |
| S36 | plans/261101-1357-533-study-pack-scheduled-release/phase-04-assign-to-class-and-read-time-gate.md | doc (plan) | 1-120 | ✅ | md | phase gán lớp + lọc lúc đọc + hook enrollment |
| S37 | plans/261101-1357-533-study-pack-scheduled-release/phase-05-ui-and-e2e.md | doc (plan) | 1-88 | ✅ | md | phase UI giáo viên + e2e; form soạn :51; nút chế độ :53 |

Ghi chú phạm vi bảng S: S1-S22 là bằng chứng trực tiếp của feature; S23-S31 là
điểm giao (chỉ trỏ, nội dung thuộc feature khác — assignments, admin-library,
holidays, student-quiz); S32-S37 là tài liệu kế hoạch thi công #533 trong repo
(dùng đối chiếu ý đồ, không thay bằng chứng code — plan là ý định, code là thật).

Provenance: mọi range đã đo trên working tree tại HEAD 8277bfb4; các tệp code
(S1-S31) trùng nội dung d6c0f6b5 trừ S7 (thêm 2 dòng ở đoạn #675, trước đoạn
feature — chi tiết _evidence.md §Provenance). S32-S37 là tệp docs của kế hoạch,
đã có sẵn trong cây tại cả hai commit.
