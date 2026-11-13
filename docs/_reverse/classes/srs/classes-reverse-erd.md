# classes — ERD tái lập (reverse)

```mermaid
erDiagram
    ORGANIZATION ||--o{ CLASS : "sở hữu"
    ORGANIZATION ||--o{ MEMBERSHIP : "có thành viên"
    CLASS ||--o{ CLASS_SESSION : "có buổi vật lý"
    CLASS ||--o{ LESSON : "có buổi dạy theo học viên"
    CLASS ||--o{ ENROLLMENT : "có đăng ký"
    STUDENT ||--o{ ENROLLMENT : "đăng ký"
    ENROLLMENT ||--o| SESSION_PACKAGE : "được gắn gói"
    STUDENT ||--o{ SESSION_PACKAGE : "sở hữu gói"
    LESSON }o--|| ENROLLMENT : "thuộc đăng ký"
    CLASS_SESSION ||--o{ LESSON_MATERIAL : "gắn tài liệu"
    SYLLABUS |o--o| CLASS : "bản copy gắn lớp"

    CLASS {
        string ten_lop "tên hiển thị"
        string loai "ielts hoặc giao tiep"
        string ky_nang "1-4 kỹ năng cho IELTS"
        string lich_tuan "thứ 0-6 + giờ bắt đầu kết thúc"
        int tong_buoi "1-52, manual do server đếm"
        string trang_thai "chỉ có giá trị đang hoạt động"
        date ngay_bat_dau "ISO, client yêu cầu sau hôm nay"
        string che_do_lich "tu dong hoặc thu cong"
        int hoc_phi_moi_hoc_vien "VND, null là chưa thiết lập"
        text ghi_chu "text tự do"
    }
    CLASS_SESSION {
        date ngay "duy nhất theo cặp lop+ngay"
        string gio "HH:mm"
        int thoi_luong "phút 15-360"
        string chu_de "bat buoc, <= 500 ky tu"
        string zoom "rong hoặc https"
    }
    LESSON {
        date ngay "dinh danh buoi vat ly"
        string trang_thai "sap toi, hoan thanh, vang, da huy, nghi le"
        string diem_danh "co mat, di muon, vang co phep, vang khong phep"
        string ghi_chu_diem_danh "<= 255, chỉ giáo viên"
    }
    ENROLLMENT {
        string trang_thai "duoc moi hoặc dang hoc"
    }
    SESSION_PACKAGE {
        int tong_buoi "server dong bo theo so buoi vat ly"
    }
    ORGANIZATION {
        string id "PK"
    }
    MEMBERSHIP {
        string role "teacher hoac student"
    }
    STUDENT {
        string id "PK"
    }
    LESSON_MATERIAL {
        int vi_tri "vi tri trong buoi"
    }
    SYLLABUS {
        string id "ban copy gan lop"
    }
```

## Entity Reference

| Entity | Mô tả nghiệp vụ | Thuộc tính chính | Nguồn | Nhãn |
|--------|-----------------|------------------|-------|------|
| Lớp học (`class`) | Khóa học của giáo viên trong org — trung tâm dữ liệu bền (class-centric) | tên, loại (ielts/communication), trình độ, kỹ năng, hình thức (Online/Offline), lịch tuần (thứ+giờ), tổng số buổi, số buổi đã học (cột cũ), trạng thái, ngày bắt đầu, chế độ lịch, học phí/học viên, ghi chú, con trỏ giáo trình | /root/projects/teacher-os/packages/db/src/schema/class.ts:10-41 | ✅ |
| Buổi học vật lý (`class_session`) | Lịch vật lý 1 buổi/ngày/lớp — tồn tại độc lập học viên | lớp, ngày (duy nhất cặp lớp+ngày), giờ, thời lượng, chủ đề, zoom | /root/projects/teacher-os/packages/db/src/schema/class-session.ts:15 · :19-41 | ✅ |
| Buổi dạy theo học viên (`lesson`) | Bảng "bucket": mỗi học viên active có 1 dòng bài cho mỗi buổi; nhóm theo (lớp, ngày) = một buổi vật lý | lớp, đăng ký, ngày định danh, thứ, giờ, thời lượng, chủ đề, zoom, trạng thái (upcoming/completed/absent/cancelled/holiday), điểm danh, ghi chú điểm danh | /root/projects/teacher-os/packages/db/src/schema/lesson.ts:29-80 | ✅ |
| Đăng ký (`enrollment`) | Nối học viên ↔ lớp, vòng đời invited→active (chi tiết ở feature `enrollment-lifecycle`) | học viên, lớp, trạng thái, duy nhất cặp | /root/projects/teacher-os/packages/db/src/schema/enrollment.ts:17-47 | ✅ |
| Gói buổi (`session_package`) | Quyền học của học viên (số buổi của khóa); tổng do server đồng bộ theo dòng buổi vật lý của lớp | học viên (nguồn sự thật), đăng ký (tùy chọn — parked), tổng | /root/projects/teacher-os/packages/db/src/schema/session-package.ts:14-52 | ✅ |
| Tài liệu gắn buổi (`lesson_material`) | Liên kết tài liệu ngân hàng vào buổi theo (lớp, ngày, tài liệu), tối đa 20, có vị trí | lớp, ngày, tài liệu, vị trí | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2556-2568 | ✅ |
| Tổ chức (`organization`) | Phạm vi của mọi dữ liệu; bootstrap tự tạo org + membership teacher | id, tên | /root/projects/teacher-os/packages/db/src/schema/class.ts:14-16 · /root/projects/teacher-os/apps/server/src/app.ts:264-289 | ✅ |
| Thành viên org (`membership`) | Gắn user vào org với role; giáo viên của lớp = membership teacher (không có cột giáo viên trên lớp) | user, org, role (teacher/student) | /root/projects/teacher-os/apps/server/src/routes/student-class.ts:71 · /root/projects/teacher-os/docs/project-overview-pdr.md:25 | ✅ |
| Giáo trình copy theo lớp (`syllabus`) | Bản copy nội dung khi tạo lớp với template; con trỏ gắn trên lớp; gỡ/gắn đổi chế độ lịch | lớp, modules/bài, loại bài, trạng thái bài reset khi copy | /root/projects/teacher-os/apps/server/src/lib/syllabus-curriculum.ts:62-72 · /root/projects/teacher-os/apps/server/src/routes/syllabus.ts:399-409 | ✅ (ranh giới feature `syllabus`) |
| Cặp lịch nghỉ gốc→bù (`holiday_session_shift`/`cancel`) | Lịch nghỉ chung org chiếm buổi: khóa bucket gốc, dời theo khi giáo viên dời buổi | lớp, ngày gốc, ngày bù | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:1762-1799 · :2263 | ✅ (ranh giới feature `holidays`) |

## Quan hệ

| Từ | Đến | Bản số | Ý nghĩa | Nguồn | Nhãn |
|----|-----|--------|---------|-------|------|
| Tổ chức | Lớp học | 1 - N | Mọi lớp thuộc một org; truy vấn luôn có điều kiện org | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:402-418 | ✅ |
| Lớp học | Buổi vật lý | 1 - N | Lịch thực của lớp; duy nhất (lớp, ngày) | /root/projects/teacher-os/packages/db/src/schema/class-session.ts:41 | ✅ |
| Lớp học | Buổi dạy (bucket) | 1 - N | Mỗi học viên active một dòng/buổi | /root/projects/teacher-os/packages/db/src/schema/lesson.ts:29-80 | ✅ |
| Đăng ký | Buổi dạy | 1 - N | Dòng bài thuộc đăng ký; cặp lớp↔đăng ký phải khớp (409 nếu lệch) | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:420-446 · :1897-1899 | ✅ |
| Đăng ký | Gói buổi | 1 - 0..1 | Gói gắn đăng ký tùy chọn (parked) | /root/projects/teacher-os/packages/db/src/schema/session-package.ts:14-18 · :45 | ✅ + OQ-5 |
| Buổi vật lý | Tài liệu gắn | 1 - 0..20 | Gắn theo (lớp, ngày, tài liệu); dời buổi kéo theo tài liệu | /root/projects/teacher-os/apps/server/src/routes/kernel.ts:2556-2568 · :2285-2291 | ✅ |
| Giáo trình copy | Lớp học | 0..1 - 0..1 | Có template → auto; không → manual | /root/projects/teacher-os/apps/server/src/routes/syllabus.ts:399-409 · :657-665 | ✅ |
| Học viên | Đăng ký | 1 - N | Duy nhất cặp (lớp, học viên) | /root/projects/teacher-os/packages/db/src/schema/enrollment.ts:40-43 | ✅ |

## Notes

* Cột `sessions_done` (số buổi đã học) trên bảng lớp là cột cũ: mọi điểm đọc derive từ dòng bài (/root/projects/teacher-os/packages/api/src/contracts.ts:1602-1606; /root/projects/teacher-os/apps/web/src/lib/repos/classes.ts:39-55) — vẽ ERD nhưng KHÔNG dùng làm nguồn sự thật. → OQ-6
* `session_package` KHÔNG có cột done/remaining — số đã học/còn lại luôn derive, tổng do server đồng bộ. ✅
* Bảng lớp KHÔNG có cột giáo viên — giáo viên = membership teacher của org (PDR chốt). Không mô hình hóa quan hệ Lớp—Giáo viên. → OQ (reverse-gaps Mục 3)
* `lesson_material` chỉ tồn tại ở tầng route (#655) trong file kernel — schema bảng nằm ngoài phạm vi trích dòng cụ thể tại đây (trích điểm ghi). ✅


<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền ai4ba.com</sub>
