import { defineConfig } from 'vitest/config';
export default defineConfig({server:{port:5173,proxy:{'/api':'http://127.0.0.1:3100'}},build:{outDir:'dist'},test:{include:['tests/**/*.test.ts','tests/**/*.test.tsx']}});
