import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !key) throw new Error("VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY doivent être définis (.env.local)");

export const supabase = createClient(url, key);

export const BUCKET = "sfcr";

/** URL signée d'un PDF stocké, ouverte à la bonne page (#page=N). */
export async function pdfUrl(storagePath: string, page?: number | null) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error || !data) throw new Error(error?.message ?? "PDF introuvable");
  return data.signedUrl + (page ? `#page=${page}` : "");
}

/** Appel de l'edge function de collecte. */
export async function callCollect<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("collect", { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) msg = (await ctx.json()).error ?? msg;
    } catch { /* message par défaut */ }
    throw new Error(msg);
  }
  return data as T;
}
