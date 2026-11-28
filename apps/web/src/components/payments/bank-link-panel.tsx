import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PAYMENT_CODE_PREFIX } from "@teacher-os/api/lib/payment-code";
import {
	findVietnamBankByBin,
	normalizeBankAccountNumber,
	VIETNAM_BANKS,
} from "@teacher-os/api/lib/vietnam-banks";
import {
	buildTransferMemo,
	formatTkpVaPrefix,
	normalizeVaCode,
} from "@teacher-os/api/lib/vietqr";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { SectionLabel } from "@/components/ui/section-label";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";
import {
	BankLinkRequestError,
	bankLinkQueryKey,
	bankLinkQueryOptions,
	removeBankLink,
	saveBankLink,
} from "@/lib/repos/bank-link";

function saveErrorMessage(err: unknown): string {
	if (err instanceof BankLinkRequestError) {
		switch (err.code) {
			case "BANK_LINK_ACCOUNT_ALREADY_IN_USE":
				return "Số tài khoản này đang được dùng bởi tổ chức khác.";
			case "SEPAY_DISABLED":
				return "Tính năng SePay chưa được bật.";
			case "BANK_LINK_INVALID_BANK":
				return "Ngân hàng không hợp lệ.";
			default:
				break;
		}
	}
	return "Không lưu được tài khoản ngân hàng. Vui lòng thử lại.";
}

function removeErrorMessage(err: unknown): string {
	if (err instanceof BankLinkRequestError) {
		switch (err.code) {
			case "SEPAY_DISABLED":
				return "Tính năng SePay chưa được bật.";
			case "BANK_LINK_NO_LINKED_ACCOUNT":
				return "Chưa có tài khoản nào để gỡ.";
			default:
				break;
		}
	}
	return "Không gỡ được tài khoản ngân hàng. Vui lòng thử lại.";
}

/**
 * Trang Hồ sơ (`/profile`, #338): cấu hình tài khoản ngân hàng nhận học phí
 * qua SePay cá nhân thường (#320).
 */
export function BankLinkPanel() {
	const baseUrl = getApiBaseUrl();
	const queryClient = useQueryClient();
	const { data: status, isLoading } = useQuery(bankLinkQueryOptions(baseUrl));

	const [editing, setEditing] = useState(false);
	const [confirmRemove, setConfirmRemove] = useState(false);
	const [bankBin, setBankBin] = useState("");
	const [accountNumber, setAccountNumber] = useState("");
	const [vaCode, setVaCode] = useState("");
	const [holderName, setHolderName] = useState("");
	const [formError, setFormError] = useState<string | null>(null);

	useEffect(() => {
		if (status?.status !== "linked") {
			setConfirmRemove(false);
		}
	}, [status]);

	const syncFormFromStatus = () => {
		if (status?.status !== "linked") {
			setBankBin("");
			setAccountNumber("");
			setVaCode("");
			setHolderName("");
			return;
		}
		setBankBin(status.bankBin);
		setAccountNumber(status.accountNumber);
		setVaCode(status.vaCode);
		setHolderName(status.holderName);
	};

	const startEditing = () => {
		syncFormFromStatus();
		setFormError(null);
		setConfirmRemove(false);
		setEditing(true);
	};

	const saveMutation = useMutation({
		mutationFn: () =>
			saveBankLink(
				{
					bankBin,
					accountNumber: normalizeBankAccountNumber(accountNumber),
					vaCode: normalizeVaCode(vaCode),
					holderName: holderName.trim(),
				},
				baseUrl,
			),
		onSuccess: (next) => {
			queryClient.setQueryData(bankLinkQueryKey, next);
			void queryClient.invalidateQueries({ queryKey: bankLinkQueryKey });
			setEditing(false);
			setFormError(null);
			toast.success("Đã lưu tài khoản nhận học phí");
		},
		onError: (err) => {
			setFormError(saveErrorMessage(err));
		},
	});

	const removeMutation = useMutation({
		mutationFn: () => removeBankLink(baseUrl),
		onSuccess: (next) => {
			queryClient.setQueryData(bankLinkQueryKey, next);
			void queryClient.invalidateQueries({ queryKey: bankLinkQueryKey });
			setConfirmRemove(false);
			setEditing(false);
			setBankBin("");
			setAccountNumber("");
			setVaCode("");
			setHolderName("");
			setFormError(null);
			toast.success("Đã gỡ tài khoản ngân hàng");
		},
		onError: (err) => {
			toast.error(removeErrorMessage(err));
		},
	});

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		if (saveMutation.isPending) return;
		setFormError(null);

		if (!findVietnamBankByBin(bankBin)) {
			setFormError("Vui lòng chọn ngân hàng nhận chuyển khoản.");
			return;
		}
		const normalizedAcc = normalizeBankAccountNumber(accountNumber);
		if (!/^[A-Za-z0-9]{4,30}$/.test(normalizedAcc)) {
			setFormError("Số tài khoản phải gồm 4–30 ký tự chữ hoặc số.");
			return;
		}
		const normalizedVa = normalizeVaCode(vaCode);
		if (normalizedVa && !/^[A-Z0-9]{2,20}$/.test(normalizedVa)) {
			setFormError("Mã VA phải gồm 2–20 ký tự chữ hoặc số (VD: MMY).");
			return;
		}
		const trimmedHolder = holderName.trim();
		if (trimmedHolder.length < 2 || trimmedHolder.length > 100) {
			setFormError("Tên chủ tài khoản phải từ 2 đến 100 ký tự.");
			return;
		}

		saveMutation.mutate();
	};

	const selectedBank = findVietnamBankByBin(bankBin);
	const normalizedVaPreview = normalizeVaCode(vaCode);
	const isLinked = status?.status === "linked";
	const showForm = Boolean(status?.enabled && (!isLinked || editing));

	return (
		<Card variant="white" className="flex flex-col gap-4">
			<div>
				<div className="mb-3 font-medium text-primary text-sm">SePay</div>
				<SectionLabel>Nhận học phí qua chuyển khoản</SectionLabel>
			</div>

			{isLoading ? (
				<p className="text-muted-foreground text-sm">Đang tải trạng thái…</p>
			) : !status?.enabled ? (
				<div className="flex flex-col gap-3">
					<p className="text-muted-foreground text-sm">
						Tính năng chưa được bật cho tài khoản này.
					</p>
					<Badge variant="muted">Chưa bật</Badge>
				</div>
			) : showForm ? (
				<form
					noValidate
					onSubmit={handleSubmit}
					className="flex flex-col gap-4"
				>
					<p className="text-muted-foreground text-sm">
						Nhập tài khoản ngân hàng đã liên kết trên my.sepay.vn để tạo mã QR
						thu học phí và tự động xác nhận chuyển khoản.
					</p>
					<Field label="Ngân hàng *">
						<Select
							value={bankBin}
							onChange={(e) => setBankBin(e.target.value)}
							data-testid="bank-bin-select"
						>
							<option value="">— Chọn ngân hàng —</option>
							{VIETNAM_BANKS.map((bank) => (
								<option key={bank.bin} value={bank.bin}>
									{bank.shortName} — {bank.name}
								</option>
							))}
						</Select>
					</Field>
					{selectedBank?.note && (
						<p className="rounded-md bg-warn-soft px-3 py-2 text-xs">
							{selectedBank.note}
						</p>
					)}
					<Field
						label="Số tài khoản *"
						help="Nhập số tài khoản gốc (hoặc số VA độc lập nếu ngân hàng cấp riêng)."
					>
						<Input
							value={accountNumber}
							onChange={(e) => setAccountNumber(e.target.value)}
							placeholder="VD: 0123456789"
							data-testid="bank-account-number"
						/>
					</Field>
					<Field
						label="Mã VA theo nội dung (TKP, tùy chọn)"
						help="Chỉ nhập nếu bạn dùng Tài khoản ảo theo nội dung trên my.sepay.vn (VD: MMY → nội dung chuyển khoản sẽ tự thêm TKPMMY). Để trống nếu nhận thẳng vào số tài khoản."
					>
						<Input
							value={vaCode}
							onChange={(e) => setVaCode(e.target.value)}
							placeholder="VD: MMY"
							data-testid="bank-va-code"
						/>
					</Field>
					{normalizedVaPreview && (
						<p
							className="text-muted-foreground text-xs"
							data-testid="bank-va-preview"
						>
							Nội dung QR mẫu:{" "}
							<strong className="font-mono text-foreground">
								{buildTransferMemo({
									code: `${PAYMENT_CODE_PREFIX}7K2M9QXA`,
									bankBin,
									vaCode: normalizedVaPreview,
								})}
							</strong>
						</p>
					)}
					<Field label="Chủ tài khoản *">
						<Input
							value={holderName}
							onChange={(e) => setHolderName(e.target.value)}
							placeholder="VD: NGUYEN THI MY"
							data-testid="bank-holder-name"
						/>
					</Field>
					{formError && (
						<p role="alert" className="text-destructive text-xs">
							{formError}
						</p>
					)}
					<div className="flex flex-wrap gap-2">
						<Button
							variant="primary"
							size="sm"
							type="submit"
							disabled={saveMutation.isPending}
							data-testid="bank-link-submit"
						>
							{saveMutation.isPending ? "Đang lưu…" : "Lưu tài khoản"}
						</Button>
						{isLinked && (
							<Button
								variant="ghost"
								size="sm"
								type="button"
								disabled={saveMutation.isPending}
								onClick={() => {
									setEditing(false);
									setFormError(null);
								}}
							>
								Hủy
							</Button>
						)}
					</div>
				</form>
			) : (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<div className="flex flex-wrap items-center gap-2">
							<strong>{status.brandName || "Ngân hàng"}</strong>
							<Badge variant="accent">Đã liên kết</Badge>
							{status.vaCode && (
								<Badge variant="muted">
									VA: {formatTkpVaPrefix(status.vaCode)}
								</Badge>
							)}
						</div>
						<span className="text-muted-foreground text-xs">
							{status.accountNumberMasked}
							{status.holderName ? ` · ${status.holderName}` : ""}
						</span>
						{status.linkedAt && (
							<span className="text-muted-foreground text-xs">
								Liên kết {new Date(status.linkedAt).toLocaleString("vi-VN")}
							</span>
						)}
					</div>
					{confirmRemove ? (
						<div className="flex flex-col gap-2">
							<div className="flex flex-wrap gap-2">
								<Button
									variant="destructive"
									size="sm"
									disabled={removeMutation.isPending}
									onClick={() => removeMutation.mutate()}
								>
									{removeMutation.isPending ? "Đang gỡ…" : "Xác nhận gỡ"}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={removeMutation.isPending}
									onClick={() => setConfirmRemove(false)}
								>
									Không
								</Button>
							</div>
							<p className="text-warn text-xs">
								Sau khi gỡ, phụ huynh sẽ không thấy mã QR chuyển khoản cho đến
								khi bạn cấu hình lại tài khoản.
							</p>
						</div>
					) : (
						<div className="flex flex-wrap gap-2">
							<Button variant="secondary" size="sm" onClick={startEditing}>
								Chỉnh sửa
							</Button>
							<Button
								variant="destructive"
								size="sm"
								onClick={() => setConfirmRemove(true)}
							>
								Gỡ tài khoản
							</Button>
						</div>
					)}
				</div>
			)}
		</Card>
	);
}
