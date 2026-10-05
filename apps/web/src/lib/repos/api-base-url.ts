import { env } from "@teacher-os/env/web";
import { getServerUrl } from "@/lib/auth-client";

export function getApiBaseUrl(): string {
	return getServerUrl(env.VITE_SERVER_URL);
}
