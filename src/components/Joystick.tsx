"use client";

import { useRef, useState } from "react";

const BASE_RADIUS = 48;
const KNOB_RADIUS = 22;
const MAX_KNOB_OFFSET = BASE_RADIUS - KNOB_RADIUS;

// Reports a normalized direction vector (-1..1 per axis) continuously while
// held, and (0, 0) on release. Pan speed/physics live in the parent —
// this component only knows about angle + how far it's been pushed.
export default function Joystick({ onVector }: { onVector: (dx: number, dy: number) => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });

  const updateFromPointer = (clientX: number, clientY: number) => {
    const rect = baseRef.current!.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_KNOB_OFFSET) {
      dx = (dx / dist) * MAX_KNOB_OFFSET;
      dy = (dy / dist) * MAX_KNOB_OFFSET;
    }
    setKnobPos({ x: dx, y: dy });
    onVector(dx / MAX_KNOB_OFFSET, dy / MAX_KNOB_OFFSET);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    active.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore — capture is a nicety, not required for correctness here
    }
    updateFromPointer(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const endDrag = () => {
    if (!active.current) return;
    active.current = false;
    setKnobPos({ x: 0, y: 0 });
    onVector(0, 0);
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="relative w-24 h-24 rounded-full bg-black/20 dark:bg-white/10 backdrop-blur border border-black/10 dark:border-white/20 touch-none select-none"
      aria-label="Pan gallery"
    >
      <div
        className="absolute top-1/2 left-1/2 w-11 h-11 rounded-full bg-foreground/80 shadow-lg pointer-events-none"
        style={{
          transform: `translate(-50%, -50%) translate(${knobPos.x}px, ${knobPos.y}px)`,
          transition: active.current ? "none" : "transform 150ms ease-out",
        }}
      />
    </div>
  );
}
