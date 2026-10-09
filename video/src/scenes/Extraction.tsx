import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, enter, fontFamily } from "../theme";
import { StepTitle } from "./StepTitle";

const QRT: [string, string][] = [
  ["S.02.01", "Bilan prudentiel"],
  ["S.05.01", "Primes et sinistres"],
  ["S.12.01", "Provisions Vie"],
  ["S.17.01", "Provisions Non-Vie"],
  ["S.22.01", "Garanties long terme"],
  ["S.23.01", "Fonds propres"],
  ["S.25.01", "SCR"],
  ["S.28.01", "MCR"],
];

export const Extraction: React.FC = () => {
  const frame = useCurrentFrame();
  const scan = interpolate(frame, [20, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill name="Extraction" style={{ backgroundColor: C.bg, fontFamily }}>
      <StepTitle n="2" title="Extraction" />
      {/* Page de PDF balayée */}
      <div style={{ position: "absolute", left: 140, top: 320, width: 420, height: 540, backgroundColor: "#fff", boxShadow: "0 12px 32px rgba(45,43,43,0.22)", padding: 40, overflow: "hidden", opacity: enter(frame, 10) }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: C.ink }}>SFCR</div>
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} style={{ height: 14, marginTop: 20, backgroundColor: C.surface, width: `${60 + ((i * 37) % 40)}%` }} />
        ))}
        <div style={{ position: "absolute", left: 0, right: 0, top: scan * 540, height: 6, backgroundColor: C.accent, boxShadow: `0 0 30px ${C.accent}` }} />
      </div>
      <div style={{ position: "absolute", left: 610, top: 530, fontSize: 90, fontWeight: 800, color: C.accent, opacity: enter(frame, 30) }}>→</div>
      <div style={{ position: "absolute", left: 760, right: 140, top: 320, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {QRT.map(([code, label], i) => {
          const p = enter(frame, 36 + i * 9);
          return (
            <div key={code} style={{ backgroundColor: C.surface, padding: "20px 28px", opacity: p, scale: `${0.8 + 0.2 * p}`, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: C.accent }}>{code}</span>
              <span style={{ fontSize: 30, color: C.ink }}>{label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 140, right: 140, bottom: 80, fontSize: 40, color: C.ink, lineHeight: 1.3, opacity: enter(frame, 130) }}>
        Chaque tableau retrouvé par son code, chaque montant <b>ramené en milliers d'euros</b>. Les PDF scannés sont lus par reconnaissance de texte.
      </div>
    </AbsoluteFill>
  );
};
