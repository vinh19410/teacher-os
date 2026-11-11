import assert from "node:assert/strict";
import { test } from "node:test";
import {
	assertVerifiedEmailRedirect,
	clampTimeoutMs,
	isTransientNavError,
	redactCapabilityUrl,
	TransientNavError,
	withNavRetry,
} from "./design-seed-nav";

test("redactCapabilityUrl che ?token=, percent-encoded token, reset-password, /pay/ và giữ nguyên cấu trúc log", () => {
	const rawVerify =
		"http://localhost:8100/api/auth/verify-email?token=eyJhbGciOiJIUzI1NiJ9.SECRET_PAYLOAD&callbackURL=http%3A%2F%2Flocalhost%3A8103%2Fverify-email%3Fverified%3Dok";
	const redactedVerify = redactCapabilityUrl(rawVerify);
	assert.equal(redactedVerify.includes("SECRET_PAYLOAD"), false);
	assert.match(redactedVerify, /\?token=\[redacted\]&callbackURL=/);

	const ampToken = "http://localhost:8100/x?foo=1&token=AMP_SECRET_123";
	assert.equal(
		redactCapabilityUrl(ampToken),
		"http://localhost:8100/x?foo=1&token=[redacted]",
	);

	// Token chứa dấu ')' ở giữa không được cắt sớm làm lộ phần đuôi
	const midParen =
		"http://localhost:8100/api/auth/verify-email?token=hdr)MID_PAREN_SECRET&callbackURL=http://localhost:8103";
	const redactedMidParen = redactCapabilityUrl(midParen);
	assert.equal(redactedMidParen.includes("MID_PAREN_SECRET"), false);
	assert.equal(
		redactedMidParen,
		"http://localhost:8100/api/auth/verify-email?token=[redacted]&callbackURL=http://localhost:8103",
	);

	// Chuỗi log kiểu page.goto(url): không làm lộ token ở cuối đồng thời giữ dấu đóng ngoặc ngoài
	const wrappedGoto =
		"TimeoutError: page.goto(http://localhost:8100/api/auth/verify-email?token=END_PAREN_SECRET): Timeout 30000ms exceeded";
	const redactedWrapped = redactCapabilityUrl(wrappedGoto);
	assert.equal(redactedWrapped.includes("END_PAREN_SECRET"), false);
	assert.match(
		redactedWrapped,
		/\?token=\[redacted\]\): Timeout 30000ms exceeded/,
	);
	const commaWrappedGoto =
		'TimeoutError: page.goto(http://localhost:8100/api/auth/verify-email?token=COMMA_PAREN_SECRET), waiting until "load"';
	const redactedCommaWrapped = redactCapabilityUrl(commaWrappedGoto);
	assert.equal(redactedCommaWrapped.includes("COMMA_PAREN_SECRET"), false);
	assert.match(
		redactedCommaWrapped,
		/\?token=\[redacted\]\), waiting until "load"/,
	);

	// Percent-encoded token, reset-password, /pay/, Bearer, GitHub PAT
	const multi = [
		"returnUrl=http%3A%2F%2Flocalhost%3Ftoken%3DENC_SECRET_1%26next%3D1",
		"cb=http%3A%2F%2Flocalhost%3Fa%3D1%26token%3DENC_SECRET_2",
		"http://localhost:8100/api/auth/reset-password/RESET_SECRET_TOK?callbackURL=http://x",
		"http://localhost:8101/pay/cmpPaySecret987654",
		"Authorization: Bearer BEARER_SECRET_XYZ",
		"pat=ghp_1234567890abcdefSECRET",
	].join(" | ");
	const redactedMulti = redactCapabilityUrl(multi);
	for (const leak of [
		"ENC_SECRET_1",
		"ENC_SECRET_2",
		"RESET_SECRET_TOK",
		"cmpPaySecret987654",
		"BEARER_SECRET_XYZ",
		"ghp_1234567890abcdefSECRET",
	]) {
		assert.equal(
			redactedMulti.includes(leak),
			false,
			`không được lộ ${leak}: ${redactedMulti}`,
		);
	}
});

test("isTransientNavError nhận diện đúng lỗi điều hướng/5xx tạm thời và từ chối ECONNREFUSED", () => {
	assert.equal(
		isTransientNavError(new TransientNavError("verify-email HTTP 503")),
		true,
	);
	const pwTimeout = new Error("page.goto: waiting until load");
	pwTimeout.name = "TimeoutError";
	assert.equal(isTransientNavError(pwTimeout), true);
	assert.equal(
		isTransientNavError(
			new Error("apiRequestContext.get: Timeout 30000ms exceeded."),
		),
		true,
	);
	assert.equal(
		isTransientNavError(
			new Error("page.goto: net::ERR_ABORTED at http://localhost:8103/"),
		),
		true,
	);
	assert.equal(
		isTransientNavError(
			new Error(
				'page.goto: Navigation to "http://localhost:8103/" is interrupted by another navigation',
			),
		),
		true,
	);
	assert.equal(isTransientNavError(new Error("read ECONNRESET")), true);
	assert.equal(
		isTransientNavError(new Error("net::ERR_CONNECTION_RESET")),
		true,
	);
	assert.equal(isTransientNavError(new Error("socket hang up")), true);

	assert.equal(
		isTransientNavError(
			new Error("page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1"),
		),
		false,
	);
	assert.equal(
		isTransientNavError(new Error("connect ECONNREFUSED 127.0.0.1:8100")),
		false,
	);
	assert.equal(isTransientNavError(new Error("unexpected status 403")), false);
});

test("clampTimeoutMs kẹp theo deadline - safetyMarginMs và ném lỗi đã redact khi hết ngân sách", () => {
	assert.equal(
		clampTimeoutMs(100_000, 30_000, "step-a", { now: () => 50_000 }),
		30_000,
	);
	assert.equal(
		clampTimeoutMs(100_000, 60_000, "step-b", {
			now: () => 50_000,
			safetyMarginMs: 2_000,
		}),
		48_000,
	);

	let caught: unknown;
	try {
		clampTimeoutMs(
			56_000,
			30_000,
			"verify http://localhost:8100/api/auth/verify-email?token=CLAMP_SECRET",
			{
				now: () => 50_000,
				minRemainingMs: 5_000,
				safetyMarginMs: 2_000,
			},
		);
	} catch (err) {
		caught = err;
	}
	assert.ok(caught instanceof Error);
	assert.match(caught.message, /SEED_DEADLINE/);
	assert.equal(caught.message.includes("CLAMP_SECRET"), false);
	assert.match(caught.message, /\[redacted\]/);
});

test("withNavRetry thử lại sau lỗi tạm thời có retryDelayMs/onRetry và trả kết quả khi lần 2 thành công", async () => {
	const budgets: number[] = [];
	const sleeps: number[] = [];
	const retryEvents: Array<{ nextAttempt: number; lastEntry: string }> = [];
	let calls = 0;

	const res = await withNavRetry(
		async (budgetMs) => {
			calls += 1;
			budgets.push(budgetMs);
			if (calls === 1) {
				const err = new Error(
					"page.goto(http://localhost:8100/api/auth/verify-email?token=RETRY_SECRET): Timeout 45000ms exceeded",
				);
				err.name = "TimeoutError";
				throw err;
			}
			return "verified-ok";
		},
		{
			label: "gotoStable http://localhost:8103/",
			attempts: 2,
			perAttemptMs: 45_000,
			deadline: 200_000,
			retryDelayMs: 500,
			now: () => 10_000,
			sleep: async (ms) => {
				sleeps.push(ms);
			},
			onRetry: ({ nextAttempt, lastEntry }) => {
				retryEvents.push({ nextAttempt, lastEntry });
			},
		},
	);

	assert.equal(res, "verified-ok");
	assert.equal(calls, 2);
	assert.deepEqual(budgets, [45_000, 45_000]);
	assert.deepEqual(sleeps, [500]);
	assert.equal(retryEvents.length, 1);
	assert.equal(retryEvents[0]?.nextAttempt, 2);
	assert.equal(retryEvents[0]?.lastEntry.includes("RETRY_SECRET"), false);
});

test("withNavRetry dừng ngay ở lỗi không tạm thời, redact cả opts.label và không gắn Error.cause", async () => {
	let calls = 0;
	let sleepCalled = false;
	let caught: unknown;

	try {
		await withNavRetry(
			async () => {
				calls += 1;
				throw new Error(
					"net::ERR_CONNECTION_REFUSED at http://localhost:8100/api/auth/verify-email?token=ERR_BODY_SECRET",
				);
			},
			{
				label:
					"verify-email http://localhost:8100/api/auth/verify-email?token=LABEL_SECRET_TOKEN",
				attempts: 2,
				perAttemptMs: 30_000,
				deadline: 200_000,
				now: () => 10_000,
				sleep: async () => {
					sleepCalled = true;
				},
			},
		);
	} catch (err) {
		caught = err;
	}

	assert.equal(calls, 1);
	assert.equal(sleepCalled, false);
	assert.ok(caught instanceof Error);
	assert.equal(caught.cause, undefined);
	assert.equal(caught.message.includes("LABEL_SECRET_TOKEN"), false);
	assert.equal(caught.message.includes("ERR_BODY_SECRET"), false);
	assert.match(caught.message, /\[redacted\]/);
});

test("withNavRetry cắt ngắn timeout theo deadline và bỏ qua lần thử kế khi quỹ thời gian dưới minRemainingMs", async () => {
	let currentNow = 82_000;
	const budgets: number[] = [];
	let caught: unknown;

	try {
		await withNavRetry(
			async (budgetMs) => {
				budgets.push(budgetMs);
				currentNow = 97_000; // còn 3_000ms (< minRemainingMs 5_000ms)
				const err = new Error("Timeout 16000ms exceeded");
				err.name = "TimeoutError";
				throw err;
			},
			{
				label: "gotoStable http://localhost:8103/",
				attempts: 2,
				perAttemptMs: 45_000,
				deadline: 100_000,
				minRemainingMs: 5_000,
				safetyMarginMs: 2_000,
				retryDelayMs: 500,
				now: () => currentNow,
				sleep: async (ms) => {
					currentNow += ms;
				},
			},
		);
	} catch (err) {
		caught = err;
	}

	assert.deepEqual(budgets, [16_000]);
	assert.ok(caught instanceof Error);
	assert.equal(caught.cause, undefined);
	assert.match(caught.message, /skipped/);
});

test("withNavRetry che sạch token trên toàn bộ timeline khi hết số lần thử và không gắn Error.cause", async () => {
	let calls = 0;
	let caught: unknown;

	try {
		await withNavRetry(
			async () => {
				calls += 1;
				const err = new Error(
					'page.goto(http://localhost:8100/api/auth/verify-email?token=LIVE_SECRET_TOKEN&callbackURL=http%3A%2F%2Flocalhost%3A8103%2Fverify-email%3Fverified%3Dok), waiting until "load"',
				);
				err.name = "TimeoutError";
				throw err;
			},
			{
				label:
					"verify-email http://localhost:8100/api/auth/verify-email?token=LIVE_SECRET_TOKEN",
				attempts: 2,
				perAttemptMs: 30_000,
				deadline: 200_000,
				now: () => 5_000,
				sleep: async () => {},
			},
		);
	} catch (err) {
		caught = err;
	}

	assert.equal(calls, 2);
	assert.ok(caught instanceof Error);
	assert.equal(caught.cause, undefined);
	assert.equal(caught.message.includes("LIVE_SECRET_TOKEN"), false);
	assert.match(caught.message, /\?token=\[redacted\]/);
});

test("assertVerifiedEmailRedirect kiểm chặt status 302, Location tuyệt đối cùng origin, query verified=ok và cookie có giá trị", () => {
	assert.doesNotThrow(() =>
		assertVerifiedEmailRedirect({
			status: 302,
			location: "http://localhost:8103/verify-email?verified=ok",
			studentOrigin: "http://localhost:8103",
			cookies: [
				{ name: "__Secure-better-auth.session_token", value: "sess_123" },
			],
		}),
	);

	assert.doesNotThrow(() =>
		assertVerifiedEmailRedirect({
			status: 302,
			location: "http://localhost:8103/verify-email?verified=ok",
			studentOrigin: "http://localhost:8103",
			cookies: [{ name: "teacheros-staging.session_token", value: "sess_456" }],
		}),
	);

	const invalidCases: Array<{
		name: string;
		input: Parameters<typeof assertVerifiedEmailRedirect>[0];
	}> = [
		{
			name: "status 200 thay vì 302",
			input: {
				status: 200,
				location: "http://localhost:8103/verify-email?verified=ok",
				studentOrigin: "http://localhost:8103",
				cookies: [
					{ name: "__Secure-better-auth.session_token", value: "sess_123" },
				],
			},
		},
		{
			name: "location undefined",
			input: {
				status: 302,
				location: undefined,
				studentOrigin: "http://localhost:8103",
				cookies: [
					{ name: "__Secure-better-auth.session_token", value: "sess_123" },
				],
			},
		},
		{
			name: "relative location không có origin tuyệt đối",
			input: {
				status: 302,
				location: "/verify-email?verified=ok",
				studentOrigin: "http://localhost:8103",
				cookies: [
					{ name: "__Secure-better-auth.session_token", value: "sess_123" },
				],
			},
		},
		{
			name: "location chứa userinfo",
			input: {
				status: 302,
				location: "http://user:pass@localhost:8103/verify-email?verified=ok",
				studentOrigin: "http://localhost:8103",
				cookies: [
					{ name: "__Secure-better-auth.session_token", value: "sess_123" },
				],
			},
		},
		{
			name: "location chứa error=INVALID_TOKEN",
			input: {
				status: 302,
				location:
					"http://localhost:8103/verify-email?verified=ok&error=INVALID_TOKEN",
				studentOrigin: "http://localhost:8103",
				cookies: [
					{ name: "__Secure-better-auth.session_token", value: "sess_123" },
				],
			},
		},
		{
			name: "location chứa query key lạ",
			input: {
				status: 302,
				location: "http://localhost:8103/verify-email?verified=ok&extra=1",
				studentOrigin: "http://localhost:8103",
				cookies: [
					{ name: "__Secure-better-auth.session_token", value: "sess_123" },
				],
			},
		},
		{
			name: "location sai origin",
			input: {
				status: 302,
				location: "http://localhost:8101/verify-email?verified=ok",
				studentOrigin: "http://localhost:8103",
				cookies: [
					{ name: "__Secure-better-auth.session_token", value: "sess_123" },
				],
			},
		},
		{
			name: "thiếu verified=ok",
			input: {
				status: 302,
				location: "http://localhost:8103/verify-email",
				studentOrigin: "http://localhost:8103",
				cookies: [
					{ name: "__Secure-better-auth.session_token", value: "sess_123" },
				],
			},
		},
		{
			name: "thiếu session_token cookie",
			input: {
				status: 302,
				location: "http://localhost:8103/verify-email?verified=ok",
				studentOrigin: "http://localhost:8103",
				cookies: [{ name: "other_cookie", value: "1" }],
			},
		},
		{
			name: "cookie session_token rỗng (Max-Age=0)",
			input: {
				status: 302,
				location: "http://localhost:8103/verify-email?verified=ok",
				studentOrigin: "http://localhost:8103",
				cookies: [{ name: "__Secure-better-auth.session_token", value: "" }],
			},
		},
	];

	for (const tc of invalidCases) {
		let errCaught: unknown;
		try {
			assertVerifiedEmailRedirect(tc.input);
		} catch (err) {
			errCaught = err;
		}
		assert.ok(errCaught instanceof Error, `phải ném lỗi cho ca: ${tc.name}`);
		assert.equal(
			isTransientNavError(errCaught),
			false,
			`lỗi assertVerifiedEmailRedirect không được phân loại là transient: ${tc.name}`,
		);
	}

	// Nếu Location bất thường lỡ mang ?token=..., thông báo lỗi vẫn phải redact
	let leakErr: unknown;
	try {
		assertVerifiedEmailRedirect({
			status: 302,
			location: "http://localhost:8103/verify-email?token=LOC_RAW_SECRET",
			studentOrigin: "http://localhost:8103",
			cookies: [
				{ name: "__Secure-better-auth.session_token", value: "sess_123" },
			],
		});
	} catch (err) {
		leakErr = err;
	}
	assert.ok(leakErr instanceof Error);
	assert.equal(leakErr.message.includes("LOC_RAW_SECRET"), false);
});
