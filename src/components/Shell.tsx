import React from "react";
import TitleBar from "./TitleBar";
import NavRail from "./NavRail";
import ScanStateBanner from "./ScanStateBanner";
import UpdateBox from "./UpdateBox";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <TitleBar />
      <div className="workspace">
        <NavRail />
        <main className="content" id="disk-main-content" tabIndex={-1}><ScanStateBanner />{children}</main>
      </div>
      {/* 更新胶囊挂在 Shell 而不是内容区：.content 是 overflow:auto 的滚动容器，
          放进去会被裁切，且滚动时胶囊跟着跑。z-index 95 —— 高于内容区、低于弹窗 100。 */}
      <UpdateBox />
    </div>
  );
}
