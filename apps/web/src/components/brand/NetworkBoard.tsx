"use client";

import { useEffect, useRef } from "react";
import { Board } from "@/lib/brand/board";

const stations = [
  { id: "text", name: "Text", x: .23, y: .3 },
  { id: "search", name: "Search", x: .51, y: .24 },
  { id: "media", name: "Media", x: .77, y: .38 },
  { id: "storage", name: "Storage", x: .66, y: .54 },
  { id: "code", name: "Code", x: .31, y: .63 },
  { id: "3d", name: "3D", x: .84, y: .75 },
];

export default function NetworkBoard() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current!;
    if (!Board.supported()) return;
    let board: Board | undefined;
    let frame = 0;
    let disposed = false;
    let visible = true;
    const visibility = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; });
    visibility.observe(element);
    let observer: ResizeObserver | undefined;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const image = new Image();
    image.src = "/brand/world-mask.svg";
    void image.decode().then(() => {
      if (disposed) return;
      try { board = new Board(element, image, stations); } catch { return; }
      board.loader = 0;
      board.reveal = 1;
      let last = performance.now();
      let nextPacket = last + 800;
      let index = 0;
      const tick = (now: number) => {
        if (!board || disposed) return;
        const dt = Math.min(.05, (now - last) / 1000);
        last = now;
        if (!document.hidden && visible) {
          if (!motion.matches && now > nextPacket) {
            void board.send(stations[index % stations.length].id, stations[(index + 2) % stations.length].id, { colour: index % 2 ? 1 : 2, duration: 2.5 });
            index++;
            nextPacket = now + 1400;
          }
          board.render(motion.matches ? 0 : dt);
        }
        frame = requestAnimationFrame(tick);
      };
      const layout = () => {
        if (!board || disposed || !element.clientWidth || !element.clientHeight) return;
        board.resize();
      };
      observer = new ResizeObserver(layout);
      observer.observe(element);
      void document.fonts.ready.then(layout);
      frame = requestAnimationFrame(tick);
    }).catch(() => {});
    return () => { disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); visibility.disconnect(); board?.dispose(); };
  }, []);
  return <canvas ref={canvas} className="network-board" aria-hidden="true" />;
}
