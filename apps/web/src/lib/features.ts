import { env } from "@teacher-os/env/web";

/**
 * Static feature flags for deferred feature clusters.
 * Flip a constant to re-enable a hidden cluster; no runtime toggle needed.
 */
export const PARENT_REPORTS_ENABLED = false;

/** Cùng cờ với `AI_ENABLED` phía server; tắt thì ẩn mọi điểm vào AI. */
export const AI_ENABLED = env.VITE_AI_ENABLED === "true";
