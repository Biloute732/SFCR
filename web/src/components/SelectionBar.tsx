import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import type { Entity } from "../lib/types";

/** Règles de sélection pour la comparaison (US10). */
export function selectionCheck(sel: Entity[]) {
  if (sel.length < 2) return { ok: false, msg: "Sélectionnez au moins 2 entités." };
  if (new Set(sel.map((e) => e.level)).size > 1) return { ok: false, msg: "Solo et Groupe ne se comparent pas : gardez un seul niveau." };
  const types = new Set(sel.map((e) => e.type).filter((t) => t !== "Mixte"));
  if (types.size > 1) return { ok: true, msg: "Vie et Non-Vie mélangées : seuls solvabilité et bilan seront comparés." };
  return { ok: true, msg: "" };
}

export function SelectionBar({ entities }: { entities: Entity[] }) {
  const { selection, setSelection } = useApp();
  const nav = useNavigate();
  const sel = selection.map((id) => entities.find((e) => e.id === id)).filter(Boolean) as Entity[];
  if (!sel.length) return null;
  const check = selectionCheck(sel);
  return (
    <div className="selbar">
      <span className="count">{sel.length} / 10</span>
      <div className="chips">
        {sel.map((e) => (
          <button key={e.id} className="chip" onClick={() => setSelection((p) => p.filter((x) => x !== e.id))}>{e.name} ✕</button>
        ))}
      </div>
      {check.msg && <span className="msg">{check.msg}</span>}
      <button className="btn btn-secondary" onClick={() => setSelection([])}>Effacer</button>
      <button className="btn btn-primary" disabled={!check.ok} onClick={() => nav("/comparaison")}>Comparer →</button>
    </div>
  );
}
