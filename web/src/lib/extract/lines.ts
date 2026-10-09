// Texte positionné et regroupement en lignes (sans dépendance au navigateur).
export interface Item {
  str: string;
  x: number;   // bord gauche
  x2: number;  // bord droit
  y: number;   // ligne de base, origine en haut de page
  h: number;
}

export interface PageText {
  page: number; // 1-based
  items: Item[];
  text: string;
}

/** Regroupe les éléments en lignes (même ordonnée, tolérance relative à la hauteur). */
export function groupLines(items: Item[]): Item[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= Math.max(2, Math.min(last[0].h, it.h) * 0.45)) last.push(it);
    else lines.push([it]);
  }
  for (const l of lines) l.sort((a, b) => a.x - b.x);
  return lines;
}

