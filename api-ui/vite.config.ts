import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * 本地联调：dev 时把 /config.js 换成「本机专用」配置，
 * 源码里的 public/config.js（生产用）一个字都不用改，打包也不受影响。
 *
 * .env.local 可配：
 *   TEY_DEV_API      API 站点源（默认 http://192.168.1.10）
 *   TEY_DEV_TOKEN    个人令牌，配了就能免登录直接看页面
 *   TEY_DEV_COVER    图片代理地址（默认本机 8899 上的 img.php 模拟版）
 */
function devConfig(opts: { token: string; coverProxy: string }): Plugin {
  return {
    name: 'tey-dev-config',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url || '').split('?')[0] !== '/config.js') return next();
        const cfg = {
          brand: 'Those',
          activeSite: 'those',
          imageMode: 'auto',
          sites: [
            {
              id: 'those',
              name: 'Those',
              apiBase: '/teyapi/v1',
              color: '#2bd9c4',
              coverProxy: opts.coverProxy,
            },
          ],
        };
        const seed = opts.token
          ? `try {
  if (!localStorage.getItem('tey.tokens')) {
    localStorage.setItem('tey.tokens', JSON.stringify({ those: ${JSON.stringify(opts.token)} }));
    localStorage.setItem('tey.sites.active', 'those');
  }
} catch (e) {}
`
          : '';
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(`window.__TEY_API__ = ${JSON.stringify(cfg, null, 2)};\n${seed}`);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const apiTarget = env.TEY_DEV_API || 'http://192.168.1.10';
  const token = env.TEY_DEV_TOKEN || '';
  const coverProxy = env.TEY_DEV_COVER || 'http://127.0.0.1:8899/img?f=0';

  return {
    plugins: [react(), devConfig({ token, coverProxy })],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    base: '/',
    build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 700 },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        // 浏览器只跟 127.0.0.1:5173 说话，跨域与 CORS 由 dev server 兜住
        '/teyapi': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/teyapi/, '/api'),
        },
      },
    },
  };
});
