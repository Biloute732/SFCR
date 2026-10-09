import { Composition, Folder } from "remotion";
import { SfcrVideo } from "./SfcrVideo";
import { Analyse } from "./scenes/Analyse";
import { Collecte } from "./scenes/Collecte";
import { Controles } from "./scenes/Controles";
import { Extraction } from "./scenes/Extraction";
import { Intro } from "./scenes/Intro";
import { Outro } from "./scenes/Outro";
import { Probleme } from "./scenes/Probleme";
import { Revue } from "./scenes/Revue";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="ComparateurSFCR" component={SfcrVideo} durationInFrames={1800} fps={30} width={1920} height={1080} />
      <Folder name="Scenes">
        <Composition id="Intro" component={Intro} durationInFrames={210} fps={30} width={1920} height={1080} />
        <Composition id="Probleme" component={Probleme} durationInFrames={210} fps={30} width={1920} height={1080} />
        <Composition id="Collecte" component={Collecte} durationInFrames={270} fps={30} width={1920} height={1080} />
        <Composition id="Extraction" component={Extraction} durationInFrames={270} fps={30} width={1920} height={1080} />
        <Composition id="Controles" component={Controles} durationInFrames={270} fps={30} width={1920} height={1080} />
        <Composition id="Revue" component={Revue} durationInFrames={210} fps={30} width={1920} height={1080} />
        <Composition id="Analyse" component={Analyse} durationInFrames={300} fps={30} width={1920} height={1080} />
        <Composition id="Fin" component={Outro} durationInFrames={144} fps={30} width={1920} height={1080} />
      </Folder>
    </>
  );
};
