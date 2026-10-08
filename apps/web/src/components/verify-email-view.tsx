import { Link } from "@tanstack/react-router";
import { CircleAlert, Loader2, MailCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

interface VerifyEmailViewProps {
	verified?: string;
	error?: string;
}

export default function VerifyEmailView({
	verified,
	error,
}: VerifyEmailViewProps) {
	const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">(
		"idle",
	);
	const [resendFailed, setResendFailed] = useState(false);
	const { data: session, isPending } = authClient.useSession();
	const user = session?.user;

	// Page state comes only from the query marker the callbackURL baked in:
	// a successful better-auth redirect preserves the callback URL untouched,
	// failures append &error=<code>. The marker must be a value TanStack
	// Router's default parseSearch keeps as a string — JSON-parsable values
	// ("1", "true") arrive typed and get pruned by URL-sync.
	const success = !error && verified === "ok";
	const userEmail = user?.email;
	const canResend = Boolean(userEmail && user?.emailVerified === false);

	const handleResend = async () => {
		if (!userEmail) return;
		setResendStatus("sending");
		setResendFailed(false);
		try {
			const res = await authClient.sendVerificationEmail({
				email: userEmail,
				callbackURL: `${window.location.origin}/verify-email?verified=ok`,
			});
			if (res.error) {
				const msg = res.error.message || "";
				// Verified in the meantime → reload so the card re-reads the
				// fresh session (student-error-view precedent).
				if (
					msg.includes("EMAIL_ALREADY_VERIFIED") ||
					res.error.code === "EMAIL_ALREADY_VERIFIED"
				) {
					window.location.reload();
					return;
				}
				setResendFailed(true);
				setResendStatus("idle");
				return;
			}
			// Success copy replaces the button: no toast that could contradict
			// the card state.
			setResendStatus("sent");
		} catch {
			// Keep the button clickable, but say the attempt failed — a silent
			// return to idle reads as "nothing happened".
			setResendFailed(true);
			setResendStatus("idle");
			return;
		}
	};

	if (success) {
		return (
			<div className="text-center">
				<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
					<MailCheck className="h-7 w-7 text-hot" />
				</div>
				<h2 className="font-[620] font-display text-[28px] leading-[1.15] tracking-[-0.015em] max-[420px]:text-[24px]">
					Email verified
				</h2>
				<p className="mt-2 text-muted-fg text-sm">
					Your email address has been confirmed. You're all set.
				</p>
				<div className="mt-6 flex justify-center">
					<Button
						onClick={() => window.location.assign("/")}
						className="w-full"
					>
						Go to workspace
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="text-center">
			<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft">
				<CircleAlert className="h-7 w-7 text-danger" />
			</div>
			<h2 className="font-[620] font-display text-[28px] leading-[1.15] tracking-[-0.015em] max-[420px]:text-[24px]">
				This link didn't work
			</h2>
			<p className="mt-2 text-muted-fg text-sm">
				The verification link is invalid, already used, or has expired. Request
				a new one, or sign in and continue.
			</p>
			{!isPending && canResend && userEmail ? (
				resendStatus === "sent" ? (
					<p className="mt-6 text-sm text-success">
						We've sent a new verification email.
					</p>
				) : (
					<div className="mt-6 flex justify-center">
						<Button
							onClick={() => void handleResend()}
							disabled={resendStatus === "sending"}
						>
							{resendStatus === "sending" ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />
									Sending…
								</>
							) : (
								"Send a new link"
							)}
						</Button>
						{resendFailed && (
							<p className="mt-2 w-full text-danger text-sm">
								Couldn't send a new link. Try again.
							</p>
						)}
					</div>
				)
			) : !isPending && !canResend ? (
				<p className="mt-6">
					<Link to="/login">Back to sign in</Link>
				</p>
			) : null}
		</div>
	);
}
