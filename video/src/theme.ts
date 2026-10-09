import { loadFont } from "@remotion/google-fonts/Archivo";
import { Easing, interpolate } from "remotion";

// Police et couleurs du design system FORSIDES (web/src/styles/modernist.css)
export const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "800"],
  subsets: ["latin", "latin-ext"],
});

export const C = {
  bg: "#f3f2f2",
  surface: "#eae9e9",
  ink: "#201e1d",
  accent: "#ec3013",
  muted: "#7d7979",
};

/** Apparition d'un élément de liste à partir de `start` (en images). */
export const enter = (frame: number, start: number) =>
  interpolate(frame, [start, start + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
