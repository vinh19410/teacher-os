import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BankHubLinkModal } from "@/components/modals/bank-hub-link-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/section-label";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";
import {
	bankLinkQueryKey,
	bankLinkQueryOptions,
	syncBankLink,
} from "@/lib/repos/bank-link";

export type BankLinkPurpose = "link" | "unlink" | "reactivate";

/**
 * Trang Hồ sơ (`/profile`, #338): trạng thái liên kết tài khoản ngân hàng qua
 * SePay Bank Hub (#320). Bảng trạng thái theo phase-02 plan: none → modal
 * "Liên kết", inactive (ngân hàng chủ động, OCB/MSB/KLB/TPB) → "Khôi phục",
 * linked → "Huỷ liên kết".
 */
export function BankLinkPanel() {
	const baseUrl = getApiBaseUrl();
	const queryClient = useQueryClient();
	const { data: status, isLoading } = useQuery(bankLinkQueryOptions(baseUrl));
	const [modalPurpose, setModalPurpose] = useState<BankLinkPurpose | null>(
		null,
	);

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: bankLinkQueryKey });

	return (
		<Card variant="white">
			<SectionLabel>Nhận học phí qua chuyển khoản</SectionLabel>
			{isLoading ? (
				<p className="text-muted-fg text-sm">Đang tải trạng thái…</p>
			) : !status?.enabled ? (
				<div className="flex flex-col gap-3">
					<p className="text-muted-fg text-sm">
						Tính năng chưa được bật cho tài khoản này.
					</p>
					<Badge variant="muted">Chưa bật</Badge>
				</div>
			) : status.status === "linked" ? (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<div className="flex items-center gap-2">
							<strong>{status.brandName || "Ngân hàng"}</strong>
							<Badge variant="accent">Đã liên kết</Badge>
						</div>
						<span className="font-mono text-meta text-xs">
							{status.accountNumberMasked}
							{status.holderName ? ` · ${status.holderName}` : ""}
						</span>
						{status.linkedAt && (
							<span className="text-muted-fg text-xs">
								Liên kết {new Date(status.linkedAt).toLocaleString("vi-VN")}
							</span>
						)}
					</div>
					<Button
						variant="secondary"
						size="sm"
						className="self-start"
						onClick={() => setModalPurpose("unlink")}
					>
						Huỷ liên kết
					</Button>
				</div>
			) : (
				<div className="flex flex-col gap-3">
					<p className="text-muted-fg text-sm">
						{status.status === "inactive"
							? "Tài khoản đang bị vô hiệu hoá phía ngân hàng. Khôi phục để tiếp tục nhận học phí."
							: "Liên kết tài khoản ngân hàng để tạo mã QR nhận học phí — hệ thống tự xác nhận khi phụ huynh chuyển khoản."}
					</p>
					<Button
						variant="primary"
						size="sm"
						className="self-start"
						onClick={() =>
							setModalPurpose(
								status.status === "inactive" ? "reactivate" : "link",
							)
						}
					>
						{status.status === "inactive"
							? "Khôi phục liên kết"
							: "Liên kết tài khoản ngân hàng"}
					</Button>
				</div>
			)}
			<BankHubLinkModal
				open={modalPurpose !== null}
				purpose={modalPurpose ?? "link"}
				onClose={(changed) => {
					setModalPurpose(null);
					if (!changed) return;
					// FINISHED postMessage is not guaranteed: SePay can refuse
					// in-page (e.g. an already-linked account) or close silently.
					// Pull the server truth once whenever the hosted flow was
					// entered, then let the query refetch.
					void syncBankLink(baseUrl)
						.catch(() => undefined)
						.then(refresh);
				}}
			/>
		</Card>
	);
}
