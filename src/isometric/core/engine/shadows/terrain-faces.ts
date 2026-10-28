import {
  BufferImageSource,
  Container,
  type Filter,
  Matrix,
  MeshSimple,
  Rectangle,
  RenderTexture,
  type Renderer,
  Sprite,
  Texture,
} from "pixi.js";
import { getFaceShadowUvs, type TerrainShadowFace, type TerrainShadowSampler } from "../lighting";
import { projectBoxesToIsometric, projectGridPoint } from "../projection";
import { getBlockDepth } from "../render";
import { SCENE_LAYER, type SceneView } from "../scene";
import type { IsoProjectionConfig, ShadowProjection, TileMetrics, WorldRect } from "../../types";

const PIXELS = 24;
const STRIDE = 30;
const COLUMNS = 32;
const SAMPLE_SCALE = 3;

/** Baked wall atlas. Mesh UVs sample entity shadows on the wall; terrain rays join before opacity is applied. */
export type TerrainFaceShadows = {
  readonly views: readonly SceneView[];
  readonly levels: readonly number[];
  clear(): void;
  begin(): void;
  commit(): void;
  cancel(): void;
  draw(level: number, light: ShadowProjection): void;
  destroy(destroyViews?: boolean): void;
};

/** Shares a scratch shadow plane with the top-face baker; all meshes draw offscreen, views remain batched sprites. */
export function createTerrainFaceShadows(
  inputFaces: readonly TerrainShadowFace[],
  context: {
    readonly renderer: Renderer;
    readonly scratch: Texture;
    readonly filters: readonly Filter[];
    readonly area: WorldRect;
    readonly projection: IsoProjectionConfig;
    readonly metrics: TileMetrics;
    readonly sampleTerrain?: TerrainShadowSampler;
  },
): TerrainFaceShadows {
  const { renderer, scratch, filters, area, projection, metrics, sampleTerrain } = context;
  // Pack a receiver plane's wall tiles together: filters process its rows, never the entire atlas.
  const faces = [...inputFaces].sort((a, b) => a.bottom - b.bottom);
  if (faces.length === 0)
    return {
      views: [],
      levels: [],
      clear: () => {},
      begin: () => {},
      commit: () => {},
      cancel: () => {},
      draw: () => {},
      destroy: () => {},
    };
  const width = COLUMNS * STRIDE;
  const height = Math.max(1, Math.ceil(faces.length / COLUMNS)) * STRIDE;
  const atlas = RenderTexture.create({ width, height });
  let work: RenderTexture | undefined;
  let working = false;
  const copy = new Sprite();
  const maskWidth = width / SAMPLE_SCALE;
  const pixels = new Uint8ClampedArray(maskWidth * (height / SAMPLE_SCALE) * 4);
  const maskSource = new BufferImageSource({ resource: pixels, width: maskWidth, height: height / SAMPLE_SCALE });
  const mask = new Texture({ source: maskSource });
  const root = new Container();
  root.filters = [...filters];
  root.filterArea = new Rectangle(0, 0, width, height);
  const maskSprite = new Sprite(mask);
  maskSprite.scale.set(SAMPLE_SCALE);
  root.addChild(maskSprite);
  const empty = new Container();
  const meshes = faces.map((_face, index) => {
    const x = (index % COLUMNS) * STRIDE + 3;
    const y = Math.floor(index / COLUMNS) * STRIDE + 3;
    const mesh = new MeshSimple({
      texture: scratch,
      vertices: new Float32Array([x, y, x + PIXELS, y, x + PIXELS, y + PIXELS, x, y + PIXELS]),
      uvs: new Float32Array(8),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    mesh.autoUpdate = false;
    return mesh;
  });
  root.addChild(...meshes);
  const views = faces.map((face, index) => {
    const frame = new Texture({
      source: atlas.source,
      frame: new Rectangle((index % COLUMNS) * STRIDE + 3, Math.floor(index / COLUMNS) * STRIDE + 3, PIXELS, PIXELS),
    });
    const sprite = new Sprite(frame);
    const start = projectGridPoint({ x: face.x - 0.5, y: face.y - 0.5 }, projection);
    const end = projectGridPoint(
      { x: face.x + (face.axis === "x" ? -0.5 : 0.5), y: face.y + (face.axis === "y" ? -0.5 : 0.5) },
      projection,
    );
    sprite.setFromMatrix(
      new Matrix(
        (end.x - start.x) / PIXELS,
        (end.y - start.y) / PIXELS,
        0,
        ((face.top - face.bottom) * metrics.boxHeight) / PIXELS,
        start.x,
        start.y - face.top * metrics.boxHeight,
      ),
    );
    const [projected] = projectBoxesToIsometric(
      [{ x: face.x, y: face.y, elevation: Math.ceil(face.top), metadata: {} }],
      projection,
    );
    return { view: sprite, depth: getBlockDepth(projected, metrics), layer: SCENE_LAYER.ground };
  });
  const levels = [...new Set(faces.map(({ bottom }) => bottom))];
  const point = { x: 0, y: 0, elevation: 0 };
  return {
    views,
    levels,
    clear: () =>
      renderer.render({ container: empty, target: working ? work : atlas, clear: true, clearColor: [0, 0, 0, 0] }),
    begin() {
      work ??= RenderTexture.create({ width, height });
      working = true;
      renderer.render({ container: empty, target: work, clear: true, clearColor: [0, 0, 0, 0] });
    },
    commit() {
      if (!working) return;
      copy.texture = work!;
      renderer.render({ container: copy, target: atlas, clear: true, clearColor: [0, 0, 0, 0] });
      working = false;
    },
    cancel() {
      working = false;
    },
    draw(level, light) {
      const first = faces.findIndex((face) => face.bottom === level);
      if (first < 0) return;
      let last = faces.length - 1;
      while (faces[last].bottom !== level) last -= 1;
      const sameRow = Math.floor(first / COLUMNS) === Math.floor(last / COLUMNS);
      const left = sameRow ? (first % COLUMNS) * STRIDE : 0;
      const right = sameRow ? ((last % COLUMNS) + 1) * STRIDE : width;
      const top = Math.floor(first / COLUMNS) * STRIDE;
      const bottom = (Math.floor(last / COLUMNS) + 1) * STRIDE;
      root.filterArea = new Rectangle(left, top, right - left, bottom - top);
      pixels.fill(0);
      faces.forEach((face, index) => {
        const shows = face.bottom === level;
        meshes[index].visible = shows;
        if (!shows) return;
        const uvs = meshes[index].geometry.uvs;
        getFaceShadowUvs(face, light, area, uvs);
        meshes[index].geometry.getBuffer("aUV").update();
        const left = (index % COLUMNS) * (STRIDE / SAMPLE_SCALE) + 1;
        const top = Math.floor(index / COLUMNS) * (STRIDE / SAMPLE_SCALE) + 1;
        if (!sampleTerrain) return;
        for (let y = 0; y < 8; y += 1)
          for (let x = 0; x < 8; x += 1) {
            const along = (x + 0.5) / 8 - 0.5;
            point.x = face.x + (face.axis === "x" ? -0.501 : along);
            point.y = face.y + (face.axis === "y" ? -0.501 : along);
            point.elevation = face.top - ((y + 0.5) / 8) * (face.top - face.bottom);
            pixels[((top + y) * maskWidth + left + x) * 4 + 3] = sampleTerrain(point, light) * 255;
          }
      });
      maskSource.update();
      renderer.render({ container: root, target: working ? work : atlas, clear: false });
    },
    destroy(destroyViews = true) {
      const geometries = meshes.map((mesh) => mesh.geometry);
      root.destroy({ children: true });
      geometries.forEach((geometry) => geometry.destroy(true));
      empty.destroy();
      atlas.destroy(true);
      work?.destroy(true);
      copy.destroy({ texture: false });
      mask.destroy(true);
      if (destroyViews) views.forEach(({ view }) => view.destroy({ texture: false }));
    },
  };
}
