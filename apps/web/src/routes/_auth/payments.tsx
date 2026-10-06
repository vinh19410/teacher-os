import { createFileRoute } from "@tanstack/react-router";
import { BankLinkPanel } from "@/components/payments/bank-link-panel";
import { PageHead } from "@/components/ui/page-head";

export const Route = createFileRoute("/_auth/payments")({
	component: PaymentsRoute,
});

/**
 * Trang riêng "Nhận học phí" (#320) — thay thế tab Cài đặt đã gỡ theo
 * #321/#324. Chứa panel liên kết tài khoản ngân hàng qua SePay Bank Hub.
 */
function PaymentsRoute() {
	return (
		<div>
			<PageHead
				title="Nhận học phí"
				lead="Liên kết tài khoản ngân hàng để tạo mã QR — hệ thống tự xác nhận khi phụ huynh chuyển khoản."
			/>
			<BankLinkPanel />
		</div>
	);
}
