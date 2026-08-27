import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/section-label";
import { authClient } from "@/lib/auth-client";
import { useLinkedAccounts } from "@/lib/use-linked-accounts";

function GoogleGlyph() {
	return (
		<span
			aria-hidden="true"
			className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line-soft border-solid bg-bg font-display font-semibold text-fg"
		>
			G
		</span>
	);
}

export function GoogleLinkCard() {
	const { googleLinked, loading, error, reload } = useLinkedAccounts();
	const [isRedirecting, setIsRedirecting] = useState(false);

	async function connectGoogle() {
		setIsRedirecting(true);
		// Absolute URL is mandatory: the callback lands on the API origin, so a
		// relative path would resolve to api.<domain>/profile (split-origin deploy).
		const base = `${window.location.origin}/profile`;
		const { error: linkError } = await authClient.linkSocial({
			provider: "google",
			callbackURL: base,
			errorCallbackURL: base, // better-auth appends ?error=<code> itself.
		});
		if (linkError) {
			setIsRedirecting(false);
			toast.error(
				linkError.message ||
					linkError.statusText ||
					"Không thể bắt đầu kết nối Google.",
			);
		}
	}

	return (
		<Card variant="white">
			<SectionLabel>Liên kết tài khoản Google</SectionLabel>
			{loading && (
				<p className="text-muted-fg text-sm">Đang tải trạng thái liên kết…</p>
			)}
			{!loading && error && (
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-danger text-sm">{error}</p>
					<Button variant="secondary" size="sm" onClick={() => void reload()}>
						Thử lại
					</Button>
				</div>
			)}
			{!loading && !error && googleLinked === true && (
				<div className="flex items-center gap-3">
					<GoogleGlyph />
					<div className="min-w-0 flex-1 leading-[1.35]">
						<div className="font-semibold text-sm">Google</div>
						<p className="truncate text-muted-fg text-xs">
							Tài khoản Google đã liên kết với hồ sơ này.
						</p>
					</div>
					<Badge variant="accent">Đã kết nối</Badge>
				</div>
			)}
			{!loading && !error && googleLinked === false && (
				<div className="flex items-center gap-3">
					<GoogleGlyph />
					<div className="min-w-0 flex-1 leading-[1.35]">
						<div className="font-semibold text-sm">Google</div>
						<p className="truncate text-muted-fg text-xs">
							Kết nối để đăng nhập nhanh bằng Google với cùng email.
						</p>
					</div>
					<Button disabled={isRedirecting} onClick={() => void connectGoogle()}>
						{isRedirecting ? "Đang mở Google…" : "Kết nối Google"}
					</Button>
				</div>
			)}
		</Card>
	);
}
