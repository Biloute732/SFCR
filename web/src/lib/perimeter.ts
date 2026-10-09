// Périmètre des compagnies : listes SFCR du CAA (marché de référence du PRD), registres (réassurance, captives),
// ajouts manuels. Les médianes portent par défaut sur les seules listes SFCR.
import type { Entity } from "./types";

export type Perimeter = "caa" | "reassurance" | "captive" | "manual" | "all";

export const PERIMETER_OPTIONS: [Perimeter, string][] = [
  ["caa", "Listes SFCR CAA"],
  ["reassurance", "Réassurance"],
  ["captive", "Captives"],
  ["manual", "Ajouts manuels"],
  ["all", "Tout"],
];

export function inPerimeter(e: Entity, p: Perimeter) {
  switch (p) {
    case "caa": return e.source === "caa_sfcr";
    case "reassurance": return e.source !== "caa_sfcr" && e.category === "reassurance";
    case "captive": return e.source !== "caa_sfcr" && e.category === "captive";
    case "manual": return e.source === "manual";
    default: return true;
  }
}

export const CATEGORY_LABEL: Record<Entity["category"], string> = {
  assurance: "Assurance",
  reassurance: "Réassurance",
  captive: "Captive",
};

export const SOURCE_LABEL: Record<Entity["source"], string> = {
  caa_sfcr: "Liste SFCR CAA",
  caa_register: "Registre CAA",
  manual: "Ajout manuel",
};

/** Étiquette courte affichée à côté du nom d'une compagnie hors listes SFCR. */
export function perimeterBadge(e: Entity) {
  if (e.source === "caa_sfcr") return null;
  return `${CATEGORY_LABEL[e.category]} · ${e.source === "manual" ? "ajout manuel" : "registre CAA"}`;
}
