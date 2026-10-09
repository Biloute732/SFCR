import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { DisplayUnit } from "../lib/format";
import type { Branch } from "../lib/types";

interface Settings {
  display_unit: DisplayUnit;
  favorite_indicators: string[];
  first_year: number;
}

export type Role = "admin" | "user";

interface AppState {
  session: Session | null;
  ready: boolean;
  /** Rôle de la personne connectée ; null = compte sans accès à l'outil ; undefined = en cours de chargement. */
  role: Role | null | undefined;
  isAdmin: boolean;
  mustChangePassword: boolean;
  passwordChanged: () => void;
  settings: Settings;
  saveSettings: (s: Partial<Settings>) => Promise<void>;
  /** Années d'analyse : de la première année (Paramètres) au dernier exercice publié. */
  years: number[];
  latestYear: number;
  branch: Branch;
  setBranch: (b: Branch) => void;
  /** Filtre pays commun aux écrans (code ISO à 2 lettres) ; « all » = tous les pays. */
  country: string;
  setCountry: (c: string) => void;
  selection: string[];
  setSelection: (ids: string[] | ((prev: string[]) => string[])) => void;
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const Ctx = createContext<AppState | null>(null);

const DEFAULT_SETTINGS: Settings = { display_unit: "kEUR", favorite_indicators: ["scr_ratio", "own_funds", "gwp_nl", "gwp_life", "total_assets"], first_year: 2023 };

/** Dernier exercice publié : l'exercice N est disponible à partir du 1er avril N+1 (même règle que la base). */
// eslint-disable-next-line react-refresh/only-export-components
export function lastPublishedYear(today = new Date()) {
  return today.getMonth() >= 3 ? today.getFullYear() - 1 : today.getFullYear() - 2;
}

function yearRange(first: number) {
  const last = lastPublishedYear();
  const out: number[] = [];
  for (let y = Math.min(first, last); y <= last; y++) out.push(y);
  return out;
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [branch, setBranchState] = useState<Branch>(() => readLocal("sfcr.branch", "all"));
  const [country, setCountryState] = useState<string>(() => readLocal("sfcr.country", "all"));
  const [selection, setSelectionState] = useState<string[]>(() => readLocal("sfcr.selection", []));
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) { setRole(undefined); return; }
    let alive = true;
    (async () => {
      // Rôle et préférences propres à l'utilisateur ; années d'analyse communes (réglées par un administrateur)
      const [{ data: me }, { data: prefs }, { data: global }] = await Promise.all([
        supabase.from("app_users").select("role,must_change_password").eq("user_id", userId).maybeSingle(),
        supabase.from("user_preferences").select("display_unit,favorite_indicators").eq("user_id", userId).maybeSingle(),
        supabase.from("settings").select("first_year").maybeSingle(),
      ]);
      if (!alive) return;
      setRole((me?.role as Role | undefined) ?? null);
      setMustChangePassword(!!me?.must_change_password);
      setSettings((prev) => ({ ...prev, ...(prefs ?? {}), ...(global ?? {}) }));
    })();
    return () => { alive = false; };
  }, [userId]);

  const saveSettings = useCallback(async (s: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...s }));
    const { first_year, ...personal } = s;
    if (first_year !== undefined) {
      const { error } = await supabase.from("settings").update({ first_year }).eq("singleton", true);
      if (error) throw new Error(error.message);
    }
    if (Object.keys(personal).length && userId) {
      const { error } = await supabase.from("user_preferences").upsert({ user_id: userId, ...personal });
      if (error) throw new Error(error.message);
    }
  }, [userId]);

  const setBranch = useCallback((b: Branch) => {
    setBranchState(b);
    try { localStorage.setItem("sfcr.branch", JSON.stringify(b)); } catch { /* stockage indisponible */ }
  }, []);

  const setCountry = useCallback((c: string) => {
    setCountryState(c);
    try { localStorage.setItem("sfcr.country", JSON.stringify(c)); } catch { /* stockage indisponible */ }
  }, []);

  const setSelection = useCallback((v: string[] | ((prev: string[]) => string[])) => {
    setSelectionState((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem("sfcr.selection", JSON.stringify(next)); } catch { /* stockage indisponible */ }
      return next;
    });
  }, []);

  const years = useMemo(() => yearRange(settings.first_year), [settings.first_year]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  return (
    <Ctx.Provider value={{ session, ready, role, isAdmin: role === "admin", mustChangePassword, passwordChanged: () => setMustChangePassword(false), settings, saveSettings, years, latestYear: years[years.length - 1], branch, setBranch, country, setCountry, selection, setSelection, toast, toastMsg }}>
      {children}
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp hors de AppProvider");
  return c;
}
