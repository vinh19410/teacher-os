export interface MailInput {
	to: string;
	subject: string;
	html: string;
	text: string;
	/** Header Reply-To (email chủ tổ chức, plan TOS-21 D5) — vắng mặt thì không gửi header. */
	replyTo?: string;
	/** Tên người gửi hiển thị ("Tên org qua Cô Mỹ Dạy Tiếng Anh") — vắng mặt thì from là địa chỉ trần. */
	fromName?: string;
	/** Khóa chống gửi trùng Resend (header Idempotency-Key, #570) — mỗi lượt gửi lại truyền khóa mới. */
	idempotencyKey?: string;
	/** Timeout mỗi lượt gọi Resend (mặc định 10_000ms; đường đồng bộ truyền 5_000ms). */
	timeoutMs?: number;
}

function sanitizeHeaderValue(value: string, maxLen = 200): string {
	return value
		.replaceAll("\r", "")
		.replaceAll("\n", "")
		.replaceAll("\0", "")
		.trim()
		.slice(0, maxLen);
}

export function composeFrom(from: string, fromName?: string): string {
	const cleanedFrom = sanitizeHeaderValue(from, 320);
	const cleanedName = fromName ? sanitizeHeaderValue(fromName, 200) : "";
	const angleMatch = cleanedFrom.match(/^(.*?)\s*<([^<>]+)>$/);
	if (angleMatch) {
		const embeddedName = angleMatch[1]?.trim() ?? "";
		const bareAddress = sanitizeHeaderValue(angleMatch[2] ?? "", 254);
		const nameToUse = cleanedName || embeddedName;
		if (!nameToUse) return bareAddress;
		const unquoted =
			nameToUse.startsWith('"') && nameToUse.endsWith('"') && nameToUse.length >= 2
				? nameToUse.slice(1, -1)
				: nameToUse;
		const escaped = unquoted.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
		return `"${escaped}" <${bareAddress}>`;
	}
	if (cleanedName) {
		const bareAddress = sanitizeHeaderValue(cleanedFrom, 254);
		const escaped = cleanedName.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
		return `"${escaped}" <${bareAddress}>`;
	}
	return cleanedFrom;
}

export interface Mailer {
	send(input: MailInput): Promise<void>;
}

export function createLogMailer(): Mailer {
	return {
		async send(input: MailInput): Promise<void> {
			console.info(
				"[mail:log] to=%s subject=%s replyTo=%s fromName=%s\n%s",
				input.to,
				input.subject,
				input.replyTo ?? "",
				input.fromName ?? "",
				input.text,
			);
		},
	};
}

export function createResendMailer({
	apiKey,
	from,
}: {
	apiKey: string;
	from: string;
}): Mailer {
	async function postMail(input: MailInput): Promise<Response> {
		const idempotencyKey = input.idempotencyKey
			? sanitizeHeaderValue(input.idempotencyKey, 255)
			: "";
		const replyTo = input.replyTo
			? sanitizeHeaderValue(input.replyTo, 254)
			: "";
		return fetch("https://api.resend.com/emails", {
			method: "POST",
			signal: AbortSignal.timeout(input.timeoutMs ?? 10_000),
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
			},
			body: JSON.stringify({
				from: composeFrom(from, input.fromName),
				...(replyTo ? { reply_to: replyTo } : {}),
				to: [sanitizeHeaderValue(input.to, 254)],
				subject: sanitizeHeaderValue(input.subject, 250),
				html: input.html,
				text: input.text,
			}),
		});
	}

	return {
		async send(input: MailInput): Promise<void> {
			let res = await postMail(input);
			if (!res.ok && (res.status === 429 || res.status >= 500)) {
				const retryAfterHeader = res.headers?.get?.("Retry-After");
				const retrySeconds = retryAfterHeader
					? Number(retryAfterHeader)
					: Number.NaN;
				if (Number.isNaN(retrySeconds) || retrySeconds <= 2) {
					const rawSleepMs =
						!Number.isNaN(retrySeconds) && retrySeconds > 0
							? retrySeconds * 1000
							: 500;
					const sleepMs = Math.min(rawSleepMs, 2_000);
					const { promise, resolve } = Promise.withResolvers<void>();
					setTimeout(resolve, sleepMs);
					await promise;
					res = await postMail(input);
				}
			}

			if (!res.ok) {
				const errorText = await res.text();
				throw new Error(`resend send failed: ${res.status} ${errorText}`);
			}
		},
	};
}
