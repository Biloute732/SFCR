import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { fontFamily } from "../theme";

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Intro" style={{ backgroundColor: "#201e1d", fontFamily, justifyContent: "center", paddingLeft: 140 }}>
      <Interactive.Div
        name="Barre rouge"
        style={{
          position: "absolute",
          left: 0,
          top: 600,
          height: 24,
          width: 1920,
          backgroundColor: "#ec3013",
          transformOrigin: "left center",
          scale: interpolate(frame, [0, 24], ["0 1", "1 1"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.7, 0, 0.2, 1),
          }),
        }}
      />
      <Interactive.Div
        name="Marque"
        style={{
          fontSize: 260,
          fontWeight: 800,
          color: "#f3f2f2",
          letterSpacing: -8,
          lineHeight: 1,
          translate: interpolate(frame, [14, 40], ["0px 120px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          opacity: interpolate(frame, [14, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        FORSIDES
      </Interactive.Div>
      <Interactive.Div
        name="Sous-titre"
        style={{
          fontSize: 96,
          fontWeight: 800,
          color: "#ec3013",
          marginTop: 90,
          opacity: interpolate(frame, [40, 56], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          translate: interpolate(frame, [40, 60], ["-60px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Comparateur SFCR Luxembourg
      </Interactive.Div>
      <Interactive.Div
        name="Accroche"
        style={{
          fontSize: 48,
          fontWeight: 400,
          color: "#bab6b6",
          marginTop: 24,
          opacity: interpolate(frame, [70, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Les rapports Solvabilité 2, collectés, lus, contrôlés et comparés.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
