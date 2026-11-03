import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_SERVER_URL: z.url(),
		VITE_AI_ENABLED: z.string().optional(),
		// Cờ build-time tắt đăng ký giáo viên ở /login (#539, single-org);
		// e2e/verify tự bật, prod không đặt biến là tắt.
		VITE_TEACHER_SIGNUP_ENABLED: z.string().optional(),
	},
	runtimeEnv: (import.meta as any).env,
	emptyStringAsUndefined: true,
});
