import { useMemo, useRef, useState } from "react";

export interface VirtualListProps {
  itemCount: number;
  rowHeight: number;
  viewportHeight: number;
  overscan?: number;
}

export interface VirtualListRange {
  start: number;
  end: number;
  totalHeight: number;
  offsetY: number;
  onScroll: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}

/** Fixed-row virtual scrolling window used by the file table. */
export function useVirtualList({ itemCount, rowHeight, viewportHeight, overscan = 8 }: VirtualListProps): VirtualListRange {
  const [scrollTop, setScrollTop] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const onScroll = () => {
    const el = ref.current;
    if (el) setScrollTop(el.scrollTop);
  };
  const range = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(itemCount, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
    return {
      start,
      end,
      totalHeight: itemCount * rowHeight,
      offsetY: start * rowHeight,
      onScroll,
      scrollRef: ref as React.RefObject<HTMLDivElement>,
    };
  }, [scrollTop, itemCount, rowHeight, viewportHeight, overscan]);
  return range;
}