// Orchestration d'une collecte depuis l'interface : listes CAA, puis téléchargements par lots.
import { useCallback, useState } from "react";
import { callCollect } from "./supabase";

interface BatchResult { run_id: string; remaining: number; next_offset?: number; entity_ids?: string[]; processed?: number; total?: number; stored?: number; broken?: number; summary?: string; error?: string }

export function useCollection(onDone?: (msg: string) => void) {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const runBatches = useCallback(async (action: "download" | "history", entityIds?: string[]) => {
    let res = await callCollect<BatchResult>({ action, entity_ids: entityIds });
    setProgress({ done: res.processed ?? 0, total: res.total ?? 0 });
    while (res.remaining > 0) {
      res = await callCollect<BatchResult>({ action, run_id: res.run_id, entity_ids: res.entity_ids, offset: res.next_offset });
      setProgress({ done: res.processed ?? 0, total: res.total ?? 0 });
    }
    return res;
  }, []);

  /** Collecte complète : listes CAA → dernier SFCR de chaque entité. */
  const collectAll = useCallback(async () => {
    setRunning(true);
    try {
      setStep("Lecture des listes CAA");
      const lists = await callCollect<BatchResult & { created: number; removed: number; total: number }>({ action: "caa_lists" });
      setStep("Téléchargement des SFCR");
      const dl = await runBatches("download");
      const msg = `Collecte terminée : ${lists.total} entités, ${lists.created} nouvelle(s), ${lists.removed} disparue(s) · ${dl.stored ?? 0} PDF ajouté(s), ${dl.broken ?? 0} alerte(s).`;
      onDone?.(msg);
      return msg;
    } finally {
      setRunning(false);
      setStep(null);
      setProgress(null);
    }
  }, [runBatches, onDone]);

  const run = useCallback(async (label: string, fn: () => Promise<string>) => {
    setRunning(true);
    setStep(label);
    try {
      const msg = await fn();
      onDone?.(msg);
    } finally {
      setRunning(false);
      setStep(null);
      setProgress(null);
    }
  }, [onDone]);

  const readLists = () => run("Lecture des listes CAA", async () => {
    const r = await callCollect<{ total: number; created: number; removed: number }>({ action: "caa_lists" });
    return `Listes CAA lues : ${r.total} entités, ${r.created} nouvelle(s), ${r.removed} disparue(s).`;
  });
  const download = (ids?: string[]) => run("Téléchargement des SFCR", async () => {
    const r = await runBatches("download", ids);
    return `Téléchargement terminé : ${r.stored ?? 0} PDF ajouté(s), ${r.broken ?? 0} alerte(s).`;
  });
  const history = (ids?: string[]) => run("Reprise de l'historique", async () => {
    const r = await runBatches("history", ids);
    return `Historique : ${r.stored ?? 0} SFCR ajouté(s).`;
  });

  return { running, step, progress, collectAll, readLists, download, history };
}
