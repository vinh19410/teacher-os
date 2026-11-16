import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import {
	AVATAR_MAX_IMAGE_CHARS,
	AVATAR_TARGET_PX,
	isSafeAvatarSrc,
	validateUpdateUserImage,
	validateUpdateUserName,
} from "./avatar-policy";
import { createAuth } from "./index";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url),
);

describe("avatar-policy constants", () => {
	it("pins the 192px render target and the 65536-char encoded cap", () => {
		expect(AVATAR_TARGET_PX).toBe(192);
		expect(AVATAR_MAX_IMAGE_CHARS).toBe(64 * 1024);
	});
});

describe("isSafeAvatarSrc", () => {
	it("accepts png and jpeg data URLs", () => {
		expect(isSafeAvatarSrc("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
		expect(isSafeAvatarSrc("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
	});

	it("accepts https URLs (Google avatars)", () => {
		expect(
			isSafeAvatarSrc("https://lh3.googleusercontent.com/a/photo=s96-c"),
		).toBe(true);
	});

	it("rejects dangerous or unsupported schemes", () => {
		expect(isSafeAvatarSrc("http://example.com/a.png")).toBe(false);
		expect(isSafeAvatarSrc("javascript:alert(1)")).toBe(false);
		expect(isSafeAvatarSrc("blob:https://app.example.com/x")).toBe(false);
		expect(isSafeAvatarSrc("data:text/html;base64,PGI+")).toBe(false);
		expect(isSafeAvatarSrc("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBe(
			false,
		);
	});

	it("rejects empty or missing values", () => {
		expect(isSafeAvatarSrc(null)).toBe(false);
		expect(isSafeAvatarSrc(undefined)).toBe(false);
		expect(isSafeAvatarSrc("")).toBe(false);
	});
});

describe("validateUpdateUserName", () => {
	it("passes undefined/null through so partial updates stay allowed", () => {
		expect(validateUpdateUserName(undefined)).toBeNull();
		expect(validateUpdateUserName(null)).toBeNull();
	});

	it("accepts a normal name", () => {
		expect(validateUpdateUserName("Trần Mai Lan")).toBeNull();
	});

	it("rejects blank names (floor of 2 trimmed characters)", () => {
		const msg = validateUpdateUserName("");
		expect(msg).toMatch(/2 ký tự/);
		expect(validateUpdateUserName("   ")).toMatch(/2 ký tự/);
		expect(validateUpdateUserName("A")).toMatch(/2 ký tự/);
	});

	it("rejects non-string values", () => {
		expect(validateUpdateUserName(42)).toMatch(/không hợp lệ/);
		expect(validateUpdateUserName({})).toMatch(/không hợp lệ/);
	});

	it("rejects names above 100 trimmed characters", () => {
		expect(validateUpdateUserName("a".repeat(101))).toMatch(/100 ký tự/);
		// Whitespace outside the budget does not count — trimming brings it back.
		expect(validateUpdateUserName(`  ${"b".repeat(99)}  `)).toBeNull();
	});
});

describe("validateUpdateUserImage", () => {
	it("passes undefined/null through so clearing stays possible upstream", () => {
		expect(validateUpdateUserImage(undefined)).toBeNull();
		expect(validateUpdateUserImage(null)).toBeNull();
	});

	it("rejects non-string values", () => {
		expect(validateUpdateUserImage(12345)).toMatch(/không hợp lệ/);
	});

	it("accepts jpeg/png data URLs inside the character budget", () => {
		const dataUrl = `data:image/jpeg;base64,${"A".repeat(1024)}`;
		expect(validateUpdateUserImage(dataUrl)).toBeNull();
	});

	it("accepts https image URLs inside the character budget", () => {
		expect(
			validateUpdateUserImage(
				`https://lh3.googleusercontent.com/${"x".repeat(512)}`,
			),
		).toBeNull();
	});

	it("rejects images above the character budget (chars, matching the client loop)", () => {
		const oversized = `data:image/png;base64,${"A".repeat(AVATAR_MAX_IMAGE_CHARS)}`;
		expect(validateUpdateUserImage(oversized)).toMatch(/64\s?KB|ký tự/i);
	});

	it("rejects disallowed payloads regardless of size", () => {
		expect(
			validateUpdateUserImage("data:image/svg+xml;base64,PHN2Zz4="),
		).toMatch(/JPEG\/PNG|https/);
		expect(validateUpdateUserImage("http://cdn.example.com/a.png")).toMatch(
			/JPEG\/PNG|https/,
		);
		expect(validateUpdateUserImage("")).toMatch(/JPEG\/PNG|https/);
	});
});

describe("/update-user rejects invalid profile payloads through better-auth", () => {
	const ORIGIN = "http://localhost:3000";
	let auth: Awaited<ReturnType<typeof setupAuth>>;
	let cookie: string;

	async function setupAuth() {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		return createAuth({
			db,
			corsOrigin: ORIGIN,
			studentOrigins: [],
			secret: "test-secret-0123456789abcdef0123456789abcdef",
			baseURL: ORIGIN,
			googleClientId: "test-dummy",
			googleClientSecret: "test-dummy",
			mailer: { send: async () => {} },
		});
	}

	function post(path: string, body: unknown, withCookie = true) {
		return auth.handler(
			new Request(`${ORIGIN}/api/auth${path}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: ORIGIN,
					...(withCookie && { cookie }),
				},
				body: JSON.stringify(body),
			}),
		);
	}

	async function currentUser() {
		const res = await auth.handler(
			new Request(`${ORIGIN}/api/auth/get-session`, {
				headers: { origin: ORIGIN, cookie },
			}),
		);
		return ((await res.json()) as { user: { name: string; image?: string } })
			.user;
	}

	beforeAll(async () => {
		auth = await setupAuth();
		const res = await post(
			"/sign-up/email",
			{
				name: "Trần Mai Lan",
				email: "lan@example.com",
				password: "password123",
			},
			false,
		);
		expect(res.status).toBe(200);
		const token = /better-auth\.session_token=([^;]+)/.exec(
			res.headers.getSetCookie().join("\n"),
		)?.[1];
		if (!token) throw new Error("sign-up set no session cookie");
		cookie = `better-auth.session_token=${token}`;
	});

	it("rejects a too-short name with 400 and the Vietnamese message", async () => {
		const res = await post("/update-user", { name: "A" });
		expect(res.status).toBe(400);
		expect(((await res.json()) as { message: string }).message).toMatch(
			/2 ký tự/,
		);
		expect((await currentUser()).name).toBe("Trần Mai Lan");
	});

	it("rejects an unsafe image payload and keeps the stored image", async () => {
		const res = await post("/update-user", {
			image: "data:image/svg+xml;base64,PHN2Zz4=",
		});
		expect(res.status).toBe(400);
		expect(((await res.json()) as { message: string }).message).toMatch(
			/JPEG\/PNG|https/,
		);
		expect((await currentUser()).image ?? null).toBeNull();
	});

	it("rejects an image above the character budget", async () => {
		const res = await post("/update-user", {
			image: `data:image/png;base64,${"A".repeat(AVATAR_MAX_IMAGE_CHARS)}`,
		});
		expect(res.status).toBe(400);
	});

	it("accepts a valid name and image and persists them", async () => {
		const image = "data:image/jpeg;base64,/9j/4AAQ";
		const res = await post("/update-user", { name: "Cô Lan", image });
		expect(res.status).toBe(200);
		const user = await currentUser();
		expect(user.name).toBe("Cô Lan");
		expect(user.image).toBe(image);
	});
});
