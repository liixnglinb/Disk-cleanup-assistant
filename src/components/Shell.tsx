import React from "react";
import TitleBar from "./TitleBar";
import NavRail from "./NavRail";
import ScanStateBanner from "./ScanStateBanner";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <TitleBar />
      <div className="workspace">
        <NavRail />
        <main className="content" id="disk-main-content" tabIndex={-1}><ScanStateBanner />{children}</main>
      </div>
    </div>
  );
}
