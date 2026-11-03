import { env } from "@teacher-os/env/web";

/**
 * Static feature flags for deferred feature clusters.
 * Flip a constant to re-enable a hidden cluster; no runtime toggle needed.
 */
export const PARENT_REPORTS_ENABLED = false;

export const AI_ENABLED = env.VITE_AI_ENABLED === "true";

// Tắt đăng ký tài khoản giáo viên ở /login trong giai đoạn single-org (#539).
// Mặc định tắt: chỉ hiện form đăng nhập; bật lại bằng biến build
// VITE_TEACHER_SIGNUP_ENABLED=true (e2e/verify tự bật).
export const TEACHER_SIGNUP_ENABLED =
	env.VITE_TEACHER_SIGNUP_ENABLED === "true";
