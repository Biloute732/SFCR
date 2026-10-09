import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, enter, fontFamily } from "../theme";
import { StepTitle } from "./StepTitle";

const CARDS: [string, string][] = [
  ["Listes du CAA", "Vie, Non-Vie et Groupes, plus les registres de réassurance et des captives"],
  ["Téléchargement", "Une requête toutes les 1,5 s par site, règles des sites (robots.txt) respectées"],
  ["Historique 2023–2025", "Site de la compagnie, puis archives du web (Wayback Machine)"],
];
const DATES: [string, string][] = [["15/04", "solos"], ["31/05", "groupes"], ["30/06", "relance"]];

export const Collecte: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill name="Collecte" style={{ backgroundColor: C.bg, fontFamily }}>
      <StepTitle n="1" title="Collecte" />
      <div style={{ position: "absolute", left: 140, right: 140, top: 340, display: "flex", gap: 40 }}>
        {CARDS.map(([t, d], i) => {
          const p = enter(frame, 20 + i * 22);
          return (
            <div key={t} style={{ flex: 1, backgroundColor: C.surface, borderTop: `10px solid ${C.accent}`, padding: "40px 40px 48px", opacity: p, translate: `0px ${(1 - p) * 120}px` }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: C.accent }}>0{i + 1}</div>
              <div style={{ fontSize: 54, fontWeight: 800, color: C.ink, marginTop: 12, lineHeight: 1.05 }}>{t}</div>
              <div style={{ fontSize: 34, color: C.ink, marginTop: 24, lineHeight: 1.3 }}>{d}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 140, right: 140, bottom: 110, display: "flex", alignItems: "center", gap: 48, fontSize: 40 }}>
        <span style={{ fontWeight: 800, color: C.ink, opacity: enter(frame, 110) }}>Collecte planifiée :</span>
        {DATES.map(([d, l], i) => (
          <span key={d} style={{ opacity: enter(frame, 125 + i * 14), color: C.ink }}>
            <b style={{ color: C.accent }}>{d}</b> {l}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
