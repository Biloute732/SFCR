import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Legal, PageHead } from "../components/ui";

const STEPS: { n: string; title: string; to: string; screen: string; body: ReactNode }[] = [
  {
    n: "1", title: "Collecter les SFCR", to: "/collecte", screen: "Collecte",
    body: <>
      <p><strong>Lancer une collecte</strong> (accueil) lit les trois listes SFCR du CAA (Vie, Non-Vie, Groupes) puis télécharge le dernier SFCR de chaque entité. Les requêtes sont espacées et le robots.txt de chaque site est respecté.</p>
      <p>Dans l'écran Collecte, <strong>Reprendre l'historique</strong> cherche les SFCR manquants des années réglées dans Paramètres, sur le site de chaque compagnie, puis dans les archives web. Les boutons <em>Relancer</em> et <em>Historique</em> d'une ligne ne traitent qu'une entité.</p>
      <p>Collecte automatique : 15 avril (solo), 31 mai (groupes), 30 juin (retardataires).</p>
      <p><strong>Réassureurs et captives</strong> : la lecture des listes lit aussi les registres des entreprises agréées du CAA (réassurance, assureurs directs). Ces registres ne donnent pas de lien vers les SFCR : importez leurs PDF (rattachement automatique par LEI) ou saisissez la page SFCR sur la fiche (<em>Modifier la fiche</em>). Une compagnie absente de toutes les listes s'ajoute avec <em>Ajouter une compagnie</em> sur l'accueil. Le filtre <em>Périmètre</em> sépare listes SFCR, réassurance, captives et ajouts manuels.</p>
    </>,
  },
  {
    n: "2", title: "Importer les SFCR manquants", to: "/import", screen: "Import en lot",
    body: <>
      <p>Certains sites interdisent la collecte automatique (alerte « robots.txt ») ou n'ont pas de lien. Téléchargez ces PDF vous-même puis déposez-les, en vrac ou en dossier, dans <strong>Import en lot</strong>.</p>
      <p>Chaque fichier est rattaché automatiquement : entité par LEI ou par nom, année lue dans le document. Un fichier déjà importé n'est pas dupliqué. Les <strong>cas incertains</strong> s'affichent en bas : choisissez l'entité et l'année, puis <em>Confirmer</em>.</p>
    </>,
  },
  {
    n: "3", title: "Extraire les QRT", to: "/collecte", screen: "Collecte",
    body: <>
      <p>Les PDF collectés sont « à extraire ». Cliquez sur <strong>Extraire N PDF en attente</strong> et laissez l'onglet ouvert : l'extraction tourne dans le navigateur, avec la progression affichée (1 à 2 s par SFCR, plusieurs minutes pour un PDF scanné, lu par reconnaissance de texte).</p>
      <p>Une entité dont un QRT attendu est introuvable est signalée « QRT manquant ». Un QRT non applicable (groupe en méthode 2, par exemple) n'est pas compté comme manquant.</p>
    </>,
  },
  {
    n: "4", title: "Valider l'unité, puis revoir les écarts", to: "/revue", screen: "File de revue",
    body: <>
      <p>Tant que l'unité d'un SFCR n'est pas validée, <strong>aucun de ses chiffres n'apparaît dans les analyses</strong>.</p>
      <ol>
        <li><strong>Unité et devise</strong> : vérifiez l'extrait proposé (bouton <em>voir p. N</em> pour ouvrir le PDF à la bonne page), corrigez si besoin (euros, milliers, millions ; devise) puis cliquez sur <em>Valider</em>. Pour une autre devise que l'euro, le cours BCE du 31/12 est appliqué automatiquement.</li>
        <li><strong>Cellules en échec</strong> : seules les cellules qui ratent un contrôle de cohérence sont listées. Cliquez sur une ligne pour afficher la page du PDF, puis <em>Confirmer la valeur</em> ou saisissez la bonne valeur (en kEUR, ou en % pour un ratio) et <em>Corriger</em>. Le motif est obligatoire et chaque correction est journalisée.</li>
      </ol>
      <p>Un QRT publié en annexe séparée se rattache via <em>Joindre une annexe QRT (PDF ou Excel)</em>. Le compteur « QRT en revue » doit rester sous 10 % : au-delà, l'extracteur est à corriger.</p>
    </>,
  },
  {
    n: "5", title: "Consulter une compagnie", to: "/", screen: "Compagnies → fiche",
    body: <>
      <p>Les pastilles d'années indiquent l'état de chaque exercice : <span className="ychip y-validated">2025</span> validé, <span className="ychip y-review">2025</span> en revue, <span className="ychip y-collecting">2025</span> en collecte, <span className="ychip y-not_found">2025</span> introuvable. Seules les années validées servent aux analyses.</p>
      <p>La fiche affiche les indicateurs clés, les variations N / N-1, la liste des QRT (cliquez un code pour le tableau complet, valeurs normalisées et brutes), les versions des documents et, pour un groupe, ses filiales. Pour un groupe sans LEI ou une fusion, utilisez <em>Modifier la fiche</em> (LEI, successeur, méthode de calcul). Signalez un passage en modèle interne dans <em>Ruptures de méthode</em> : il apparaîtra sur les courbes.</p>
    </>,
  },
  {
    n: "6", title: "Comparer et exporter", to: "/comparaison", screen: "Comparaison",
    body: <>
      <p>Sur l'accueil, cochez 2 à 10 entités <strong>du même niveau</strong> (solo ou groupe), puis <strong>Comparer →</strong>. Choisissez l'exercice. Solvabilité et bilan se comparent toujours ; primes, provisions et ratios techniques seulement entre entités de la même branche (filtre Vie / Non-Vie).</p>
      <p>La colonne <em>Médiane de référence</em> porte par défaut sur les entités comparables des listes SFCR du CAA (marché luxembourgeois), avec leur nombre ; le menu <em>Médiane</em> permet de la calculer sur toute la base (tous pays) ou sur les seules entités d'un pays soumis à Solvabilité 2. Le filtre <em>Pays</em> (accueil, Comparaison, Évolution) restreint les compagnies proposées au pays de leur siège. Cliquez une ligne pour la tracer en barres. <strong>Exporter en Excel</strong> produit une synthèse et une feuille de traçabilité : cellule, page, URL et date de collecte de chaque chiffre.</p>
    </>,
  },
  {
    n: "7", title: "Suivre une tendance", to: "/evolution", screen: "Évolution",
    body: <p>Choisissez un indicateur et ajoutez une ou plusieurs entités. Une année manquante apparaît comme un <strong>trou</strong> dans la courbe, jamais comme un zéro ; les ruptures de méthode sont marquées par une ligne rouge pointillée. Export Excel disponible.</p>,
  },
];

const RULES: [string, string][] = [
  ["— (tiret long)", "Valeur non publiée ou non validée. Jamais un zéro."],
  ["0", "Zéro réellement publié dans le QRT."],
  ["Valeur soulignée en pointillé", "Cliquez : une valeur publiée ouvre le PDF à la bonne page ; un indicateur calculé montre sa formule et ses cellules sources."],
  ["kEUR / MEUR", "Stockage toujours en kEUR. Changez l'affichage dans Paramètres."],
  ["Ratios", "En %, jamais convertis ; écarts exprimés en points."],
  ["Mixte", "Entité Vie et Non-Vie : ses indicateurs de solvabilité et de bilan apparaissent dans les deux vues avec la mention « Mixte »."],
];

export default function Help() {
  return (
    <main className="page">
      <PageHead kicker="Aide" title="Notice d'utilisation"
        intro="Le parcours type, de la collecte à l'export. Règle d'or : un chiffre non validé n'apparaît nulle part dans une analyse." />

      {STEPS.map((s) => (
        <section key={s.n} className="section help-row">
          <div>
            <h6 style={{ color: "var(--color-accent-700)", margin: 0 }}>Étape {s.n}</h6>
            <h3 style={{ margin: "var(--space-1) 0" }}>{s.title}</h3>
            <Link to={s.to} className="small">→ {s.screen}</Link>
          </div>
          <div style={{ maxWidth: 760 }}>{s.body}</div>
        </section>
      ))}

      <section className="section help-row">
        <div><h6 style={{ color: "var(--color-accent-700)", margin: 0 }}>Repères</h6><h3 style={{ margin: "var(--space-1) 0" }}>Lire les chiffres</h3></div>
        <table className="table" style={{ maxWidth: 760 }}>
          <tbody>{RULES.map(([k, v]) => <tr key={k}><td className="nowrap" style={{ fontWeight: 600 }}>{k}</td><td>{v}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="section help-row">
        <div><h6 style={{ color: "var(--color-accent-700)", margin: 0 }}>Entretien</h6><h3 style={{ margin: "var(--space-1) 0" }}>Nettoyer la base</h3><Link to="/parametres" className="small">→ Paramètres</Link></div>
        <div style={{ maxWidth: 760 }}>
          <p><strong>Supprimer les données de démonstration</strong> retire les entités fictives « Démo ». <strong>Refaire l'extraction</strong> garde les PDF mais efface cellules, validations et corrections. <strong>Tout effacer</strong> repart d'une base vide. Ces actions sont irréversibles et demandent de taper un mot de confirmation.</p>
        </div>
      </section>

      <section className="section help-row">
        <div><h6 style={{ color: "var(--color-accent-700)", margin: 0 }}>Accès</h6><h3 style={{ margin: "var(--space-1) 0" }}>Administrateurs et utilisateurs</h3><Link to="/parametres" className="small">→ Paramètres</Link></div>
        <div style={{ maxWidth: 760 }}>
          <p><strong>Administrateur</strong> : tout l'outil (collecte, import, file de revue, corrections, fiches, réinitialisations, années d'analyse) et la gestion des accès. <strong>Utilisateur</strong> : consultation des compagnies et des QRT, comparaison, évolution et export Excel ; les étapes 1 à 4 ci-dessus ne lui sont pas proposées.</p>
          <p>Un administrateur ajoute une personne dans <em>Paramètres → Utilisateurs et accès</em> : un mot de passe provisoire est généré, à transmettre par un canal sûr ; il doit être changé à la première connexion. Le rôle se change d'un clic ; il reste toujours au moins un administrateur. Chacun garde ses préférences d'affichage (kEUR / MEUR, indicateurs favoris) et peut changer son mot de passe.</p>
        </div>
      </section>
      <Legal />
    </main>
  );
}
