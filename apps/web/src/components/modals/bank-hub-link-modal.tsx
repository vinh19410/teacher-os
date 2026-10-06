import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BankLinkTokenResponse } from "@teacher-os/api/contracts";
import { useEffect, useState } from "react";
import type { BankLinkPurpose } from "@/components/payments/bank-link-panel";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";
import {
	BankLinkRequestError,
	bankLinkQueryKey,
	bankLinkQueryOptions,
	createBankLinkToken,
	syncBankLink,
} from "@/lib/repos/bank-link";

function errorMessage(err: unknown): string {
	if (err instanceof BankLinkRequestError) {
		switch (err.code) {
			case "BANK_LINK_ALREADY_LINKED":
				return "Tài khoản đã được liên kết.";
			case "BANK_LINK_NO_LINKED_ACCOUNT":
				return "Chưa có tài khoản nào để thực hiện thao tác này.";
			case "BANK_LINK_BAD_HOSTED_LINK_ORIGIN":
				return "Cấu hình Bank Hub không hợp lệ — liên hệ hỗ trợ.";
			case "BANK_LINK_COMPANY_SETTLING":
				return "Hệ thống đang thiết lập, bấm Thử lại sau vài giây.";
			case "BANKHUB_DISABLED":
				return "Tính năng chưa được bật.";
			default:
				break;
		}
	}
	return "Không tạo được liên kết. Vui lòng thử lại.";
}

/**
 * Iframe modal around the SePay Bank Hub hosted link (#320). postMessage is
 * only a UX shortcut — the sandbox may not emit FINISHED_* without a
 * completion_redirect_uri — so the modal also polls GET /api/bank-link every
 * 5 s while open and closes itself once the server reports "linked".
 */
export function BankHubLinkModal({
	open,
	purpose,
	onClose,
}: {
	open: boolean;
	purpose: BankLinkPurpose;
	/** `changed` = the link state may have been mutated (caller re-fetches). */
	onClose: (changed: boolean) => void;
}) {
	const baseUrl = getApiBaseUrl();
	const queryClient = useQueryClient();
	const [token, setToken] = useState<BankLinkTokenResponse | null>(null);
	const [error, setError] = useState<string | null>(null);

	const requestToken = async () => {
		setError(null);
		setToken(null);
		try {
			setToken(await createBankLinkToken(purpose, baseUrl));
		} catch (err) {
			setError(errorMessage(err));
		}
	};

	useEffect(() => {
		if (!open) {
			setToken(null);
			setError(null);
			return;
		}
		void requestToken();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, purpose]);

	// Poll while open: the server state is the truth, postMessage just closes
	// the modal faster.
	const { data: status } = useQuery({
		...bankLinkQueryOptions(baseUrl),
		refetchInterval: open ? 5000 : false,
		refetchIntervalInBackground: false,
	});

	const finish = async () => {
		try {
			await syncBankLink(baseUrl);
		} catch {
			// the poll above will still pick the state up
		}
		await queryClient.invalidateQueries({ queryKey: bankLinkQueryKey });
		onClose(true);
	};

	useEffect(() => {
		if (!open || !token) return;
		let allowedOrigin: string;
		try {
			allowedOrigin = new URL(token.hostedLinkUrl).origin;
		} catch {
			return;
		}
		const onMessage = (e: MessageEvent) => {
			if (e.origin !== allowedOrigin) return;
			const data = e.data as { event?: string } | null;
			if (!data?.event) return;
			if (data.event === "BANKHUB_CLOSE_LINK") {
				onClose(false);
				return;
			}
			if (data.event.startsWith("FINISHED_")) {
				void finish();
				return;
			}
			if (
				data.event === "BANKHUB_TOKEN_EXPIRED" ||
				data.event === "BANKHUB_SESSION_EXPIRED"
			) {
				setToken(null);
				setError("Phiên liên kết đã hết hạn. Bấm Thử lại.");
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, token]);

	// Server-reported linked state closes the modal even without postMessage.
	useEffect(() => {
		if (open && status?.status === "linked") void finish();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, status?.status]);

	return (
		<Modal
			open={open}
			onClose={() => onClose(token !== null)}
			title="Liên kết tài khoản ngân hàng"
			footer={
				<div className="flex w-full flex-col gap-2">
					{error && (
						<div className="flex items-center justify-between gap-3">
							<span className="text-danger text-sm">{error}</span>
							<Button
								variant="secondary"
								size="sm"
								onClick={() => void requestToken()}
							>
								Thử lại
							</Button>
						</div>
					)}
					<p className="text-muted-fg text-xs">
						Cửa sổ liên kết do SePay Bank Hub vận hành. TeacherOS không lưu mật
						khẩu ngân hàng của bạn.
					</p>
				</div>
			}
		>
			{token ? (
				<iframe
					src={token.hostedLinkUrl}
					title="Liên kết tài khoản ngân hàng qua SePay Bank Hub"
					className="h-[560px] w-full rounded-md border border-border-line"
					allow="clipboard-write"
				/>
			) : (
				<div className="flex h-56 items-center justify-center text-muted-fg text-sm">
					{error
						? "Không mở được cửa sổ liên kết."
						: "Đang mở cửa sổ liên kết…"}
				</div>
			)}
		</Modal>
	);
}
