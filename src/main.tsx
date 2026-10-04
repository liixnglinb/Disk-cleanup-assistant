import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import "./styles/components.css";
// 2026-10-03：不再引入 voyra-ui.css。它是一套用 :root 重定义令牌的跨产品皮肤
// （--primary:#6650a4、--nav-rail-w:240px、--fs-base:14px…），会覆盖 global.css 的
// 方案二令牌，使重构"写了但不生效"。其中不依赖 --vr-* 且本软件在用的布局修正
// 已迁入 components.css（见该文件末尾的迁移说明块）。

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
