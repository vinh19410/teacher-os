# Verdict đối chiếu design v2 ↔ app

Mỗi dòng: PASS khi ảnh ghép thỏa checklist cấu trúc (phase 1) ở tổ hợp đó (shell, bố cục vùng, component, token, typography, responsive 375px không tràn ngang).

| Màn | viewport×theme | Trạng thái | Ghi chú |
|---|---|---|---|
| login-teacher | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| login-teacher | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| login-teacher | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| login-teacher | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| login-teacher | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| login-teacher | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| login-reset | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| login-reset | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| login-reset | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| login-reset | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| login-reset | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| login-reset | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| pay | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| pay | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| pay | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| pay | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| pay | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| pay | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-dashboard | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-dashboard | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-dashboard | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-dashboard | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-dashboard | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-dashboard | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-classes | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-classes | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-classes | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-classes | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-classes | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-classes | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-class-detail | desktop×light | PASS | #391: khớp cấu trúc khối-theo-khối (xem section "verdict #391" dưới) |
| t-class-detail | desktop×dark | PASS | #391: khớp cấu trúc khối-theo-khối (xem section "verdict #391" dưới) |
| t-class-detail | tablet×light | PASS | #391: cùng cây component với desktop; composite regenerate kèm run #391 |
| t-class-detail | tablet×dark | PASS | #391: cùng cây component với desktop; composite regenerate kèm run #391 |
| t-class-detail | phone×light | PASS | #391: 375 không tràn ngang, stat 2 cột, card xếp dọc (xem section "verdict #391") |
| t-class-detail | phone×dark | PASS | #391: cùng cây component với phone-light; composite regenerate kèm run #391 |
| t-attendance | desktop×light | PASS | #403: app mở modal điểm danh qua data-testid (non-mutating, guard zero-POST); seed roster nhóm 2 HV|
| t-attendance | desktop×dark | PASS | #403: app mở modal điểm danh qua data-testid (non-mutating, guard zero-POST); seed roster nhóm 2 HV|
| t-attendance | tablet×light | PASS | #403: app mở modal điểm danh qua data-testid (non-mutating, guard zero-POST); seed roster nhóm 2 HV|
| t-attendance | tablet×dark | PASS | #403: app mở modal điểm danh qua data-testid (non-mutating, guard zero-POST); seed roster nhóm 2 HV|
| t-attendance | phone×light | PASS | #403: app mở modal điểm danh qua data-testid (non-mutating, guard zero-POST); seed roster nhóm 2 HV|
| t-attendance | phone×dark | PASS | #403: app mở modal điểm danh qua data-testid (non-mutating, guard zero-POST); seed roster nhóm 2 HV|
| t-students | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-students | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-students | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-students | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-students | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-students | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-student-detail | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-student-detail | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-student-detail | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-student-detail | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-student-detail | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-student-detail | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-schedule | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-schedule | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-schedule | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-schedule | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-schedule | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-schedule | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-syllabus | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-syllabus | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-syllabus | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-syllabus | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-syllabus | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-syllabus | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-syllabus-detail | desktop×light | PASS | Khung PageHead + module card v2 + modal |
| t-syllabus-detail | desktop×dark | PASS | Khung PageHead + module card v2 + modal |
| t-syllabus-detail | tablet×light | PASS | Khung PageHead + module card v2 + modal |
| t-syllabus-detail | tablet×dark | PASS | Khung PageHead + module card v2 + modal |
| t-syllabus-detail | phone×light | PASS | Khung PageHead + module card v2 + modal |
| t-syllabus-detail | phone×dark | PASS | Khung PageHead + module card v2 + modal |
| t-profile | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-profile | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-profile | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-profile | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-profile | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-profile | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-reports | desktop×light | PASS | Design không có màn riêng — áp khung Dashboard (PageHead + Stat + Card + Table) |
| t-reports | desktop×dark | PASS | Design không có màn riêng — áp khung Dashboard (PageHead + Stat + Card + Table) |
| t-reports | tablet×light | PASS | Design không có màn riêng — áp khung Dashboard (PageHead + Stat + Card + Table) |
| t-reports | tablet×dark | PASS | Design không có màn riêng — áp khung Dashboard (PageHead + Stat + Card + Table) |
| t-reports | phone×light | PASS | Design không có màn riêng — áp khung Dashboard (PageHead + Stat + Card + Table) |
| t-reports | phone×dark | PASS | Design không có màn riêng — áp khung Dashboard (PageHead + Stat + Card + Table) |
| t-assignments | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-assignments | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-assignments | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-assignments | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-assignments | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-assignments | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-test-builder | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-test-builder | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-test-builder | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-test-builder | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-test-builder | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-test-builder | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-grading | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-grading | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-grading | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-grading | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-grading | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-grading | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-tuition | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-tuition | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-tuition | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-tuition | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-tuition | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-tuition | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-invoice | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-invoice | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-invoice | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-invoice | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-invoice | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-invoice | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| t-search | desktop×light | PASS | Command palette ⌘K; phone design skipViewports (nút Search design ẩn <md), app có nút icon <md |
| t-search | desktop×dark | PASS | Command palette ⌘K; phone design skipViewports (nút Search design ẩn <md), app có nút icon <md |
| t-search | tablet×light | PASS | Command palette ⌘K; phone design skipViewports (nút Search design ẩn <md), app có nút icon <md |
| t-search | tablet×dark | PASS | Command palette ⌘K; phone design skipViewports (nút Search design ẩn <md), app có nút icon <md |
| t-search | phone×light | PASS | Command palette ⌘K; phone design skipViewports (nút Search design ẩn <md), app có nút icon <md |
| t-search | phone×dark | PASS | Command palette ⌘K; phone design skipViewports (nút Search design ẩn <md), app có nút icon <md |
| s-dashboard | desktop×light | PASS | Ẩn stat Band hiện tại & Chuyên cần (không có nguồn trong /overview — không bịa số) |
| s-dashboard | desktop×dark | PASS | Ẩn stat Band hiện tại & Chuyên cần (không có nguồn trong /overview — không bịa số) |
| s-dashboard | tablet×light | PASS | Ẩn stat Band hiện tại & Chuyên cần (không có nguồn trong /overview — không bịa số) |
| s-dashboard | tablet×dark | PASS | Ẩn stat Band hiện tại & Chuyên cần (không có nguồn trong /overview — không bịa số) |
| s-dashboard | phone×light | PASS | Ẩn stat Band hiện tại & Chuyên cần (không có nguồn trong /overview — không bịa số) |
| s-dashboard | phone×dark | PASS | Ẩn stat Band hiện tại & Chuyên cần (không có nguồn trong /overview — không bịa số) |
| s-classes | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-classes | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-classes | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-classes | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-classes | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-classes | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-class-detail | desktop×light | PASS | Khớp StudentClass v2 (#389: banner việc cần làm, header + badge + nhắn giáo viên, thẻ thông tin dl, 4 ring stroke-primary, Tabs, timeline 32px, bảng bài tập, giáo trình, bạn cùng lớp); ẩn khối server chưa trả (bài về nhà, phòng, học phí lớp, tham gia từ buổi, cột Skill, module giáo trình, target band bạn cùng lớp #378, link lớp online) |
| s-class-detail | desktop×dark | PASS | Khớp StudentClass v2 (#389: banner việc cần làm, header + badge + nhắn giáo viên, thẻ thông tin dl, 4 ring stroke-primary, Tabs, timeline 32px, bảng bài tập, giáo trình, bạn cùng lớp); ẩn khối server chưa trả (bài về nhà, phòng, học phí lớp, tham gia từ buổi, cột Skill, module giáo trình, target band bạn cùng lớp #378, link lớp online) |
| s-class-detail | tablet×light | PASS | Khớp StudentClass v2 (#389: banner việc cần làm, header + badge + nhắn giáo viên, thẻ thông tin dl, 4 ring stroke-primary, Tabs, timeline 32px, bảng bài tập, giáo trình, bạn cùng lớp); ẩn khối server chưa trả (bài về nhà, phòng, học phí lớp, tham gia từ buổi, cột Skill, module giáo trình, target band bạn cùng lớp #378, link lớp online) |
| s-class-detail | tablet×dark | PASS | Khớp StudentClass v2 (#389: banner việc cần làm, header + badge + nhắn giáo viên, thẻ thông tin dl, 4 ring stroke-primary, Tabs, timeline 32px, bảng bài tập, giáo trình, bạn cùng lớp); ẩn khối server chưa trả (bài về nhà, phòng, học phí lớp, tham gia từ buổi, cột Skill, module giáo trình, target band bạn cùng lớp #378, link lớp online) |
| s-class-detail | phone×light | PASS | Khớp StudentClass v2 (#389: banner việc cần làm, header + badge + nhắn giáo viên, thẻ thông tin dl, 4 ring stroke-primary, Tabs, timeline 32px, bảng bài tập, giáo trình, bạn cùng lớp); ẩn khối server chưa trả (bài về nhà, phòng, học phí lớp, tham gia từ buổi, cột Skill, module giáo trình, target band bạn cùng lớp #378, link lớp online) |
| s-class-detail | phone×dark | PASS | Khớp StudentClass v2 (#389: banner việc cần làm, header + badge + nhắn giáo viên, thẻ thông tin dl, 4 ring stroke-primary, Tabs, timeline 32px, bảng bài tập, giáo trình, bạn cùng lớp); ẩn khối server chưa trả (bài về nhà, phòng, học phí lớp, tham gia từ buổi, cột Skill, module giáo trình, target band bạn cùng lớp #378, link lớp online) |
| s-quiz-reading | desktop×light | PASS | Khung ExamFrame v2 (không bịa đồng hồ đếm ngược khi wire/DB không có duration) |
| s-quiz-reading | desktop×dark | PASS | Khung ExamFrame v2 (không bịa đồng hồ đếm ngược khi wire/DB không có duration) |
| s-quiz-reading | tablet×light | PASS | Khung ExamFrame v2 (không bịa đồng hồ đếm ngược khi wire/DB không có duration) |
| s-quiz-reading | tablet×dark | PASS | Khung ExamFrame v2 (không bịa đồng hồ đếm ngược khi wire/DB không có duration) |
| s-quiz-reading | phone×light | PASS | Khung ExamFrame v2 (không bịa đồng hồ đếm ngược khi wire/DB không có duration) |
| s-quiz-reading | phone×dark | PASS | Khung ExamFrame v2 (không bịa đồng hồ đếm ngược khi wire/DB không có duration) |
| s-quiz-listening | desktop×light | PASS | Khung ExamFrame v2 + AudioBar |
| s-quiz-listening | desktop×dark | PASS | Khung ExamFrame v2 + AudioBar |
| s-quiz-listening | tablet×light | PASS | Khung ExamFrame v2 + AudioBar |
| s-quiz-listening | tablet×dark | PASS | Khung ExamFrame v2 + AudioBar |
| s-quiz-listening | phone×light | PASS | Khung ExamFrame v2 + AudioBar |
| s-quiz-listening | phone×dark | PASS | Khung ExamFrame v2 + AudioBar |
| s-quiz-writing | desktop×light | PASS | Khung ExamFrame v2 + trình soạn thảo |
| s-quiz-writing | desktop×dark | PASS | Khung ExamFrame v2 + trình soạn thảo |
| s-quiz-writing | tablet×light | PASS | Khung ExamFrame v2 + trình soạn thảo |
| s-quiz-writing | tablet×dark | PASS | Khung ExamFrame v2 + trình soạn thảo |
| s-quiz-writing | phone×light | PASS | Khung ExamFrame v2 + trình soạn thảo |
| s-quiz-writing | phone×dark | PASS | Khung ExamFrame v2 + trình soạn thảo |
| s-quiz-speaking | desktop×light | PASS | Khung ExamFrame v2 + dropzone tải file |
| s-quiz-speaking | desktop×dark | PASS | Khung ExamFrame v2 + dropzone tải file |
| s-quiz-speaking | tablet×light | PASS | Khung ExamFrame v2 + dropzone tải file |
| s-quiz-speaking | tablet×dark | PASS | Khung ExamFrame v2 + dropzone tải file |
| s-quiz-speaking | phone×light | PASS | Khung ExamFrame v2 + dropzone tải file |
| s-quiz-speaking | phone×dark | PASS | Khung ExamFrame v2 + dropzone tải file |
| s-vocab | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-vocab | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-vocab | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-vocab | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-vocab | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-vocab | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-vocab-catalog | desktop×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-vocab-catalog | desktop×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-vocab-catalog | tablet×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-vocab-catalog | tablet×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-vocab-catalog | phone×light | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-vocab-catalog | phone×dark | PASS | Khớp khung shell sidebar-07, bố cục vùng, primitive, token oklch & Geist v2 |
| s-practice-reading | desktop×light | PASS | Catalog đề ready của org + filter URL + HistoryButton đếm thật |
| s-practice-reading | desktop×dark | PASS | Catalog đề ready của org + filter URL + HistoryButton đếm thật |
| s-practice-reading | tablet×light | PASS | Catalog đề ready của org + filter URL + HistoryButton đếm thật |
| s-practice-reading | tablet×dark | PASS | Catalog đề ready của org + filter URL + HistoryButton đếm thật |
| s-practice-reading | phone×light | PASS | Catalog đề ready của org + filter URL + HistoryButton đếm thật |
| s-practice-reading | phone×dark | PASS | Catalog đề ready của org + filter URL + HistoryButton đếm thật |
| s-practice-listening | desktop×light | PASS | Catalog đề ready của org + filter URL |
| s-practice-listening | desktop×dark | PASS | Catalog đề ready của org + filter URL |
| s-practice-listening | tablet×light | PASS | Catalog đề ready của org + filter URL |
| s-practice-listening | tablet×dark | PASS | Catalog đề ready của org + filter URL |
| s-practice-listening | phone×light | PASS | Catalog đề ready của org + filter URL |
| s-practice-listening | phone×dark | PASS | Catalog đề ready của org + filter URL |
| s-practice-writing | desktop×light | PASS | Catalog đề ready của org (nộp mang nhãn trung thực Đã nộp — tự luyện, queue chấm #383) |
| s-practice-writing | desktop×dark | PASS | Catalog đề ready của org (nộp mang nhãn trung thực Đã nộp — tự luyện, queue chấm #383) |
| s-practice-writing | tablet×light | PASS | Catalog đề ready của org (nộp mang nhãn trung thực Đã nộp — tự luyện, queue chấm #383) |
| s-practice-writing | tablet×dark | PASS | Catalog đề ready của org (nộp mang nhãn trung thực Đã nộp — tự luyện, queue chấm #383) |
| s-practice-writing | phone×light | PASS | Catalog đề ready của org (nộp mang nhãn trung thực Đã nộp — tự luyện, queue chấm #383) |
| s-practice-writing | phone×dark | PASS | Catalog đề ready của org (nộp mang nhãn trung thực Đã nộp — tự luyện, queue chấm #383) |
| s-practice-speaking | desktop×light | PASS | SpeakingCatalog gộp card Mic + đề ready của org |
| s-practice-speaking | desktop×dark | PASS | SpeakingCatalog gộp card Mic + đề ready của org |
| s-practice-speaking | tablet×light | PASS | SpeakingCatalog gộp card Mic + đề ready của org |
| s-practice-speaking | tablet×dark | PASS | SpeakingCatalog gộp card Mic + đề ready của org |
| s-practice-speaking | phone×light | PASS | SpeakingCatalog gộp card Mic + đề ready của org |
| s-practice-speaking | phone×dark | PASS | SpeakingCatalog gộp card Mic + đề ready của org |
| s-practice-vocabulary | desktop×light | PASS | VocabCatalog đọc deck/course thật hiện có |
| s-practice-vocabulary | desktop×dark | PASS | VocabCatalog đọc deck/course thật hiện có |
| s-practice-vocabulary | tablet×light | PASS | VocabCatalog đọc deck/course thật hiện có |
| s-practice-vocabulary | tablet×dark | PASS | VocabCatalog đọc deck/course thật hiện có |
| s-practice-vocabulary | phone×light | PASS | VocabCatalog đọc deck/course thật hiện có |
| s-practice-vocabulary | phone×dark | PASS | VocabCatalog đọc deck/course thật hiện có |
| s-history | desktop×light | PASS | 2 MonthHeatmap + WeekTable 7×5 + DetailHistory + WritingReview, min-w-0 chống tràn 375px |
| s-history | desktop×dark | PASS | 2 MonthHeatmap + WeekTable 7×5 + DetailHistory + WritingReview, min-w-0 chống tràn 375px |
| s-history | tablet×light | PASS | 2 MonthHeatmap + WeekTable 7×5 + DetailHistory + WritingReview, min-w-0 chống tràn 375px |
| s-history | tablet×dark | PASS | 2 MonthHeatmap + WeekTable 7×5 + DetailHistory + WritingReview, min-w-0 chống tràn 375px |
| s-history | phone×light | PASS | 2 MonthHeatmap + WeekTable 7×5 + DetailHistory + WritingReview, min-w-0 chống tràn 375px |
| s-history | phone×dark | PASS | 2 MonthHeatmap + WeekTable 7×5 + DetailHistory + WritingReview, min-w-0 chống tràn 375px |

## Verdict #391 — t-class-detail fidelity (run 2026-10-21, label `fidelity`)

Chụp `--side both --label fidelity`, 3 viewport × 2 theme, seed `design-seed.ts`.
Nguồn design: `teacheros-design-v2@7a53fc0` `TeacherClass.tsx`. Raw app:
`scripts/design-compare/.state/raw/fidelity/t-class-detail/`. Composite:
`plans/261020-1446-378-redesign-design-v2/screenshots/t-class-detail/`.

| Khối | Design v2 | App sau #391 | Verdict |
|---|---|---|---|
| Back link | Ghost `← Classes` | Ghost `← Lớp học` (buttonVariants ghost sm + ArrowLeft) | PASS |
| Header | kicker `type · lịch · phòng`, 2 action | kicker `IELTS · T3 & T5 & T7 · 18:00–19:30 · Online`; "Giao bài tập" outline + "Sắp xếp buổi" primary | PASS (nhãn tiếng Việt, "Add session" = "Sắp xếp buổi" — lệch có chủ đích) |
| Hàng stat | 4 thẻ | 4 thẻ: học viên (sub từ ngày) / buổi đã học x/y (sub % giáo trình) / bài trong syllabus / bài chờ nộp (sub "Trên N bài đã giao") | PASS (thẻ 3 = "Bài trong syllabus" thay Attendance rate — không có data tổng tin được) |
| Tabs | 3 tab, "Sessions & practice" mặc định | 5 tab: Sessions & practice (mặc định) · Học viên · Giáo trình · Từ vựng · Ghi chú | PASS (giữ thêm Từ vựng/Ghi chú — tính năng thật ngoài phạm vi design) |
| Sessions | `Section` card, `li` per buổi, số ô, thanh điểm danh, "Take/Edit attendance →", Edit | `Section` "Sessions (5)": card `li[data-testid=session-row]`, ô số `bg-primary` khi đã học, link "Điểm danh →"/"Sửa điểm danh →", thanh "n/N đã điểm danh", "Điều chỉnh" | PASS (thanh 3 phân đoạn đã/vắng/chưa — bỏ late, không có data; buổi quá khứ chưa có data amber) |
| Assigned practice | `Section` accordion, n/N done màu, progress | `Section` "Bài đã giao lớp này (5)": accordion icon kỹ năng, "n/N đã nộp" xanh/amber, progress, mở ra học viên + "Chấm bài" outline | PASS (không có thanh Flashcard/Quiz — server chưa trả) |
| Students | Table 5 cột | Tab Học viên: Học viên / Đăng ký / Band mục tiêu / Học phí / Thao tác; fee + `Sửa` + `+ Thêm học viên vào lớp` ở header tab | PASS (Attendance bỏ — red-team; "Current band" → "Band mục tiêu" — `Student` chỉ có targetBand) |
| Syllabus | `SyllabusTree` | Tab Giáo trình: card gán/gỡ template trong `Section` | LỆCH CÓ CHỦ ĐÍCH (#221: cây nằm trong modal Quản lý buổi; descope tách tree) |

Lệch có chủ đích đầy đủ: `DESIGN.md` mục "Lệch có chủ đích so với design v2 — trang chi tiết lớp
teacher (#391)". Badge emoji tròn góc phải dưới trong raw là artifact của vite dev overlay, không
thuộc UI production.
