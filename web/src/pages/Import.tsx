import { useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { FolderUp } from "lucide-react";
import { useApp } from "../context/AppContext";
import { loadEntities, useAsync } from "../lib/data";
import { confirmAttachment, extractDocument, uploadImport } from "../lib/extract/pipeline";
import { supabase } from "../lib/supabase";
import type { Entity, SfcrDocument } from "../lib/types";
import { ErrorNote, Legal, Loading, PageHead, ProgressBar } from "../components/ui";
import { useOpenPdf } from "../components/Trace";

interface Line { name: string; state: "waiting" | "upload" | "extract" | "done" | "duplicate" | "error"; msg?: string; entity?: string; year?: number | null; confidence?: string }

export default function Import() {
  const { toast } = useApp();
  const openPdf = useOpenPdf();
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync(async () => {
    const [entities, { data: docs }] = await Promise.all([
      loadEntities(),
      supabase.from("sfcr_documents").select("*").eq("year_confirmed", false).not("extracted_at", "is", null).order("collected_at", { ascending: false }),
    ]);
    return { entities, uncertain: (docs ?? []) as SfcrDocument[] };
  }, []);

  const handle = async (files: File[]) => {
    const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
    if (!pdfs.length) { toast("Aucun PDF dans la sélection."); return; }
    setBusy(true);
    setLines(pdfs.map((f) => ({ name: f.name, state: "waiting" })));
    const entities = data?.entities ?? (await loadEntities());
    const upd = (i: number, l: Partial<Line>) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, ...l } : x)));
    for (let i = 0; i < pdfs.length; i++) {
      try {
        upd(i, { state: "upload" });
        const up = await uploadImport(pdfs[i]);
        if (up.status === "duplicate") { upd(i, { state: "duplicate", msg: "Déjà importé (même fichier)" }); continue; }
        upd(i, { state: "extract" });
        const r = await extractDocument(up.doc!, entities, (msg, d, t) => setStep(`${pdfs[i].name} · ${msg}${t ? ` ${d}/${t}` : ""}`));
        const { data: d } = await supabase.from("sfcr_documents").select("entity_match_confidence,year_confirmed").eq("id", up.id).single();
        upd(i, { state: "done", entity: r.entity?.name, year: r.year, confidence: d?.year_confirmed ? d.entity_match_confidence ?? undefined : "uncertain" });
      } catch (e) {
        upd(i, { state: "error", msg: (e as Error).message });
      }
    }
    setStep(null);
    setBusy(false);
    void reload();
    toast("Import terminé. Confirmez les cas incertains puis validez l'unité dans la file de revue.");
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files: File[] = [];
    const walk = async (entry: FileSystemEntry): Promise<void> => {
      if (entry.isFile) files.push(await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)));
      else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        let batch: FileSystemEntry[];
        do {
          batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
          for (const b of batch) await walk(b);
        } while (batch.length);
      }
    };
    const entries = [...e.dataTransfer.items].map((it) => it.webkitGetAsEntry()).filter(Boolean) as FileSystemEntry[];
    if (entries.length) for (const en of entries) await walk(en);
    else files.push(...e.dataTransfer.files);
    void handle(files);
  };

  if (loading && !data) return <main className="page"><Loading /></main>;
  if (error) return <main className="page"><ErrorNote error={error} /></main>;
  const done = lines.filter((l) => !["waiting", "upload", "extract"].includes(l.state)).length;

  return (
    <main className="page">
      <PageHead kicker="Données" title="Import en lot"
        intro="Déposez un dossier de PDF : chaque SFCR est rattaché automatiquement (entité par LEI ou par nom, année lue dans le document). Seuls les cas incertains sont soumis à confirmation." />

      <section className="section">
        <div className={`dropzone${over ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
          onClick={() => !busy && dirInput.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && dirInput.current?.click()}>
          <FolderUp size={28} />
          <strong>Déposer un dossier ou des PDF ici</strong>
          <span className="small muted">ou cliquer pour choisir un dossier · les fichiers non PDF sont ignorés · un fichier déjà importé n'est pas dupliqué</span>
          <span className="actions" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-secondary" disabled={busy} onClick={() => fileInput.current?.click()}>Choisir des fichiers</button>
          </span>
        </div>
        <input ref={fileInput} type="file" accept="application/pdf" multiple hidden onChange={(e) => e.target.files && handle([...e.target.files])} />
        {/* @ts-expect-error webkitdirectory n'est pas typé */}
        <input ref={dirInput} type="file" webkitdirectory="" multiple hidden onChange={(e) => e.target.files && handle([...e.target.files])} />
      </section>

      {lines.length > 0 && (
        <section className="section">
          <h3 className="section-title">Dépôt en cours <span className="muted">{done}/{lines.length}</span></h3>
          <ProgressBar done={done} total={lines.length} />
          {step && <p className="small muted" aria-live="polite">{step}</p>}
          <table className="table">
            <thead><tr><th>Fichier</th><th>État</th><th>Entité</th><th>Année</th><th>Rattachement</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="small">{l.name}</td>
                  <td className="small">{{ waiting: "En attente", upload: "Envoi…", extract: "Extraction…", done: "Extrait", duplicate: "Doublon", error: "Erreur" }[l.state]}{l.msg ? ` · ${l.msg}` : ""}</td>
                  <td className="small">{l.entity ?? "—"}</td>
                  <td className="small">{l.year ?? "—"}</td>
                  <td>{l.confidence && <span className={l.confidence === "uncertain" ? "tag tag-accent" : "tag tag-neutral"}>{{ lei: "Par LEI", name: "Par nom", manual: "Manuel", uncertain: "À confirmer" }[l.confidence]}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="section">
        <h3 className="section-title">Cas incertains à confirmer <span className="muted">{data!.uncertain.length}</span></h3>
        {data!.uncertain.length ? (
          <table className="table">
            <thead><tr><th>Fichier</th><th>Indices lus dans le document</th><th>Entité</th><th>Année</th><th /></tr></thead>
            <tbody>{data!.uncertain.map((d) => <Uncertain key={d.id} d={d} entities={data!.entities} onOpen={() => openPdf(d.storage_path, d.year_evidence_page)} onDone={() => { toast("Rattachement confirmé."); void reload(); }} />)}</tbody>
          </table>
        ) : <p className="muted">Aucun cas incertain.</p>}
        <p className="small muted">Après rattachement, l'unité de chaque SFCR se valide dans la <Link to="/revue">file de revue</Link>.</p>
        <Legal />
      </section>
    </main>
  );
}

function Uncertain({ d, entities, onOpen, onDone }: { d: SfcrDocument; entities: Entity[]; onOpen: () => void; onDone: () => void }) {
  const [entityId, setEntityId] = useState(d.entity_id ?? "");
  const { years: YEARS, latestYear } = useApp();
  const [year, setYear] = useState<number>(d.candidate_year ?? d.reference_year ?? latestYear);
  const [err, setErr] = useState<string | null>(null);
  const confirm = async () => {
    try { await confirmAttachment(d.id, entityId, year); onDone(); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <tr>
      <td className="small">{d.file_name}<div className="sub">{d.origin === "import" ? "Import" : d.origin} · <button className="btn btn-ghost" style={{ padding: 0 }} onClick={onOpen}>ouvrir le PDF</button></div></td>
      <td className="small">
        {d.detected_lei ? <>LEI lu : <span className="mono">{d.detected_lei}</span><br /></> : "Aucun LEI connu lu. "}
        {d.year_evidence ? <>« {d.year_evidence} » (p. {d.year_evidence_page})</> : "Année non lue dans le document."}
      </td>
      <td>
        <select className="input" style={{ minWidth: 240 }} value={entityId} onChange={(e) => setEntityId(e.target.value)}>
          <option value="">— choisir —</option>
          {entities.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.level})</option>)}
        </select>
      </td>
      <td>
        <select className="input" style={{ width: 100 }} value={year} onChange={(e) => setYear(+e.target.value)}>
          {[...new Set([...YEARS, year])].sort().map((y) => <option key={y}>{y}</option>)}
        </select>
      </td>
      <td>
        <button className="btn btn-secondary" disabled={!entityId} onClick={confirm}>Confirmer</button>
        {err && <div className="small" style={{ color: "var(--color-accent-700)" }}>{err}</div>}
      </td>
    </tr>
  );
}
