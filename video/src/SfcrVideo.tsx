import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { interpolate, staticFile } from "remotion";
import { Analyse } from "./scenes/Analyse";
import { Collecte } from "./scenes/Collecte";
import { Controles } from "./scenes/Controles";
import { Extraction } from "./scenes/Extraction";
import { Intro } from "./scenes/Intro";
import { Outro } from "./scenes/Outro";
import { Probleme } from "./scenes/Probleme";
import { Revue } from "./scenes/Revue";

// 8 scènes (1 884 images) − 7 transitions de 12 images = 1 800 images = 60 s à 30 i/s
export const SfcrVideo: React.FC = () => {
  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={210} name="Intro">
          <Intro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={210} name="Problème">
          <Probleme />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={270} name="Collecte">
          <Collecte />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={270} name="Extraction">
          <Extraction />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={270} name="Contrôles">
          <Controles />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={210} name="Revue">
          <Revue />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={300} name="Analyse">
          <Analyse />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={144} name="Fin">
          <Outro />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      {/* Extrait de 61 s pris à 0:08 de l'enregistrement, fondu d'entrée et de sortie */}
      <Audio
        name="Chevauchée des Walkyries"
        src={staticFile("walkyries-extrait.wav")}
        volume={(f) => interpolate(f, [0, 15, 1740, 1800], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
      />
    </>
  );
};
