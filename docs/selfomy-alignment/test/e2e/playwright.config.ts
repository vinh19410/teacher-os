import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  // Mặc định 0; đặt E2E_RETRIES=2 khi chạy trên dev stack hay chập chờn (test flaky sau retry vẫn tính PASS).
  retries: Number(process.env.E2E_RETRIES ?? 0),
  use: {
    baseURL: process.env["SELFOMY_ALIGNMENT_BASE"] || "http://localhost:3000",
    trace: 'on-first-retry',
  },
  reporter: [
    ['json', { outputFile: 'report.json' }],
    ['list'],
  ],
});
