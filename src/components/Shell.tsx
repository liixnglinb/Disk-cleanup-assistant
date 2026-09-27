import React from "react";
import TitleBar from "./TitleBar";
import NavRail from "./NavRail";
import { useScan } from "../store/ScanContext";

export default function Shell({ children }: { children: React.ReactNode }) {
  const { status } = useScan();
  const running = status?.status === "running" || status?.status === "starting";

  return (
    <div className={`app ${running ? "is-scanning" : ""}`}>
      <TitleBar />
      <div className="workspace">
        <NavRail />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
