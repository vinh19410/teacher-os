import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resetPasswordEmailTemplate } from "../src/mail/reset-password-email-template";
import { verificationEmailTemplate } from "../src/mail/verification-email-template";

const previewDir = new URL("../.mail-preview", import.meta.url);
mkdirSync(previewDir, { recursive: true });

const sampleUrl =
	"http://localhost:3000/api/auth/verify-email?token=demo&callbackURL=http%3A%2F%2Flocalhost:8003%2Flogin";
const { html } = verificationEmailTemplate({ url: sampleUrl });

const outputPath = new URL(
	"../.mail-preview/verification.html",
	import.meta.url,
);
writeFileSync(outputPath, html, "utf8");

console.log("Email preview generated at:", fileURLToPath(outputPath));

const resetSampleUrl =
	"http://localhost:3000/api/auth/reset-password/demo-token?callbackURL=http%3A%2F%2Flocalhost:8001%2Freset-password";
const resetOutputPath = new URL(
	"../.mail-preview/reset-password.html",
	import.meta.url,
);
writeFileSync(
	resetOutputPath,
	resetPasswordEmailTemplate({ url: resetSampleUrl }).html,
	"utf8",
);

console.log("Email preview generated at:", fileURLToPath(resetOutputPath));
