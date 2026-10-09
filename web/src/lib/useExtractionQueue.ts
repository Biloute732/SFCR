import { useCallback, useState } from "react";
import { supabase } from "./supabase";
import { loadEntities } from "./data";
import { extractDocument } from "./extract/pipeline";
import type { SfcrDocument } from "./types";

/** Extraction séquentielle de documents dans le navigateur, avec état toujours visible. */
export function useExtractionQueue(onDone?: (msg: string) => void) {
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [step, setStep] = useState<{ msg: string; done?: number; total?: number } | null>(null);
  const [count, setCount] = useState<{ done: number; total: number } | null>(null);

  const run = useCallback(async (docs: SfcrDocument[]) => {
    if (!docs.length) return;
    setRunning(true);
    const entities = await loadEntities();
    let ok = 0, ko = 0;
    try {
      for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        const name = entities.find((e) => e.id === d.entity_id)?.name ?? d.file_name ?? "Document";
        setCurrent(name);
        setCount({ done: i, total: docs.length });
        try {
          await extractDocument(d, entities, (msg, done, total) => setStep({ msg, done, total }));
          ok++;
        } catch {
          ko++;
        }
      }
    } finally {
      setRunning(false);
      setCurrent(null);
      setStep(null);
      setCount(null);
    }
    onDone?.(`Extraction terminée : ${ok} SFCR extrait(s)${ko ? `, ${ko} en erreur` : ""}. Validez l'unité dans la file de revue.`);
  }, [onDone]);

  const runPending = useCallback(async () => {
    const { data } = await supabase.from("sfcr_documents").select("*").in("status", ["to_extract", "error", "extracting"]).not("storage_path", "is", null).order("collected_at");
    await run((data ?? []) as SfcrDocument[]);
  }, [run]);

  return { running, current, step, count, run, runPending };
}
