import { useEffect, useRef, useState } from "react";

/**
 * 流体数字计数器：值变化时从旧值滚到新值。
 *
 * 为什么不用 CSS transition：数字是文本，无法 transition，只能逐帧改文本内容。
 * 方案二要求 Hero 数字"配流体动画计数器"，这里用 requestAnimationFrame +
 * easeOutExpo 曲线（起步快、收尾慢），比线性插值更贴合"液体注入"的观感。
 *
 * 性能约束：Hero 每秒最多 60 次 setState，且只在数值变化期间运行；
 * 组件卸载或目标值再次变化时必须 cancelAnimationFrame，否则会对已卸载组件
 * 持续写 state（React 18 虽不再告警，但会白烧一个动画帧的 CPU）。
 *
 * reduced-motion：不做任何插值，直接跳到目标值。
 */
export function useFluidNumber(target: number, durationMs = 900): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || durationMs <= 0) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    // 目标没变就别启动动画：扫描进度每 400ms 推一次，
    // 每次都重新播一遍会让数字永远追不上、剧烈抖动。
    if (from === target) return;

    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      // easeOutExpo：p=0 时导数最大，末尾无限接近 1，收尾平滑无顿挫
      const eased = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
      const v = from + (target - from) * eased;
      setDisplay(v);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      // 停在当前位置而不是 from：中途改筛选条件时，从当前值续接比跳回旧值自然
      fromRef.current = display;
      rafRef.current = null;
    };
    // display 故意不进依赖：它是被本 effect 写出的量，进依赖会自激成死循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return display;
}
