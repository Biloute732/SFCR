import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, enter, fontFamily } from "../theme";
import { StepTitle } from "./StepTitle";

// Valeurs FICTIVES, avec les noms des données de démonstration de l'application
const BARS: [string, number][] = [
  ["Démo Vie Alpha S.A.", 245],
  ["Démo Groupe Un", 212],
  ["Démo Mixte Santé S.A.", 188],
  ["Démo Non-Vie Alpha S.A.", 163],
  ["Démo Vie Bêta S.A.", 118],
];
const MAX = 260;
const SCREENS = ["Fiche compagnie", "Comparaison", "Évolution", "Export Excel"];

export const Analyse: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Analyse" style={{ backgroundColor: C.bg, fontFamily }}>
      <StepTitle n="5" title="Analyse" />
      <div style={{ position: "absolute", left: 140, top: 310, width: 1040 }}>
        <div style={{ fontSize: 36, fontWeight: 800, color: C.ink, marginBottom: 20, opacity: enter(frame, 10) }}>Ratio de solvabilité (SCR)</div>
        {BARS.map(([name, v], i) => {
          const g = interpolate(frame, [24 + i * 8, 70 + i * 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          });
          const low = v < 150;
          return (
            <div key={name} style={{ marginBottom: 18, opacity: enter(frame, 18 + i * 8) }}>
              <div style={{ fontSize: 30, color: C.ink, marginBottom: 6 }}>{name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ height: 44, width: (v / MAX) * 820 * g, backgroundColor: low ? C.accent : C.ink }} />
                <span style={{ fontSize: 36, fontWeight: 800, color: low ? C.accent : C.ink }}>{Math.round(v * g)} %</span>
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: 26, color: C.muted, marginTop: 6, opacity: enter(frame, 60) }}>Données fictives de démonstration</div>
      </div>
      <div style={{ position: "absolute", right: 140, top: 330, width: 520, display: "flex", flexDirection: "column", gap: 20 }}>
        {SCREENS.map((s, i) => {
          const p = enter(frame, 100 + i * 18);
          return (
            <div key={s} style={{ backgroundColor: C.ink, color: C.bg, fontSize: 38, fontWeight: 600, padding: "26px 36px", opacity: p, translate: `${(1 - p) * 100}px 0px` }}>
              {s}
            </div>
          );
        })}
        <div style={{ fontSize: 30, color: C.ink, marginTop: 12, opacity: enter(frame, 180), lineHeight: 1.3 }}>
          Seules les années <b>validées</b> servent aux analyses.
        </div>
      </div>
    </AbsoluteFill>
  );
};
