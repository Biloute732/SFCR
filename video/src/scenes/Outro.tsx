import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { fontFamily } from "../theme";

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Fin" style={{ backgroundColor: "#ec3013", fontFamily, justifyContent: "center", alignItems: "center" }}>
      <Interactive.Div
        name="Marque"
        style={{
          fontSize: 240,
          fontWeight: 800,
          color: "#f3f2f2",
          letterSpacing: -8,
          lineHeight: 1,
          scale: interpolate(frame, [0, 24], [1.4, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      >
        FORSIDES
      </Interactive.Div>
      <Interactive.Div
        name="Sous-titre"
        style={{
          fontSize: 84,
          fontWeight: 800,
          color: "#201e1d",
          marginTop: 10,
          opacity: interpolate(frame, [14, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Comparateur SFCR
      </Interactive.Div>
      <Interactive.Div
        name="Étapes"
        style={{
          fontSize: 44,
          fontWeight: 600,
          color: "#f3f2f2",
          marginTop: 40,
          opacity: interpolate(frame, [30, 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Collecte · Extraction · Contrôles · Revue · Analyse
      </Interactive.Div>
      <Interactive.Div
        name="Crédit musique"
        style={{
          position: "absolute",
          bottom: 60,
          fontSize: 24,
          color: "#ffe0d9",
          opacity: interpolate(frame, [40, 56], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Musique : R. Wagner, La Chevauchée des Walkyries — American Symphony Orchestra, Edison 1921 (Wikimedia Commons)
      </Interactive.Div>
    </AbsoluteFill>
  );
};
