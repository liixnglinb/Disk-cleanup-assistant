import React from "react";
import Icon from "./icons";
import { SECTIONS, useWorkspace } from "../store/workspace";

export default function NavRail() {
  const { section, setSection } = useWorkspace();
  return (
    <nav className="nav-rail" aria-label="主导航">
      {SECTIONS.map((s) => (
        <button
          key={s.key}
          className={`rail-item ${section === s.key ? "active" : ""}`}
          onClick={() => setSection(s.key)}
          title={s.label}
          aria-current={section === s.key ? "page" : undefined}
        >
          <Icon name={s.icon} size={20} />
          <span className="rail-text">
            <span className="rail-label">{s.label}</span>
            <span className="rail-desc">{s.desc}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
