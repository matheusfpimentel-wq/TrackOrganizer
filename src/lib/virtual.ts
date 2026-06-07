/** Simple fixed-height row virtualization math (no deps). */

export interface VirtualWindow {
  start: number;
  end: number;
  topPad: number;
  bottomPad: number;
}

/** Compute the row range to render for a scroll position + viewport. */
export function windowRange(
  scrollTop: number,
  viewportH: number,
  rowH: number,
  count: number,
  overscan = 10,
): VirtualWindow {
  if (count === 0 || viewportH <= 0 || rowH <= 0) {
    return { start: 0, end: count, topPad: 0, bottomPad: 0 };
  }
  const start = Math.max(0, Math.floor(scrollTop / rowH) - overscan);
  const end = Math.min(count, Math.ceil((scrollTop + viewportH) / rowH) + overscan);
  return {
    start,
    end,
    topPad: start * rowH,
    bottomPad: Math.max(0, (count - end) * rowH),
  };
}
