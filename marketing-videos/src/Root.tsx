import { Composition } from "remotion";
import { FarmersMarketDetour } from "./FarmersMarketDetour";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="FarmersMarketDetour"
        component={FarmersMarketDetour}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
