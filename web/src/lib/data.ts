import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { allIndicatorRefs, IND_BY_ID, resolve, type Resolved } from "./indicators";
import { cellKey } from "./qrt";
import type { Entity, EntityYear, VCell } from "./types";

export const yearSpan = (ys: number[]) => (ys.length ? `${ys[0]}–${ys[ys.length - 1]}` : "");

/** Pagination PostgREST (1000 lignes par requête). */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadEntities(): Promise<Entity[]> {
  return fetchAll<Entity>((a, b) => supabase.from("entities").select("*").order("name").range(a, b));
}

export async function loadEntityYears(): Promise<EntityYear[]> {
  return fetchAll<EntityYear>((a, b) => supabase.from("entity_year_status").select("*").range(a, b));
}

/** Cellules validées (vue validated_cells) pour des clés données. */
export async function loadCells(keys: string[], entityIds?: string[] | null, years?: number[] | null): Promise<VCell[]> {
  const { data, error } = await supabase.rpc("cells_for", { p_keys: keys, p_entity_ids: entityIds ?? null, p_years: years ?? null });
  if (error) throw new Error(error.message);
  return (data ?? []) as VCell[];
}

export const INDICATOR_KEYS = allIndicatorRefs().map(cellKey);

/** Index : entité → année → clé de cellule → cellule. */
export type CellIndex = Map<string, Map<number, Map<string, VCell>>>;

export function indexCells(cells: VCell[]): CellIndex {
  const idx: CellIndex = new Map();
  for (const c of cells) {
    let byYear = idx.get(c.entity_id);
    if (!byYear) idx.set(c.entity_id, (byYear = new Map()));
    let m = byYear.get(c.reference_year);
    if (!m) byYear.set(c.reference_year, (m = new Map()));
    m.set(`${c.qrt_code}|${c.row_code}|${c.col_code}`, { ...c, value_keur: c.value_keur == null ? null : Number(c.value_keur) });
  }
  return idx;
}

export function indicatorFor(idx: CellIndex, entity: Entity, year: number, indId: string): Resolved {
  return resolve(IND_BY_ID[indId], entity.level, idx.get(entity.id)?.get(year) ?? new Map());
}

/** Petit hook de chargement asynchrone avec rechargement. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [run]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}
