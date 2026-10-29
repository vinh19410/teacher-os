/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
	readonly VITE_STUDENT_PORTAL_ENABLED?: "true" | "false";
}
