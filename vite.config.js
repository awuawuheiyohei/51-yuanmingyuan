import { defineConfig } from 'vite';

/**
 * Vite 开发服务器配置
 *
 * ## 为什么必须绑 127.0.0.1
 *
 * vite 默认只监听 **IPv6 的 `::1`**，于是：
 *   · `http://localhost:5180` ✅（浏览器回落到 IPv6）
 *   · `http://127.0.0.1:5180` ❌ **连接被拒**（IPv4 上没人监听）
 *
 * 实际用起来很容易踩：浏览器收藏夹里存的是 `127.0.0.1:5180`，
 * 结果打不开，而 `localhost` 却是好的。
 *
 * 这里显式绑 **IPv4 的 `127.0.0.1`**：
 *   · `127.0.0.1:5180` ✅
 *   · `localhost:5180` ✅（系统会回落到 IPv4）
 *   · 局域网访问 ✗（**不**对外暴露端口）
 */
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
