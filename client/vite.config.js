import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'REACT_APP_']);
  return {
    plugins: [react()],
    // Preserve existing deployments while adopting the Vite variable name.
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || env.REACT_APP_API_URL || 'http://localhost:5000/api')
    },
    server: { port: 3000, strictPort: true, proxy: { '/api': 'http://localhost:5000' } },
    build: { outDir: 'build' },
    test: { globals: true, environment: 'jsdom', include: ['src/**/*.test.{js,jsx}'], unstubGlobals: true }
  };
});
