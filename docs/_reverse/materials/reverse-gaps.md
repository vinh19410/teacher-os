---
feature: materials
type: reverse-gaps
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# reverse-gaps — materials

## OQ (câu hỏi mở — bối cảnh truy vết trong spec Mục 12; nhãn 🟡 đặt tại UC-01, UC-08)

- **OQ-01.** Cột người tạo lưu bắt buộc nhưng không hiển thị ở bất kỳ màn nào và
  không dùng phân quyền — ý định nghiệp vụ gì?
  packages/db/src/schema/material.ts:75; apps/web/src/routes/_auth/materials/index.tsx
  (0 hit hiển thị).
- **OQ-02.** Nhãn "Dùng ở N buổi" chỉ đếm buổi thật — không phản ánh lượt gắn
  giáo trình (xóa vẫn bị chặn vì giáo trình): có cần gộp số/nhãn riêng?
  apps/server/src/routes/materials.ts:67-68 vs :270-286.
- **OQ-03.** Trần 25 MiB tài liệu: nguồn gốc con số, có kế hoạch nâng theo gói
  edge (comment #647 chỉ giải thích trần 95 MiB media)?
  packages/api/src/material-contracts.ts:18-26.
- **OQ-04.** Không có hạn mức theo tổ chức cho bucket — cần quota không?
  negative-search #9.
- **OQ-05.** Xóa cứng, không thùng rác — có cần khôi phục? Dialog đã nói thẳng
  "Không thể hoàn tác."
  apps/web/src/components/materials/material-dialogs.tsx:566-568.
- **OQ-06.** Liên kết không kiểm còn sống — cần kiểm định kỳ/cảnh báo?
  packages/api/src/material-contracts.ts:332-341.
- **OQ-07.** Thư mục dùng chung mọi giáo viên, không quyền theo thư mục — ý định
  khi tổ chức lớn?
  packages/db/src/schema/material.ts:16-17.
- **OQ-08.** Nhãn "Copy theo bài của buổi" có đủ rõ về quy tắc buổi N ↔ bài N?
  apps/web/src/components/class-detail/session-materials-modal.tsx:257-259.
- **OQ-09.** Audit mồ côi #663 chỉ workflow thủ công — cần lịch định kỳ?
  .github/workflows/audit-663.yml:14-21.

## Negative-search (R3 — mọi khẳng định "không có" đều kèm lệnh + kết quả)

1. **Không có cờ feature cho materials.** Lệnh:
   `grep -rn "material" apps/web/src/lib/features.ts` → 0 hit (file chỉ có
   PARENT_REPORTS_ENABLED, AI_ENABLED, TEACHER_SIGNUP_ENABLED). Mục nav và route
   không bọc điều kiện. (FR-01)
2. **Bảng tài liệu chỉ có MỘT nơi ghi.** Lệnh:
   `grep -rn "insert(material)\|update(material)\|delete(material)" apps/server/src --include="*.ts" | grep -v ".test."`
   → 5 hit, tất cả trong apps/server/src/routes/materials.ts:1051,1079,1116,1158,1318.
   Không feature nào khác ghi bảng (feature Syllabus ghi bảng liên kết, không
   ghi bảng tài liệu). (BR-01, BR-06)
3. **Không có catalog i18n cho web/học viên.** Lệnh:
   `find apps/web/src apps/student/src -name "*.json" -path "*locale*" -o -name "i18n*" -o -name "*translations*"`
   → rỗng; wording là literal tiếng Việt trong TSX. (R2, NFR-10)
4. **Không có đường sửa loại/URL/key object sau khi tạo.** Lệnh:
   `grep -n -A30 'routes.patch("/materials/:id"' apps/server/src/routes/materials.ts | grep -E "title:|description:|folderId:|updatedAt:|kind:|url:|objectKey:"`
   → 4 hit title/description/folderId/updatedAt, 0 hit kind/url/objectKey —
   PATCH duy nhất (:1100-1133) chỉ set title/description/folderId/updatedAt;
   hợp đồng sửa `.strict()` chỉ 3 trường tùy chọn. (FR-12, BR-06)
5. **Không có giao diện quản trị bucket/danh sách object.** Lệnh:
   `grep -rln "material" apps/admin/src 2>/dev/null` → 0 hit. Bucket chỉ thao
   tác qua key suy từ row. (BR-10)
6. **Không có cron/scheduled job cho materials.** Lệnh:
   `grep -rniE "cron|schedul" apps/server/src/routes/materials.ts apps/server/src/lib/session-curriculum-materials.ts`
   → 1 hit duy nhất là chữ "schedule" trong comment (về lịch học, không phải
   job). (Mục 11, OQ-09)
7. **Không có test bị bỏ.** Lệnh:
   `grep -rEn "\.(skip|only|todo)\(" apps/server/src/routes/materials.test.ts apps/web/src/routes/_auth/materials/index.test.tsx packages/api/src/material-contracts.test.ts apps/server/src/lib/material-file-response.test.ts apps/server/src/lib/session-curriculum-materials.test.ts apps/web/src/components/materials/material-picker.test.tsx apps/web/src/components/class-detail/session-materials-modal.test.tsx apps/student/src/components/class/lesson-materials.test.tsx`
   → 0 hit. R1 đếm active: 35 + 15 + 15 + 5 + 9 + 5 + 5 + 7 = 96 unit + 5 e2e
   (1+2+1+1) = 101.
8. **Không có soft-delete/trash.** Lệnh:
   `grep -rniE "soft.?delete|deleted_at|trash" packages/db/src/schema/material.ts apps/server/src/routes/materials.ts`
   → 0 hit. (OQ-05)
9. **Không có quota theo tổ chức.** Lệnh:
   `grep -rniE "quota|maxMaterials|max_material" apps/server/src/routes/materials.ts packages/api/src/material-contracts.ts`
   → 0 hit. (OQ-04)
10. **Không có multipart/form-data upload.** Lệnh:
    `grep -rn "multipart\|formData" apps/server/src/routes/materials.ts apps/web/src/lib/repos/materials.ts`
    → 1 hit là comment "không multipart" (repos/materials.ts:7). Upload là byte
    thô PUT. (FR-11, FR-24)
11. **Audit #663 không tự chạy.** Lệnh:
    `grep -n "on:" -A2 .github/workflows/audit-663.yml` → chỉ workflow_dispatch
    (không push/schedule). (Mục 11, OQ-09)

## GAP (khoảng trống chứng minh)

- **GAP-1 (R1).** Nhánh 500 "upload failed" khi stream/kho lỗi (materials.ts:382-384,416-417):
  test #676 có mock stream lỗi hủy đúng object (materials.test.ts:2076-2098), nhưng
  nhánh "kho lỗi bẩm sinh" (store.put throw khác mismatch) chưa thấy test riêng —
  GAP kiểm, không phải GAP hành vi.
- **GAP-2.** Nhãn "Dùng ở N buổi" không đối xứng với guard xóa (buổi vs giáo
  trình) — hiển thị một nguồn, chặn hai nguồn. Đã thành OQ-02.
- **GAP-3.** e2e mỏng hơn unit: 5 test trình duyệt trên 4 spec, không có e2e cho
  trân trùng tên thư mục, quá-sâu, hay guard nghỉ-lễ (những nhánh đó chỉ được
  bảo vệ bởi test server jsdom-level). Liệt kê spec: S36-S39.
- **GAP-4.** Từ khóa tìm kiếm > 100 ký tự trả 400 (server) nhưng ô nhập đã kẹp
  maxLength 100 (index.tsx:259) — nhánh 400 gần như không chạm được từ UI; chỉ
  test API. (FR-08)
- **GAP-5.** Không có test nào cho E-13 "concurrent folder conflict" 409 sau 2
  lần phân loại fail (materials.ts:843,927) — cover gián tiếp qua test đồng thời
  #646 nhưng không assert đúng câu trả lời rỗng kép.

## INF (suy luận nhiều bằng chứng — 🔵)

- **INF-1.** Feature ĐANG SỐNG (không phải cụm hoãn): (a) mục nav không bọc cờ
  (sidebar.tsx:72-78, features.ts 0 hit material); (b) server + schema + migration
  + test đầy đủ và chạy không điều kiện; (c) e2e trình duyệt thật (S36-S38).
- **INF-2.** Chiến lược "kiểm nhiều lớp, hủy sớm": (a) client chặn trước bằng
  cùng hàm server (contracts.ts:4-9, repos/materials.ts:224-260); (b) server kiểm
  header → đuôi → magic → size thực (materials.ts:302-431); (c) mọi nhánh chặn
  đều cancel() stream trước khi trả lỗi (materials.ts:338,365,369,390,394) — mục
  tiêu rõ là không nhận byte rác và không để lại object dở.
- **INF-3.** Row là nguồn sự thật, object là phụ tù: xóa row trước (FK chặn khi
  còn tham chiếu), object sau (mồ côi chỉ là file chết trong bucket, không bao
  giờ row trỏ object mất) (materials.ts:139-150,1139-1178) + có công cụ audit
  đọc-only cho loại mồ côi liên kết (S40, S41).
- **INF-4.** Bucket nghỉ-lễ là hợp đồng 6 bề mặt phải đồng bộ — chính comment
  code liệt kê đủ 6 và cảnh báo drift (materials.ts:477-486) + guard CASE sinh
  từ cùng predicate (materials.ts:536-543) + test ma trận 2³ (materials.test.ts:1964-2028).

## CF (xung đột dữ liệu)

- Không phát hiện xung đột mã ↔ test ↔ migration trong phạm vi feature.
- Ghi chú một sự bất đối xứng CHỦ Ý (không phải xung đột): GET buổi holiday
  trả 200 trong khi POST/PUT/DELETE trả 409 — có chú thích lý do "modal đang mở
  vẫn render" (materials.ts:573-575) và test riêng cho cả hai phía
  (materials.test.ts:1539-1595).
