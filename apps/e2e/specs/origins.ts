/**
 * Origins cho seed API + Origin header — cùng nguồn env với playwright
 * config (E2E_API_PORT/E2E_WEB_PORT) để e2e chạy được song song với dev
 * server đang chiếm 8000/8001; mặc định giữ nguyên như CI.
 */
export const API_ORIGIN = `http://localhost:${process.env.E2E_API_PORT ?? 8000}`;
export const WEB_ORIGIN = `http://localhost:${process.env.E2E_WEB_PORT ?? 8001}`;
