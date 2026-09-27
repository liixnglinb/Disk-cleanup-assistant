import React from "react";
import TitleBar from "./TitleBar";
import NavRail from "./NavRail";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <TitleBar />
      <div className="workspace">
        <NavRail />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
