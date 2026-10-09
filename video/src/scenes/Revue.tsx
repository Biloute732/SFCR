import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, enter, fontFamily } from "../theme";
import { StepTitle } from "./StepTitle";

const ITEMS: [string, string][] = [
  ["1 clic", "pour valider l'unité et la devise d'un rapport"],
  ["31/12", "cours de la BCE pour convertir une autre devise"],
  ["Tracé", "chaque correction est gardée, avec un motif obligatoire"],
];

export const Revue: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Revue" style={{ backgroundColor: C.bg, fontFamily }}>
      <StepTitle n="4" title="Revue" />
      <div style={{ position: "absolute", left: 140, right: 140, top: 380, display: "flex", gap: 60 }}>
        {ITEMS.map(([big, txt], i) => {
          const p = enter(frame, 20 + i * 20);
          return (
            <div key={big} style={{ flex: 1, borderLeft: `10px solid ${C.accent}`, paddingLeft: 36, opacity: p, translate: `0px ${(1 - p) * 80}px` }}>
              <div style={{ fontSize: 120, fontWeight: 800, color: C.ink, lineHeight: 1 }}>{big}</div>
              <div style={{ fontSize: 40, color: C.ink, marginTop: 24, lineHeight: 1.3 }}>{txt}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
