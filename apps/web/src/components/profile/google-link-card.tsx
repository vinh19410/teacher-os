import { GOOGLE_MEET_SCOPES } from "@teacher-os/api/contracts";
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
			className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border border-solid bg-background font-semibold text-foreground"
		>
			G
		</span>
	);
}

export function GoogleLinkCard() {
	const { googleLinked, googleStatus, loading, error, reload } =
		useLinkedAccounts();
	const [isRedirecting, setIsRedirecting] = useState(false);

	async function connectGoogle(withMeetScopes = false) {
		setIsRedirecting(true);
		// Absolute URL is mandatory: the callback lands on the API origin, so a
		// relative path would resolve to api.<domain>/profile (split-origin deploy).
		const base = `${window.location.origin}/profile`;
		const { error: linkError } = await authClient.linkSocial({
			provider: "google",
			callbackURL: base,
			errorCallbackURL: base, // better-auth appends ?error=<code> itself.
			...(withMeetScopes ? { scopes: [...GOOGLE_MEET_SCOPES] } : {}),
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

	const needsMeetPermission =
		googleLinked === true &&
		googleStatus !== null &&
		(!googleStatus.hasMeetScopes || !googleStatus.hasRefreshToken);
	const meetReady =
		googleLinked === true &&
		googleStatus !== null &&
		googleStatus.hasMeetScopes &&
		googleStatus.hasRefreshToken;

	return (
		<Card variant="white">
			<SectionLabel>Liên kết tài khoản Google</SectionLabel>
			{loading && (
				<p className="text-muted-foreground text-sm">
					Đang tải trạng thái liên kết…
				</p>
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
				<div className="flex flex-col gap-3">
					<div className="flex flex-wrap items-center gap-3">
						<GoogleGlyph />
						<div className="min-w-0 flex-1 leading-[1.35]">
							<div className="font-semibold text-sm">Google</div>
							<p className="text-muted-foreground text-xs">
								{meetReady
									? "Đã sẵn sàng tạo Google Calendar, Google Meet và đồng bộ recording."
									: needsMeetPermission
										? googleStatus?.hasMeetScopes &&
											!googleStatus?.hasRefreshToken
											? "Phiên Google Workspace đã hết hạn hoặc bị thu hồi. Vui lòng kết nối lại để tiếp tục tạo Meet và đồng bộ recording."
											: "Đã liên kết đăng nhập. Cần cấp thêm quyền Calendar, Meet và Drive để tự động tạo phòng học & lấy recording."
										: "Tài khoản Google đã liên kết với hồ sơ này."}
							</p>
						</div>
						<Badge variant={needsMeetPermission ? "warn" : "accent"}>
							{meetReady
								? "Sẵn sàng Meet"
								: needsMeetPermission
									? googleStatus?.hasMeetScopes &&
										!googleStatus?.hasRefreshToken
										? "Cần cấp lại quyền"
										: "Thiếu quyền Meet"
									: "Đã kết nối"}
						</Badge>
					</div>
					{(needsMeetPermission || meetReady) && (
						<div className="flex flex-wrap items-center justify-end gap-2">
							<Button
								size="sm"
								variant={needsMeetPermission ? "primary" : "secondary"}
								disabled={isRedirecting}
								onClick={() => void connectGoogle(true)}
							>
								{isRedirecting
									? "Đang mở Google…"
									: meetReady
										? "Cấp lại / làm mới quyền Google"
										: googleStatus?.hasMeetScopes &&
												!googleStatus?.hasRefreshToken
											? "Kết nối lại Google"
											: "Cấp quyền Google Meet & Drive"}
							</Button>
						</div>
					)}
				</div>
			)}
			{!loading && !error && googleLinked === false && (
				<div className="flex flex-wrap items-center gap-3">
					<GoogleGlyph />
					<div className="min-w-0 flex-1 leading-[1.35]">
						<div className="font-semibold text-sm">Google</div>
						<p className="text-muted-foreground text-xs">
							Kết nối Google Workspace để đăng nhập nhanh, tạo link Meet và đồng
							bộ recording.
						</p>
					</div>
					<Button
						disabled={isRedirecting}
						onClick={() => void connectGoogle(true)}
					>
						{isRedirecting ? "Đang mở Google…" : "Kết nối Google"}
					</Button>
				</div>
			)}
		</Card>
	);
}
