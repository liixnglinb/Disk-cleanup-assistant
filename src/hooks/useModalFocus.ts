import { useEffect, useRef, type RefObject } from 'react';

const stack: HTMLElement[] = [];
const focusable = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

/** Nested modal ownership, safe initial focus and restoration; no filesystem effects. */
export function useModalFocus(ref: RefObject<HTMLElement>, open: boolean, onClose: () => void, busy = false) {
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose; busyRef.current = busy;
  useEffect(() => {
    const node = ref.current;
    if (!open || !node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stack.push(node);
    const items = () => [...node.querySelectorAll<HTMLElement>(focusable)].filter((el) => el.getClientRects().length && !el.closest('[hidden]'));
    const initial = node.querySelector<HTMLElement>('[data-safe-focus]') || items()[0] || node;
    initial.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== node) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key === 'Tab') {
        const targets = items();
        const first = targets[0], last = targets[targets.length - 1];
        if (!first) { event.preventDefault(); node.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const index = stack.lastIndexOf(node); if (index >= 0) stack.splice(index, 1);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [ref, open]);
}
