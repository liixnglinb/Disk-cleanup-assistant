import React, { createContext, useCallback, useContext, useState } from "react";

export interface ToastItem {
  id: number;
  kind: "ok" | "error" | "info";
  message: string;
  icon?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastCtx {
  push: (t: Omit<ToastItem, "id">) => void;
}

const Ctx = createContext<ToastCtx | null>(null);
let seq = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const id = seq++;
    setItems((prev) => [...prev, { ...t, id }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, 3500);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="toast-wrap">
        {items.map((t) => (
          <div className={`toast ${t.kind}`} key={t.id}>
            <span className={`toast-dot ${t.kind}`} />
            <span>{t.message}</span>
            {t.action && (
              <span className="toast-actions">
                <button className="btn small primary" onClick={t.action.onClick}>{t.action.label}</button>
              </span>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}