import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	server: {
		port: 8001,
		strictPort: true,
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		tailwindcss(),
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
		VitePWA({
			registerType: "autoUpdate",
			manifest: {
				name: "Teacher OS",
				short_name: "Teacher OS",
				description:
					"Teacher OS — quản lý lớp gia sư 1:1: học viên, lịch dạy, học phí, bài tập.",
				theme_color: "#ffffff",
				background_color: "#ffffff",
			},
			pwaAssets: { disabled: false, config: true },
			devOptions: { enabled: true },
		}),
	],
});
