export function NotFoundPage() {
	return (
		<div className="flex min-h-svh flex-col bg-[var(--bg,#ffffff)] text-fg">
			{/* Top bar with logo */}
			<header className="flex h-16 items-center justify-between border-line-soft border-b px-6 lg:px-12">
				<a
					href="/"
					className="inline-flex items-center gap-3 transition-opacity hover:opacity-90"
					aria-label="Teacher OS - Trang chủ"
				>
					<span className="inline-flex items-center gap-3">
						<svg
							viewBox="0 0 34 34"
							aria-hidden="true"
							className="block h-[32px] w-[32px]"
						>
							<rect width="34" height="34" rx="9" fill="var(--accent)" />
							<path
								d="M10 11.5h14M17 11.5v13M13 24.5h8"
								stroke="#fff"
								strokeWidth="2.2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
						<span className="font-display font-semibold text-[17px] tracking-[-0.01em]">
							Teacher OS
						</span>
					</span>
				</a>
			</header>

			{/* Main 404 content */}
			<main className="flex flex-1 items-center justify-center p-6">
				<div className="mx-auto max-w-md text-center">
					<div className="mb-4 inline-flex items-center justify-center rounded-full bg-[var(--accent-soft,#eff6ff)] px-4 py-1.5 font-display font-semibold text-accent text-sm tracking-wide">
						Lỗi 404 · Không tìm thấy trang
					</div>
					<h1 className="font-bold font-display text-5xl text-fg tracking-tight sm:text-6xl">
						404
					</h1>
					<h2 className="mt-3 font-display font-semibold text-2xl text-fg tracking-tight">
						Trang không tồn tại
					</h2>
					<p className="mt-3 text-muted-fg text-sm leading-relaxed sm:text-base">
						Đường dẫn bạn truy cập không tồn tại hoặc đã được chuyển sang địa
						chỉ khác. Vui lòng kiểm tra lại URL.
					</p>

					<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
						<a
							href="/dashboard"
							className="inline-flex items-center gap-2 rounded-full bg-hot px-6 py-2.5 font-medium text-accent-on text-sm transition hover:bg-accent-hover active:scale-[0.98]"
						>
							Về bảng điều khiển
						</a>
						<a
							href="/login"
							className="inline-flex items-center gap-2 rounded-full border border-line bg-transparent px-6 py-2.5 font-medium text-fg text-sm transition hover:border-fg active:scale-[0.98]"
						>
							Đăng nhập
						</a>
					</div>
				</div>
			</main>

			{/* Footer */}
			<footer className="border-line-soft border-t py-4 text-center text-muted-fg text-xs">
				© 2022 Teacher OS · Quản lý lớp gia sư 1:1
			</footer>
		</div>
	);
}

export default NotFoundPage;
