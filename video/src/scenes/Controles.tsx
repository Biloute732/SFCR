import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, enter, fontFamily } from "../theme";
import { StepTitle } from "./StepTitle";

const CHECKS = [
  "Bilan équilibré",
  "SCR : S.25 = S.23",
  "MCR : S.28 = S.23",
  "Provisions : S.12 / S.17 = bilan",
  "Ratio de solvabilité recalculé",
  "Ratio publié par le CAA",
  "Variation anormale d'une année à l'autre",
];

export const Controles: React.FC = () => {
  const frame = useCurrentFrame();
  const box = enter(frame, 140);
  return (
    <AbsoluteFill name="Contrôles" style={{ backgroundColor: C.bg, fontFamily }}>
      <StepTitle n="3" title="Contrôles" />
      <div style={{ position: "absolute", left: 140, top: 320, display: "flex", flexDirection: "column", gap: 18 }}>
        {CHECKS.map((c, i) => {
          const p = enter(frame, 16 + i * 14);
          const tick = enter(frame, 26 + i * 14);
          const fail = i === CHECKS.length - 1;
          return (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 48, color: C.ink, opacity: p, translate: `${(1 - p) * 60}px 0px` }}>
              <span style={{ width: 62, height: 62, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: fail ? C.accent : C.ink, color: C.bg, fontWeight: 800, fontSize: 40, scale: `${tick}` }}>
                {fail ? "✕" : "✓"}
              </span>
              <span style={{ fontWeight: fail ? 800 : 400, color: fail ? C.accent : C.ink }}>{c}</span>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", right: 140, top: 400, width: 560, backgroundColor: C.ink, color: C.bg, padding: 48, opacity: box, translate: `${(1 - box) * 120}px 0px` }}>
        <div style={{ fontSize: 34, color: C.accent, fontWeight: 800 }}>Un contrôle échoue ?</div>
        <div style={{ fontSize: 58, fontWeight: 800, marginTop: 16, lineHeight: 1.1 }}>Les cellules partent en file de revue.</div>
        <div style={{ fontSize: 32, marginTop: 20, color: "#bab6b6" }}>Rien d'incertain n'entre dans une analyse.</div>
      </div>
    </AbsoluteFill>
  );
};
