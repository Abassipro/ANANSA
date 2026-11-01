import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const appOrigin = loadEnv(mode, projectRoot, "APP_").APP_ORIGIN || "http://127.0.0.1:5173";
  const allowedHost = new URL(appOrigin).hostname;

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      allowedHosts: [allowedHost],
      proxy: {
        "/api": "http://127.0.0.1:8787",
      },
    },
    build: {
      target: "es2022",
    },
  };
});
