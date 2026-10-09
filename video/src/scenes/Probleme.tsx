import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { C, enter, fontFamily } from "../theme";

const LINES = [
  "Un SFCR par compagnie, chaque année.",
  "Des centaines de pages en PDF, parfois scannées.",
  "Des unités et des devises qui changent.",
];

export const Probleme: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Problème" style={{ backgroundColor: C.bg, fontFamily, padding: "0 140px", justifyContent: "center", gap: 36 }}>
      {LINES.map((l, i) => {
        const p = enter(frame, 8 + i * 30);
        return (
          <div key={l} style={{ fontSize: 64, fontWeight: 600, color: C.ink, opacity: p, translate: `${(1 - p) * 80}px 0px`, display: "flex", gap: 28, alignItems: "center" }}>
            <span style={{ width: 22, height: 22, backgroundColor: C.accent, flexShrink: 0 }} />
            {l}
          </div>
        );
      })}
      <Interactive.Div
        name="Réponse"
        style={{
          marginTop: 40,
          alignSelf: "flex-start",
          backgroundColor: "#ec3013",
          color: "#f3f2f2",
          fontSize: 110,
          fontWeight: 800,
          padding: "10px 40px",
          rotate: interpolate(frame, [120, 136], ["-8deg", "-2deg"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [120, 136], [2.2, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
          opacity: interpolate(frame, [120, 126], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Un seul outil.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
