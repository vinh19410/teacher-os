/**
 * Origins cho seed API + Origin header — cùng nguồn env với playwright
 * config (E2E_API_PORT/E2E_LMS_PORT/E2E_WEB_PORT) để e2e chạy được song song
 * với dev server đang chiếm 8000/8001; mặc định giữ nguyên như CI.
 */
export const API_ORIGIN = `http://localhost:${process.env.E2E_API_PORT ?? 8000}`;
export const LMS_ORIGIN = `http://localhost:${process.env.E2E_LMS_PORT ?? process.env.E2E_WEB_PORT ?? 8001}`;
// Cổng LMS hợp nhất (single-origin): tất cả Origin header đều trỏ về LMS_ORIGIN
// không kèm path; các base URL theo vai trò dùng hằng *_BASE_URL bên dưới.
export const WEB_ORIGIN = LMS_ORIGIN;
export const STUDENT_ORIGIN = LMS_ORIGIN;
export const ADMIN_ORIGIN = LMS_ORIGIN;
export const TEACHER_BASE_URL = `${LMS_ORIGIN}/teacher`;
export const STUDENT_BASE_URL = `${LMS_ORIGIN}/student`;
export const ADMIN_BASE_URL = `${LMS_ORIGIN}/admin`;
// Trang profile cô Mỹ (plan #506) — gửi form đăng ký học tới /public/leads.
export const PROFILE_ORIGIN = `http://localhost:${process.env.E2E_PROFILE_PORT ?? 8105}`;
