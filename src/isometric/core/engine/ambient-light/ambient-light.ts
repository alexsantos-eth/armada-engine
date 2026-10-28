import { createPhaseLighting, type PhaseLighting } from "../lighting";
import { rgbToTint } from "../render";
import type { SceneModule } from "../scene";

/** Applies the authored phase grade to the render group on the GPU, only when its packed tint changes. */
export function createAmbientLight(lighting: PhaseLighting = createPhaseLighting()): SceneModule {
  return {
    id: "ambient-light",
    setup({ root }) {
      const apply = () => {
        const tint = rgbToTint(lighting.current.ambient);
        if (root.tint !== tint) root.tint = tint;
      };
      return {
        start: apply,
        update: ({ elapsedMs }) => {
          lighting.advance(elapsedMs);
          apply();
        },
        destroy: () => {},
      };
    },
  };
}
