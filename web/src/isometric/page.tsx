import { useEffect, useRef, useState } from "preact/hooks";
import { mountGame } from "./game";

const VIEW_STYLE = { width: "100vw", height: "100dvh", overflow: "hidden", position: "relative" } as const;
const CANVAS_STYLE = { width: "100%", height: "100%", overflow: "hidden" } as const;
const CLOCK_STYLE = {
  position: "absolute",
  top: 12,
  left: 12,
  padding: "4px 8px",
  borderRadius: 4,
  background: "rgba(0, 0, 0, 0.55)",
  color: "#f2f2f2",
  font: "13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
  pointerEvents: "none",
} as const;

/** The game's clock over the canvas; hidden until the game shows a time. */
const ClockLabel = ({ label }: { label: string }) => (
  <div aria-hidden={label === ""} style={{ ...CLOCK_STYLE, display: label === "" ? "none" : "block" }}>
    {label}
  </div>
);

/** The isometric world: a full-window canvas run by `mountGame()` and its clock. */
const IsometricWorld = () => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [clockLabel, setClockLabel] = useState("");

  useEffect(() => mountGame(canvasRef.current!, { window, onClockChange: setClockLabel }).destroy, []);

  return (
    <section style={VIEW_STYLE}>
      <div ref={canvasRef} style={CANVAS_STYLE} />
      {/* Always mounted, after the canvas container: a conditional first child would make
          Preact reuse the container's element and move the canvas into the label. */}
      <ClockLabel label={clockLabel} />
    </section>
  );
};

export default IsometricWorld;
