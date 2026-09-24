export interface MailInput {
	to: string;
	subject: string;
	html: string;
	text: string;
}

export interface Mailer {
	send(input: MailInput): Promise<void>;
}

export function createLogMailer(): Mailer {
	return {
		async send(input: MailInput): Promise<void> {
			console.info(
				"[mail:log] to=%s subject=%s\n%s",
				input.to,
				input.subject,
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
		return fetch("https://api.resend.com/emails", {
			method: "POST",
			signal: AbortSignal.timeout(10_000),
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from,
				to: [input.to],
				subject: input.subject,
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
				const sleepMs =
					!Number.isNaN(retrySeconds) && retrySeconds > 0
						? retrySeconds * 1000
						: 500;
				await new Promise((resolve) => setTimeout(resolve, sleepMs));
				res = await postMail(input);
			}

			if (!res.ok) {
				const errorText = await res.text();
				throw new Error(`resend send failed: ${res.status} ${errorText}`);
			}
		},
	};
}
