import { useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { useApp } from "../context/AppContext";
import { pdfUrl } from "../lib/supabase";
import { fmtAmount, fmtDate, fmtValue, ORIGIN_LABEL } from "../lib/format";
import type { Indicator, Resolved } from "../lib/indicators";
import type { VCell } from "../lib/types";
import { Dialog } from "./ui";

/** Ouvre le PDF source à la bonne page (US12). */
export function useOpenPdf() {
  const { toast } = useApp();
  return async (storagePath: string | null | undefined, page?: number | null) => {
    if (!storagePath) {
      toast("PDF non disponible pour cette valeur (donnée de démonstration ou document sans fichier).");
      return;
    }
    try {
      window.open(await pdfUrl(storagePath, page), "_blank", "noopener");
    } catch (e) {
      toast((e as Error).message);
    }
  };
}

const cellRef = (c: { qrt_code: string; row_code: string; col_code: string }) => `${c.qrt_code} · ${c.row_code} ${c.col_code}`;

/** Valeur d'indicateur traçable : un clic ouvre le PDF (publié) ou la formule et ses cellules (calculé). */
export function TraceValue({ ind, r, className }: { ind: Indicator; r: Resolved; className?: string }) {
  const { settings } = useApp();
  const [open, setOpen] = useState(false);
  const openPdf = useOpenPdf();
  const text = fmtValue(r.value, ind.unit, settings.display_unit);
  if (r.value == null) {
    return <span className="empty-val" title={r.missing.length ? `Cellule(s) non validée(s) : ${r.missing.map((m) => `${m.qrt} ${m.row} ${m.col}`).join(", ")}` : undefined}>—</span>;
  }
  const single = ind.kind === "Publié" && r.sources.length === 1 && r.sources[0].cell;
  return (
    <>
      <button
        type="button"
        className={`trace ${className ?? ""}`}
        onClick={() => (single ? openPdf(single.storage_path, single.pages?.[0]) : setOpen(true))}
        title={single ? `${cellRef(single)} · p. ${single.pages?.join(", ")} — ouvrir le PDF` : `${r.formula} — voir le détail`}
      >
        {text}
      </button>
      {open && <SourcesDialog ind={ind} r={r} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SourcesDialog({ ind, r, onClose }: { ind: Indicator; r: Resolved; onClose: () => void }) {
  const { settings } = useApp();
  const openPdf = useOpenPdf();
  return (
    <Dialog title={ind.label} onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        <strong>{fmtValue(r.value, ind.unit, settings.display_unit, true)}</strong> · {ind.kind}
      </p>
      <p className="mono small">{r.formula}</p>
      <table className="table" style={{ fontSize: 13 }}>
        <thead><tr><th>Cellule</th><th className="num">Valeur (kEUR)</th><th>Source</th></tr></thead>
        <tbody>
          {r.sources.map((s) => (
            <tr key={`${s.ref.qrt}${s.ref.row}${s.ref.col}`}>
              <td className="mono small">{s.ref.qrt} {s.ref.row} {s.ref.col}</td>
              <td className="num">{s.cell ? (s.cell.is_blank ? <span className="muted">non renseigné{s.optional ? " (compté 0)" : ""}</span> : s.cell.is_ratio ? fmtValue(s.cell.value_keur, "pct") : fmtAmount(s.cell.value_keur)) : <span className="muted">absente{s.optional ? " (comptée 0)" : ""}</span>}</td>
              <td>{s.cell && <CellSource c={s.cell} onOpen={() => openPdf(s.cell!.storage_path, s.cell!.pages?.[0])} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

function CellSource({ c, onOpen }: { c: VCell; onOpen: () => void }) {
  return (
    <span className="small">
      <button className="btn btn-ghost" onClick={onOpen} style={{ padding: "0 4px" }}><FileText size={13} /> p. {c.pages?.join(", ")}</button>
      {" "}{ORIGIN_LABEL[c.origin] ?? c.origin} · {fmtDate(c.collected_at)}
      {c.source_url && <> · <a href={c.source_url} target="_blank" rel="noreferrer">URL <ExternalLink size={11} /></a></>}
    </span>
  );
}
