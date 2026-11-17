import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": {
          target: env.API_PROXY_TARGET || "http://127.0.0.1:5000",
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on("error", (_err, _req, res) => {
              if (res && !res.headersSent && typeof res.writeHead === "function") {
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, message: "Backend is temporarily starting up. Please retry." }));
              }
            });
          },
        },
      },
    },
  };
})
