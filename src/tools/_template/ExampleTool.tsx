import React from "react";

/**
 * 新工具模板（前端侧）。
 *
 * 1. 把本目录 _template 复制为 src/tools/<your_tool_id>/
 * 2. 实现你的界面
 * 3. 在 src/tools/registry.tsx 登记
 */
export default function ExampleTool() {
  return (
    <div className="panel">
      <h2>
        <span className="tool-icon">🧰</span> 新工具
      </h2>
      <p className="muted">这是新工具的模板面板。把本目录复制为 src/tools/&lt;your_tool_id&gt;/ 并修改：</p>
      <ul className="muted">
        <li>界面 JSX / 组件</li>
        <li>在 src/tools/registry.tsx 里注册一个 ToolEntry</li>
        <li>对应后端 backend/tools/&lt;your_tool_id&gt;.py 提供 API</li>
      </ul>
    </div>
  );
}