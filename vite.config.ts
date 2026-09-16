import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [react()],
  base: "./",
  define: {
    // 前端界面的版本号统一取自 package.json，避免多处硬编码不同步
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: { port: 5173, strictPort: false },
  build: { outDir: "dist", emptyOutDir: true },
});
