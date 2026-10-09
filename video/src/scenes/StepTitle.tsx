import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { C, fontFamily } from "../theme";

/** En-tête commun aux étapes : numéro rouge + titre. */
export const StepTitle: React.FC<{ n: string; title: string }> = ({ n, title }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 140, top: 110, display: "flex", alignItems: "baseline", gap: 32, fontFamily }}>
      <Interactive.Div
        name="Numéro"
        style={{
          fontSize: 150,
          fontWeight: 800,
          color: C.accent,
          lineHeight: 1,
          translate: interpolate(frame, [0, 18], ["0px 80px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {n}
      </Interactive.Div>
      <Interactive.Div
        name="Titre"
        style={{
          fontSize: 96,
          fontWeight: 800,
          color: C.ink,
          lineHeight: 1,
          translate: interpolate(frame, [4, 22], ["60px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          opacity: interpolate(frame, [4, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        {title}
      </Interactive.Div>
    </div>
  );
};
