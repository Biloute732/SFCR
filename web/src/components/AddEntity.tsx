import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import type { Entity } from "../lib/types";
import { CountrySelect, Dialog, Seg } from "./ui";
import { countryName, isSiiCountry, lookupLei } from "../lib/countries";

/** Ajout manuel d'une compagnie (administrateurs) : hors listes SFCR et registres du CAA. */
export function AddEntity({ onClose }: { onClose: () => void }) {
  const { toast } = useApp();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [lei, setLei] = useState("");
  const [level, setLevel] = useState<Entity["level"]>("Solo");
  const [type, setType] = useState<Entity["type"]>("Non-Vie");
  const [category, setCategory] = useState<Entity["category"]>("assurance");
  const [country, setCountry] = useState("LU");
  const [pageUrl, setPageUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gleif, setGleif] = useState<string | null>(null);

  // LEI complet saisi : pays du siège (et nom si vide) lus dans le registre GLEIF, modifiables ensuite
  const onLei = async (v: string) => {
    setLei(v);
    setGleif(null);
    if (!/^[0-9A-Z]{18}\d{2}$/.test(v)) return;
    setGleif("Lecture du registre GLEIF…");
    const r = await lookupLei(v);
    if (!r) { setGleif("LEI introuvable dans le registre GLEIF : renseignez le pays à la main."); return; }
    setCountry(r.country);
    setName((n) => n.trim() ? n : r.name);
    setGleif(isSiiCountry(r.country) ? `GLEIF : ${r.name}, siège en ${countryName(r.country)}.` : `GLEIF : ${r.name}, siège hors Solvabilité 2 (${r.country}).`);
  };

  const url = (v: string) => {
    const t = v.trim();
    if (!t) return null;
    let u: URL;
    try { u = new URL(t); } catch { throw new Error(`Adresse invalide : ${t}`); }
    // Uniquement des adresses web : pas de « javascript: », « data: », « file: »…
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`Adresse invalide (http ou https uniquement) : ${t}`);
    return u.toString();
  };

  const save = async () => {
    setErr(null);
    try {
      if (!name.trim()) throw new Error("Nom obligatoire.");
      const l = lei.trim().toUpperCase();
      if (l && !/^[0-9A-Z]{18}\d{2}$/.test(l)) throw new Error("LEI invalide (20 caractères).");
      if (!isSiiCountry(country)) throw new Error("Pays : choisissez un pays soumis à Solvabilité 2.");
      setBusy(true);
      const { data, error } = await supabase.from("entities").insert({
        name: name.trim(),
        lei: l || `NOLEI:${name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")}`,
        level, type, category, country, source: "manual",
        caa_page_url: url(pageUrl), caa_pdf_url: url(pdfUrl), in_caa_list: true,
      }).select("id").single();
      if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "Une compagnie avec ce LEI existe déjà." : error.message);
      await supabase.from("entity_names").insert({ entity_id: data.id, name: name.trim() });
      toast(`${name.trim()} ajoutée.`);
      nav(`/compagnies/${data.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog title="Ajouter une compagnie" onClose={() => !busy && onClose()}
      actions={<>
        <button className="btn btn-secondary" disabled={busy} onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={save}>{busy ? "Ajout…" : "Ajouter"}</button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div className="field"><label htmlFor="ae-name">Nom</label><input id="ae-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="ae-lei">LEI (recommandé : sert au rattachement automatique des PDF importés)</label>
          <input id="ae-lei" className="input mono" value={lei} onChange={(e) => void onLei(e.target.value.toUpperCase().trim())} placeholder="20 caractères" />
          {gleif && <span className="small muted">{gleif}</span>}</div>
        <div className="field"><label>Catégorie</label>
          <Seg<Entity["category"]> name="ae-cat" value={category} onChange={setCategory} options={[["assurance", "Assurance"], ["reassurance", "Réassurance"], ["captive", "Captive"]]} /></div>
        <div className="actions">
          <div className="field"><label>Niveau</label><Seg<Entity["level"]> name="ae-level" value={level} onChange={setLevel} options={[["Solo", "Solo"], ["Groupe", "Groupe"]]} /></div>
          <div className="field"><label>Type</label><Seg<Entity["type"]> name="ae-type" value={type} onChange={setType} options={[["Vie", "Vie"], ["Non-Vie", "Non-Vie"], ["Mixte", "Mixte"]]} /></div>
        </div>
        <div className="field"><label htmlFor="ae-country">Pays du siège (pays soumis à Solvabilité 2)</label><CountrySelect id="ae-country" value={country} onChange={setCountry} /></div>
        <div className="field"><label htmlFor="ae-page">Page SFCR (facultatif : permet la collecte et la reprise de l'historique)</label>
          <input id="ae-page" className="input" value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} placeholder="https://…" /></div>
        <div className="field"><label htmlFor="ae-pdf">Lien direct du dernier SFCR (facultatif)</label>
          <input id="ae-pdf" className="input" value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} placeholder="https://….pdf" /></div>
        <p className="small muted" style={{ margin: 0 }}>Sans lien, les SFCR s'ajoutent par l'import en lot (rattachement par LEI ou par nom). La compagnie est exclue par défaut des médianes du marché luxembourgeois ; sur l'écran Comparaison, une médiane par pays est disponible.</p>
        {err && <p className="note" style={{ margin: 0 }}>{err}</p>}
      </div>
    </Dialog>
  );
}
