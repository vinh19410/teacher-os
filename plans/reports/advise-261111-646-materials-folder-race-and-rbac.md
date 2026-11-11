# Tư vấn kỹ thuật — Issue #646: Chặn race chu trình thư mục tài liệu & tách phân quyền khỏi chấm bài

- **Issue nguồn:** [#646](https://github.com/vinh19410/teacher-os/issues/646)
- **Ngày tư vấn:** 2026-11-11

---

## Định hình lại bài toán (Confirmed Reframing)

### Bài toán (Reframed)
Module Ngân hàng tài liệu hiện có hai lỗ hổng về tính đúng đắn dữ liệu và phân quyền: (1) ở tầng dữ liệu, `PATCH /api/materials/folders/:id` và `POST /api/materials/folders` kiểm tra chu trình và trần độ sâu 5 cấp bằng cách đọc danh sách thư mục lên bộ nhớ JS trước rồi mới ghi SQL rời, nên hai thao tác đồng thời có thể tạo chu trình `parentId` hoặc vượt trần 5 cấp trong D1/SQLite, còn `flattenFolderTree` trên web lại bỏ qua mọi thư mục không đi tới được từ gốc khiến các thư mục dính vòng biến mất hoàn toàn khỏi giao diện; (2) ở tầng phân quyền, `materials.ts` đang mượn `canReviewGrade`/`canPublishGrade` của luồng chấm bài (tạo liên kết ngầm giữa hai miền nghiệp vụ khác nhau), đồng thời giao diện web trên cả 3 bề mặt (`/materials`, `SessionMaterialsModal`, và `MaterialPicker`) vẫn hiển thị các nút ghi tài liệu cho vai trò `ta` dù bấm vào luôn nhận lỗi `403 FORBIDDEN`.

### Yêu cầu chi tiết (Exact requirements)
1. **Chặn nguyên tử chu trình & độ sâu thư mục trên Server (`apps/server/src/routes/materials.ts`):**
   - Trong `PATCH /materials/folders/:id` (khi `nextParent !== null && nextParent !== current.parentId`), nhúng guard SQL `WITH RECURSIVE` trực tiếp vào mệnh đề `WHERE` của câu `UPDATE material_folder` để kiểm tra nguyên tử tại thời điểm ghi: `nextParent` còn tồn tại trong cùng `orgId`, `id` không nằm trong chuỗi tổ tiên của `nextParent` (không tạo vòng), chuỗi tổ tiên không bị hỏng chu trình, và `depth(nextParent) + subtreeHeight(id) <= MATERIAL_FOLDER_MAX_DEPTH (5)` (trong đó CTE duyệt cây con của `id` loại trừ cạnh quay về chính `id` để vẫn cho phép di chuyển thư mục đang kẹt vòng sang cha hợp lệ).
   - Trong `POST /materials/folders` (khi `parentId !== null`), dùng `INSERT INTO material_folder ... SELECT ... WHERE ...` kèm guard `WITH RECURSIVE` để kiểm tra nguyên tử `parentId` còn thuộc `orgId` và `depth(parentId) + 1 <= MATERIAL_FOLDER_MAX_DEPTH (5)`.
   - Khi câu ghi trả về 0 dòng do thua race, đọc lại trạng thái thư mục hiện tại để phân loại và trả đúng mã lỗi nghiệp vụ hiện có (`404 FOLDER_NOT_FOUND`, `400 FOLDER_CYCLE`, hoặc `400 FOLDER_TOO_DEEP`), không cần bước ghi-rồi-hoàn-tác.
2. **Hiển thị an toàn thư mục không tới được từ gốc ở Client (`apps/web/src/lib/material-folders.ts`):**
   - Cập nhật `flattenFolderTree(folders)`: sau khi `walk(null, 0)` duyệt xong các nhánh nối tới gốc, tiếp tục duyệt các thư mục còn chưa thăm (`!seen.has(f.id)`) theo thứ tự định sẵn `byName`, coi điểm vào của mỗi thành phần bị cô lập/chu trình như thư mục gốc (`depth = 0`), duyệt con cháu của nó và cắt cạnh quay lui bằng tập `seen`.
   - Kẹp mức thụt lề hiển thị ở `FolderPanel` tối đa `MATERIAL_FOLDER_MAX_DEPTH - 1` để dữ liệu lệch lịch sử không làm tràn cột trái 280px.
3. **Tách hàm phân quyền riêng cho Tài liệu (`packages/auth/src/role.ts` & `apps/server/src/routes/materials.ts`):**
   - Định nghĩa `MATERIAL_WRITE_ROLES = ["teacher", "owner", "admin", "class_teacher"] as const`, `MATERIAL_READ_ROLES = [...MATERIAL_WRITE_ROLES, "ta"] as const`, cùng hai hàm `canWriteMaterials(role)` và `canReadMaterials(role)` với bảng tra riêng độc lập hoàn toàn với `GRADING_*`.
   - Thay `canReviewGrade` / `canPublishGrade` trong middleware `gate` của `apps/server/src/routes/materials.ts` bằng `canReadMaterials` / `canWriteMaterials`.
4. **Ẩn toàn bộ nút ghi tài liệu với role `ta` trên 3 bề mặt Web UI:**
   - **Trang `/materials` (`apps/web/src/routes/_auth/materials/index.tsx`):** Khi `!canWriteMaterials(viewerRole)`, ẩn `Thêm liên kết` & `Tải file lên` (trên `PageHead` và trong empty state, đổi câu dẫn empty state sang thông điệp chỉ đọc trung tính), ẩn `Sửa` & `Xóa` trên từng `MaterialItem` (giữ `MaterialOpenActions`), ẩn `Thư mục mới` và cụm `Đổi tên` / `Di chuyển` / `Xóa thư mục` ở `FolderPanel`.
   - **`SessionMaterialsModal` (`apps/web/src/components/class-detail/session-materials-modal.tsx`):** Khi `!canWriteMaterials(viewerRole)`, ẩn `Chọn từ ngân hàng`, `Tải lên mới`, dòng hướng dẫn upload và nút `Gỡ` trên từng tài liệu gắn trực tiếp (giữ nút mở/tải và danh sách `Từ giáo trình`), đồng thời hiển thị câu trạng thái rỗng chỉ đọc (`"Chưa có tài liệu nào cho buổi này."`).
   - **`MaterialPicker` (`apps/web/src/components/materials/material-picker.tsx`):** Khi `!canWriteMaterials(viewerRole)`, ẩn nút `Tải file lên`, thẻ `<input type="file">` và câu hướng dẫn upload vào ngân hàng; giữ nguyên nút `Chọn từ ngân hàng` và thao tác chọn/gỡ chip `materialIds`.

### Mục tiêu (Goals)
- Đảm bảo bất biến cây thư mục tài liệu (không chu trình, tối đa 5 cấp) ngay cả dưới tải đồng thời trên D1/SQLite, đồng thời mọi thư mục trong DB luôn hiển thị được trên UI để người dùng tự xử lý nếu có dữ liệu lệch cũ.
- Tách rời hoàn toàn chính sách quyền của Tài liệu khỏi Chấm bài và loại bỏ trải nghiệm bẫy UI (nút hiện nhưng bấm vào nhận `403`) cho trợ giảng (`ta`).

### Định nghĩa hoàn thành (Done means)
1. `packages/auth/src/role.ts` export `MATERIAL_READ_ROLES`, `MATERIAL_WRITE_ROLES`, `canReadMaterials`, `canWriteMaterials`; `apps/server/src/routes/materials.ts` không còn import `canReviewGrade` hay `canPublishGrade`; `packages/auth/src/role.test.ts` phủ đủ bảng vai trò (`teacher`, `owner`, `admin`, `class_teacher`, `ta`, `student`, lạ/`null`/`undefined`).
2. Test đồng thời (`Promise.all`) trong `apps/server/src/routes/materials.test.ts` chứng minh: hai lệnh `PATCH` chéo `A → B` và `B → A` chỉ cho đúng 1 lệnh `200` và lệnh còn lại trả `400 FOLDER_CYCLE` (cây trong DB không có vòng); đua vượt trần 5 cấp ở `PATCH` và `POST` trả `400 FOLDER_TOO_DEEP`.
3. `apps/web/src/lib/material-folders.test.ts` thay assertion cũ (vốn bỏ rơi `x, y`) bằng test xác nhận mọi thư mục trong chu trình `x ↔ y` (kèm thư mục con của chúng) đều xuất hiện trong kết quả `flattenFolderTree` mà không lặp vô hạn.
4. Unit test giao diện cho `/materials`, `SessionMaterialsModal` và `MaterialPicker` xác nhận: với `viewer.role = "ta"`, toàn bộ nút ghi bị ẩn trong khi nút đọc/mở/duyệt ngân hàng vẫn hiển thị; với `teacher`, mọi nút ghi giữ nguyên.
5. `pnpm exec biome check .`, `pnpm check-types`, và `pnpm test` cho `@teacher-os/auth`, `server`, `web` đều pass; kiểm tra UI 3 viewport (`1440×900`, `768×1024`, `375×812`) ở chế độ `ta`.

### Ngoài phạm vi (Non-goals)
- Không đổi tập role được phép đọc/ghi tài liệu hiện tại.
- Không tách lại `canReviewGrade`/`canPublishGrade` đang dùng ở `study-pack.ts`, `self-study-plan.ts` hay `kernel.ts` (`canManageStudentInvites`).
- Không thay đổi quyền tạo buổi học thủ công hay sửa giáo trình của `ta`.
- Không tạo migration DB mới.

### Ràng buộc (Constraints)
- Tuân thủ `DESIGN.md`, `REVIEW.md` và convention tiếng Việt của repo.
- Cơ chế đọc `viewer.role` trên web phải lấy từ cache `kernelQueryKey` với fallback `"teacher"` (như `apps/web/src/routes/_auth/grading/$attemptId.tsx:92-94`) để không làm vỡ các unit test render component bằng `QueryClientProvider` thuần không bọc `DataProvider`.

---

## Tư vấn chi tiết (Advisory Analysis)

### 1. Nhận định tổng quan (Verdict)
Hai vấn đề nêu trong issue #646 đều xác đáng và nên làm, nhưng **không nên cài đặt phần chặn race server theo gợi ý gốc "ghi trước rồi đọc lại hoàn tác"**, và **không nên chỉ sửa UI ở trang `/materials`**. Trên SQLite/D1, chiến lược ghi-rồi-hoàn-tác vừa tạo cửa sổ dữ liệu bẩn cho các lệnh đọc xen giữa, vừa có nguy cơ cả hai request cùng hoàn tác nhau (livelock) hoặc nổ `material_folder_org_parent_name_uq` khi trả về thư mục cha cũ; trong khi đó, một mệnh đề `WITH RECURSIVE` đặt ngay trong `WHERE` của câu `UPDATE`/`INSERT` giải quyết triệt để cả race chu trình lẫn race độ sâu 5 cấp một cách nguyên tử, đúng theo tiền lệ `holidayBucketDateGuard` đã có trong `materials.ts`. Về phía UI, do #655 mới bổ sung `MaterialPicker` vào modal tạo buổi và sửa giáo trình sau thời điểm mở #646, việc ẩn nút ghi cho `ta` bắt buộc phải phủ đủ cả 3 bề mặt (`/materials`, `SessionMaterialsModal`, và nút upload trong `MaterialPicker`) thì mới xóa sạch lỗi bấm nút nhận `403`.

### 2. Việc nên làm (What you should do)
1. **Tách allowlist quyền Tài liệu độc lập trong `packages/auth/src/role.ts`:** Tạo `MATERIAL_WRITE_ROLES` và `MATERIAL_READ_ROLES` với map tra cứu riêng (`MATERIAL_WRITE_ROLE_MAP`, `MATERIAL_READ_ROLE_MAP`), xuất `canWriteMaterials` và `canReadMaterials`, rồi thay thế trực tiếp trong middleware `gate` tại `apps/server/src/routes/materials.ts:160-164`.
2. **Đặt guard SQL `WITH RECURSIVE` nguyên tử cho `PATCH /materials/folders/:id` và `POST /materials/folders`:**
   - Với `PATCH` khi `nextParent !== null`: giữ kiểm tra sớm trong JS để bắt lỗi nhanh không tốn ghi, nhưng câu `UPDATE material_folder` phải kèm điều kiện `WITH RECURSIVE` duyệt chuỗi tổ tiên từ `nextParent` (tối đa 6 bước) và cây con từ `id` (có `f.id != :id` để không đi vòng qua cạnh cũ của chính `id`), chỉ cho phép cập nhật khi `nextParent` tồn tại trong `orgId`, `id` không thuộc tổ tiên của `nextParent`, và `max(anc.depth) + max(sub.level) <= 5`.
   - Với `POST` khi `parentId !== null`: chuyển câu chèn sang dạng nguyên tử kiểm tra `parentId` tồn tại trong `orgId` và `max(anc.depth) + 1 <= 5`.
   - Khi câu SQL trả về 0 dòng (`!row`), gọi lại `loadFolders(db, ctx.orgId)` để phân loại chính xác nguyên nhân thua race (`!byId.has(id)` hoặc `!byId.has(nextParent)` → `404 FOLDER_NOT_FOUND`; `subtree(folders, id).ids.has(nextParent)` → `400 FOLDER_CYCLE`; vượt trần → `400 FOLDER_TOO_DEEP`).
3. **Bổ sung vòng quét thành phần cô lập trong `flattenFolderTree` (`apps/web/src/lib/material-folders.ts`):** Sau lệnh `walk(null, 0)` hiện tại, duyệt mảng `[...folders].sort(byName)`: hễ gặp thư mục chưa có trong `seen`, thêm nó ở `depth = 0`, đánh dấu `seen`, rồi gọi `walk(folder.id, 1)`. Ở `FolderPanel` (`apps/web/src/routes/_auth/materials/index.tsx:561`), kẹp `Math.min(depth, MATERIAL_FOLDER_MAX_DEPTH - 1)` khi tính `paddingLeft`.
4. **Dùng một helper đọc role an toàn cache cho cả 3 bề mặt UI:** Viết helper nhỏ (ví dụ `useCanWriteMaterials()` trong `apps/web/src/lib/repos/materials.ts` hoặc cạnh component) đọc `queryClient.getQueryData<{ viewer?: { role?: string } }>(kernelQueryKey)?.viewer?.role ?? "teacher"` rồi truyền qua `canWriteMaterials(role)`, áp dụng đồng nhất cho `MaterialsRoute`/`FolderPanel`, `SessionMaterialsModal`, và `MaterialPicker`.

### 3. Việc không nên làm (What you shouldn't do)
- **Không cài cơ chế "ghi xuống DB rồi đọc lại hoàn tác (`UPDATE` ngược về `current.parentId`)" như gợi ý ban đầu của issue:** Nếu hai request `A → B` và `B → A` cùng ghi xong rồi cùng đọc lại, cả hai đều thấy vòng và cùng tự hoàn tác khiến không thao tác nào thành công; tệ hơn, nếu trong lúc đó dưới cha cũ của `A` vừa có thư mục trùng tên `A`, câu lệnh hoàn tác sẽ nổ lỗi unique index `material_folder_org_parent_name_uq` (500) và để lại chu trình kẹt vĩnh viễn trong DB.
- **Không gán `export const canWriteMaterials = canPublishGrade` hoặc tái sử dụng hằng `GRADING_PUBLISH_ROLES`:** Làm vậy vẫn giữ nguyên liên kết ngầm mà issue #646 muốn cắt bỏ — bất kỳ thay đổi nào sau này trên `GRADING_PUBLISH_ROLES` vẫn sẽ làm trôi quyền tài liệu.
- **Không gọi `useData()` trực tiếp trong `MaterialsRoute` hay `MaterialPicker`:** `apps/web/src/routes/_auth/materials/index.test.tsx` và `apps/web/src/components/materials/material-picker.test.tsx` đang mount component dưới `QueryClientProvider` thuần (không bọc `DataProvider`); gọi `useData()` sẽ làm gãy toàn bộ suite test hiện có với lỗi thiếu context.
- **Không thêm cột quyền mới lên `KernelSnapshot.viewer` hoặc dựng hệ thống RBAC registry/policy tổng quát:** Chỉ có một nhu cầu thực tế là kiểm tra role cho module Tài liệu; `viewer.role` đã luôn có sẵn trong snapshot của `_auth`, và các hàm allowlist tường minh trong `packages/auth/src/role.ts` rẻ hơn, dễ đọc hơn, và an toàn kiểu hơn bất kỳ bảng cấu hình phân quyền trừu tượng nào.
- **Không ẩn nút `Chọn từ ngân hàng` trong `MaterialPicker` của `ta`:** `GET /api/materials` cho phép `ta` đọc (`canReadMaterials`), và endpoint tạo buổi / sửa giáo trình không chặn `ta`; chỉ nút `Tải file lên` (`PUT /api/materials/files`) mới thuộc quyền ghi ngân hàng cần ẩn.

### 4. Cách làm gọn và hiệu quả hơn (What could be better / more efficient)
1. **Giữ đường nhanh cho thư mục gốc (`parentId === null`):** Khi tạo thư mục gốc hoặc di chuyển thư mục về gốc (`nextParent === null`), không thể xảy ra chu trình hay vượt độ sâu 5 cấp — bỏ qua hoàn toàn CTE đệ quy trên nhánh này để câu SQL chỉ chạm đúng index khóa chính / unique index như cũ.
2. **Viết một helper `useCanWriteMaterials()` duy nhất (~8 dòng) dùng `useQueryClient()`:** Thay vì truyền prop `canWrite` qua nhiều tầng trung gian từ route lớp học xuống `ClassSessionsSection` → `SessionMaterialsModal` hoặc từ các modal giáo trình xuống `MaterialPicker`, đọc trực tiếp `kernelQueryKey` từ `QueryClient` ngay trong 3 component tài liệu giúp giữ nguyên chữ ký props của toàn bộ component cha.
3. **Tái sử dụng chính `folderSubtreeIds` hiện có để người dùng tự gỡ vòng từ UI:** Nhờ `folderSubtreeIds` (`apps/web/src/lib/material-folders.ts:48-68`) đã gom toàn bộ chu trình `X ↔ Y` vào tập `exclude` của `FolderSelect`, ngay khi `flattenFolderTree` hiển thị lại `X` và `Y` ở cấp gốc, giáo viên có thể bấm `Di chuyển` trên `X` và chọn `"Chưa xếp thư mục"` để phá vòng mà không cần viết thêm công cụ sửa dữ liệu riêng.

### 5. Lộ trình khuyến nghị (My take and how to get there)
1. **Bước 1 — Tầng Auth (`packages/auth`):** Thêm `MATERIAL_WRITE_ROLES`, `MATERIAL_READ_ROLES`, `canWriteMaterials`, `canReadMaterials` vào `packages/auth/src/role.ts` và viết bảng test đầy đủ trong `packages/auth/src/role.test.ts`.
   - *Kiểm tra khả năng mở rộng (Extensibility check):* Mở rộng khả dĩ nhất tiếp theo trong codebase là tách nốt quyền cho `study-pack` / `self-study-plan` hoặc thêm một role biên tập học liệu riêng (ví dụ được sửa tài liệu nhưng không được chốt điểm). Với thiết kế hàm allowlist độc lập theo miền trong `packages/auth/src/role.ts`, khi thêm role mới chỉ cần sửa duy nhất mảng `MATERIAL_WRITE_ROLES` và test của nó — không phải sửa `materials.ts`, `grading.ts`, DB hay bất kỳ component UI nào. Chi phí giữ các hàm cụ thể thấp hơn hẳn việc dựng RBAC matrix chung ngay lúc này.
2. **Bước 2 — Tầng Server (`apps/server`):**
   - Đổi import & middleware `gate` trong `apps/server/src/routes/materials.ts` sang `canReadMaterials` / `canWriteMaterials`.
   - Cài đặt câu `UPDATE` có guard `WITH RECURSIVE` cho `PATCH /materials/folders/:id` (nhánh `nextParent !== null && nextParent !== current.parentId`) và câu `INSERT ... SELECT ... WHERE` có guard `WITH RECURSIVE` cho `POST /materials/folders` (nhánh `parentId !== null`), kèm nhánh đọc lại phân loại lỗi khi 0 dòng được ghi.
   - Bổ sung test `Promise.all` đua chéo `A → B` / `B → A` và đua vượt trần 5 cấp trong `apps/server/src/routes/materials.test.ts`.
3. **Bước 3 — Tầng Client Tree & Web UI (`apps/web`):**
   - Cập nhật `flattenFolderTree` trong `apps/web/src/lib/material-folders.ts` và sửa test chu trình trong `apps/web/src/lib/material-folders.test.ts`.
   - Thêm `useCanWriteMaterials()` (đọc `kernelQueryKey` từ `QueryClient`, fallback `"teacher"`) và ẩn các phần tử ghi khi `false` trên: `apps/web/src/routes/_auth/materials/index.tsx` (kèm kẹp `depth` ở `FolderPanel`), `apps/web/src/components/class-detail/session-materials-modal.tsx`, và `apps/web/src/components/materials/material-picker.tsx`.
   - Thêm unit test cho `viewer.role = "ta"` trên cả 3 bề mặt UI và chạy đủ bộ cổng kiểm tra local.

### 6. Lợi ích (Benefits)
- **Không bao giờ ghi trạng thái chu trình hay quá 5 cấp xuống DB:** Mọi vi phạm do race bị chặn trước khi commit câu lệnh SQL, loại bỏ hoàn toàn cửa sổ đọc bẩn và rủi ro lỗi hoàn tác.
- **Khả năng tự phục hồi trên giao diện:** Dù DB có dữ liệu lệch từ trước, không thư mục hay tài liệu nào bị "tàng hình"; giáo viên vẫn thấy và di chuyển về gốc được ngay trên UI sẵn có.
- **Biên phân quyền rõ ràng, trải nghiệm TA nhất quán:** Thay đổi quy tắc chấm bài sau này không thể vô tình mở hoặc khóa kho tài liệu, và trợ giảng có giao diện tra cứu/sử dụng học liệu sạch sẽ, không còn nút bấm gây lỗi `403`.

### 7. Đánh đổi & điều kiện đổi hướng (Trade-offs)
- **Câu SQL `WITH RECURSIVE` dài và khó đọc bằng mắt hơn vòng lặp JS (~25 dòng SQL thô trong Drizzle `sql`):** Đổi lại ta xóa bỏ hoàn toàn trạng thái bất nhất dữ liệu mà JS không thể tự khóa trên D1 HTTP/serverless.
- **Giữ `study-pack.ts`, `self-study-plan.ts` và `canManageStudentInvites` ngoài phạm vi:** Ba chỗ này vẫn tiếp tục dùng ké `canReviewGrade`/`canPublishGrade` cho tới khi có issue dọn riêng; đây là đánh đổi chủ động để giữ PR của #646 gọn và đúng mục tiêu.
- **Khi nào khuyến nghị này không còn phù hợp:**
  1. Nếu trung tâm đổi chính sách không cho `ta` sửa giáo trình hoặc tạo buổi học thủ công: lúc đó cần đặt thêm role gate trên các route `syllabus-content-routes.ts` / `kernel.ts` và ẩn cả `MaterialPicker` ở các modal đó (chi phí chuyển đổi thấp: chỉ thêm gate ở route đích, không phải sửa lại `canWriteMaterials`).
  2. Nếu sau này ngân hàng tài liệu cần truy vấn cây thư mục hàng chục nghìn nút mỗi org với độ sâu tùy ý: khi đó mô hình adjacency list + `WITH RECURSIVE` giới hạn 5 cấp sẽ cần chuyển sang closure table hoặc materialized path (tốn 1 migration backfill bảng `material_folder`).

### 8. Chưa kiểm chứng trực tiếp (Unverified)
- **Thực thi câu `INSERT ... SELECT ... WHERE (WITH RECURSIVE ...)` và `UPDATE ... WHERE (WITH RECURSIVE ...) RETURNING *` qua tầng Drizzle ORM + Cloudflare D1 binding thật:** Đã kiểm chứng trực tiếp cú pháp và hành vi trên engine SQLite 3.45.1 local (trả đúng dòng khi hợp lệ và `[]` khi tạo vòng hoặc vượt cấp 5), đồng thời đối chiếu với `materials.ts` hiện có; khi triển khai cần xác nhận trực tiếp qua Drizzle `db.run` / `db.all` trong `apps/server/src/routes/materials.test.ts` (chạy trên `@libsql/client`).

### 9. Checklist công việc, Thước đo thành công & Handoff Brief

#### Work checklist
- [ ] Thêm `MATERIAL_WRITE_ROLES`, `MATERIAL_READ_ROLES`, `canWriteMaterials`, `canReadMaterials` vào `packages/auth/src/role.ts` và test đủ ma trận role trong `packages/auth/src/role.test.ts`.
- [ ] Thay `canReviewGrade` / `canPublishGrade` bằng `canReadMaterials` / `canWriteMaterials` trong `apps/server/src/routes/materials.ts`.
- [ ] Cài guard SQL `WITH RECURSIVE` nguyên tử cho `PATCH /materials/folders/:id` (chặn vòng + trần 5 cấp, có `f.id != :id` ở CTE cây con) và `POST /materials/folders` (chặn trần 5 cấp) trong `apps/server/src/routes/materials.ts`, kèm phân loại lỗi chính xác khi 0 dòng được ghi.
- [ ] Thêm unit test đua đồng thời (`Promise.all`) cho cả chu trình chéo `A ↔ B` và vượt trần độ sâu 5 cấp trong `apps/server/src/routes/materials.test.ts`.
- [ ] Sửa `flattenFolderTree` trong `apps/web/src/lib/material-folders.ts` để hiển thị các thành phần không tới được từ gốc theo thứ tự `byName` (cắt vòng bằng `seen`), kẹp `depth` hiển thị ở `FolderPanel`, và cập nhật `apps/web/src/lib/material-folders.test.ts`.
- [ ] Thêm helper đọc `canWriteMaterials` từ cache `kernelQueryKey` (fallback `"teacher"`) và ẩn toàn bộ nút ghi cho `ta` trên `/materials` (`apps/web/src/routes/_auth/materials/index.tsx`), `SessionMaterialsModal` (`apps/web/src/components/class-detail/session-materials-modal.tsx`), và nút upload trong `MaterialPicker` (`apps/web/src/components/materials/material-picker.tsx`).
- [ ] Bổ sung unit test cho `viewer.role = "ta"` trên 3 bề mặt UI; chạy `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` và kiểm tra UI trên 3 viewport (`1440×900`, `768×1024`, `375×812`).

#### Success metrics
- `rg "canReviewGrade|canPublishGrade" apps/server/src/routes/materials.ts` trả về **0 kết quả**.
- Test đua đồng thời `Promise.all([move(A, B), move(B, A)])` trong `apps/server/src/routes/materials.test.ts` trả về đúng **1 kết quả `200`** và **1 kết quả `400`** (`code: "FOLDER_CYCLE"`), đồng thời `flattenFolderTree` trên dữ liệu trả về từ `GET /api/materials/folders` chứa đủ cả 2 thư mục.
- Với dữ liệu đầu vào gồm chu trình `[X -> Y, Y -> X, Z -> X]`, `flattenFolderTree` trả về đủ **3 phần tử** (`X` ở `depth: 0`, `Y` và `Z` ở `depth: 1`).
- Khi render `/materials`, `SessionMaterialsModal` và `MaterialPicker` với `viewer.role = "ta"` trong unit test và trên trình duyệt (3 viewport), **0 nút ghi/upload/xóa/sửa** xuất hiện trong DOM, trong khi nút mở/tải tài liệu và `Chọn từ ngân hàng` (ở `MaterialPicker`) vẫn hoạt động bình thường.
- `pnpm exec biome check .`, `pnpm check-types`, và `pnpm test` đều kết thúc với **exit code 0**.

#### Handoff brief
```text
Objective: Chặn nguyên tử race tạo chu trình/vượt độ sâu thư mục tài liệu bằng SQL WITH RECURSIVE, phục hồi hiển thị thư mục bị cô lập ở client, tách riêng canReadMaterials/canWriteMaterials và ẩn nút ghi tài liệu cho role ta trên cả 3 bề mặt web UI (#646).
Done means: (1) packages/auth/src/role.ts export MATERIAL_READ_ROLES, MATERIAL_WRITE_ROLES, canReadMaterials, canWriteMaterials (map riêng không alias GRADING_*) kèm role.test.ts phủ đủ các role, và apps/server/src/routes/materials.ts không còn import canReviewGrade/canPublishGrade; (2) PATCH /materials/folders/:id và POST /materials/folders chặn nguyên tử chu trình và trần MATERIAL_FOLDER_MAX_DEPTH=5 ngay trong câu SQL bằng WITH RECURSIVE (không ghi bẩn rồi hoàn tác), trả đúng 404 FOLDER_NOT_FOUND / 400 FOLDER_CYCLE / 400 FOLDER_TOO_DEEP khi thua race, có test Promise.all chứng minh trong materials.test.ts; (3) flattenFolderTree trong apps/web/src/lib/material-folders.ts render các thư mục không tới được từ gốc theo thứ tự byName từ depth 0 (cắt cạnh chu trình bằng seen), kẹp thụt lề FolderPanel tối đa depth 4, cập nhật material-folders.test.ts; (4) đọc viewer.role từ cache kernelQueryKey (fallback "teacher") để ẩn toàn bộ nút ghi/upload/xóa/sửa khi !canWriteMaterials(role) trên /materials, SessionMaterialsModal và nút "Tải file lên" trong MaterialPicker (giữ "Chọn từ ngân hàng"), kèm unit test cho role ta và kiểm tra 3 viewport (1440x900, 768x1024, 375x812); (5) pnpm exec biome check ., pnpm check-types và pnpm test đều xanh.
Out of scope: Đổi tập role được đọc/ghi tài liệu; sửa các chỗ dùng canReviewGrade/canPublishGrade ở study-pack.ts, self-study-plan.ts, kernel.ts; đổi quyền tạo buổi học hoặc sửa giáo trình của ta; tạo migration DB mới.
Constraints: Giao tiếp/UI tiếng Việt theo DESIGN.md và REVIEW.md; không thêm field mới lên KernelSnapshot.viewer; helper đọc role phía web phải tương thích với các test mount QueryClientProvider thuần không có DataProvider.
Stop and ask only if: Gặp lỗi bất tương thích không giải thích được của SQLite/libsql với câu lệnh WITH RECURSIVE, cần hành động phá hủy dữ liệu hoặc tạo migration schema, hoặc phát hiện thay đổi bắt buộc nằm ngoài phạm vi đã chốt.
```
