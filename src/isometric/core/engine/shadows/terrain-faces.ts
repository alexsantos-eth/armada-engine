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
import {
  createWallShadowProjector,
  getShadowReach,
  sampleTerrainHorizon,
  type TerrainShadowFace,
  type TerrainShadowSampler,
} from "../lighting";
import type { Silhouette } from "./silhouette";
import { projectBoxesToIsometric, projectGridPoint } from "../projection";
import { getBlockDepth } from "../render";
import { SCENE_LAYER, type SceneView } from "../scene";
import type { IsoProjectionConfig, ShadowProjection, TileMetrics } from "../../types";

const PIXELS = 24;
const STRIDE = 30;
const COLUMNS = 32;
const SAMPLE_SCALE = 3;

/** Baked wall atlas. Sun rays intersect each wall directly; terrain joins the same mask before grading. */
export type TerrainFaceShadows = {
  readonly views: readonly SceneView[];
  readonly levels: readonly number[];
  clear(): void;
  begin(): void;
  commit(opacity?: number): void;
  cancel(): void;
  draw(level: number | null, light: ShadowProjection, casters?: readonly Silhouette[], lifts?: readonly number[]): void;
  destroy(destroyViews?: boolean): void;
};

/** Clips caster polygons to wall receivers. Meshes stay offscreen; scene views remain batched atlas sprites. */
export function createTerrainFaceShadows(
  inputFaces: readonly TerrainShadowFace[],
  context: {
    readonly renderer: Renderer;
    readonly filters: readonly Filter[];
    readonly projection: IsoProjectionConfig;
    readonly metrics: TileMetrics;
    readonly sampleTerrain?: TerrainShadowSampler;
    readonly isVisible?: (view: Sprite) => boolean;
  },
): TerrainFaceShadows {
  const { renderer, filters, projection, metrics, sampleTerrain } = context;
  const isVisible = context.isVisible ?? ((view: Sprite) => !view.culled);
  // Stable slots support replacing individual planes and baking the complete wall atlas in one pass.
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
  copy.filters = [...filters];
  copy.filterArea = new Rectangle(0, 0, width, height);
  root.filterArea = new Rectangle(0, 0, width, height);
  const maskSprite = new Sprite(mask);
  maskSprite.scale.set(SAMPLE_SCALE);
  root.addChild(maskSprite);
  const empty = new Container();
  const meshes: MeshSimple[] = [];
  const projector = createWallShadowProjector(metrics);
  const indices = new Uint32Array(30);
  for (let triangle = 0; triangle < 10; triangle += 1) {
    indices[triangle * 3 + 1] = triangle + 1;
    indices[triangle * 3 + 2] = triangle + 2;
  }
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
  // Replace only this plane's padded slots; another plane can share the same atlas row.
  const erase = new Container();
  const erasers = faces.map((_face, index) => {
    const sprite = new Sprite(Texture.WHITE);
    sprite.position.set((index % COLUMNS) * STRIDE, Math.floor(index / COLUMNS) * STRIDE);
    sprite.width = STRIDE;
    sprite.height = STRIDE;
    sprite.blendMode = "erase";
    erase.addChild(sprite);
    return sprite;
  });
  const paint = new Container();
  paint.addChild(erase, root);
  const levels = [...new Set(faces.map(({ bottom }) => bottom))];
  const point = { x: 0, y: 0, elevation: 0 };
  const horizon = { elevation: 0, width: 0.1 };
  let terrainLight: ShadowProjection | undefined;
  let terrainLevel: number | null | undefined;
  const visibility = new Uint8Array(faces.length);
  const candidates = new WeakMap<Silhouette, { elevation: number; faces: number[] }>();
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
    commit(opacity = 1) {
      if (!working) return;
      copy.texture = work!;
      copy.alpha = opacity;
      renderer.render({ container: copy, target: atlas, clear: true, clearColor: [0, 0, 0, 0] });
      working = false;
    },
    cancel() {
      working = false;
    },
    draw(level, light, casters = [], lifts = []) {
      const first = level === null ? 0 : faces.findIndex((face) => face.bottom === level);
      if (first < 0) return;
      let last = faces.length - 1;
      while (level !== null && faces[last].bottom !== level) last -= 1;
      const sameRow = Math.floor(first / COLUMNS) === Math.floor(last / COLUMNS);
      const left = sameRow ? (first % COLUMNS) * STRIDE : 0;
      const right = sameRow ? ((last % COLUMNS) + 1) * STRIDE : width;
      const top = Math.floor(first / COLUMNS) * STRIDE;
      const bottom = (Math.floor(last / COLUMNS) + 1) * STRIDE;
      root.filterArea = new Rectangle(left, top, right - left, bottom - top);
      let terrainChanged = terrainLight !== light || terrainLevel !== level;
      views.forEach(({ view }, index) => {
        const visible = Number(isVisible(view));
        if (visibility[index] !== visible) terrainChanged = true;
        visibility[index] = visible;
      });
      if (terrainChanged) pixels.fill(0);
      meshes.forEach((mesh) => {
        mesh.visible = false;
      });
      let shown = 0;
      const paintCaster = (face: TerrainShadowFace, index: number, caster: Silhouette, casterIndex: number) => {
        const count = projector(face, caster, (level ?? 0) + (lifts[casterIndex] ?? 0), light);
        if (count === 0) return;
        let mesh = meshes[shown];
        if (!mesh) {
          mesh = new MeshSimple({
            texture: caster.texture,
            vertices: new Float32Array(24),
            uvs: new Float32Array(24),
            indices,
          });
          mesh.autoUpdate = false;
          mesh.tint = 0;
          meshes.push(mesh);
          root.addChild(mesh);
        }
        mesh.texture = caster.texture;
        const vertices = mesh.geometry.positions;
        const uvs = mesh.geometry.uvs;
        for (let vertex = 0; vertex < 12; vertex += 1) {
          const source = vertex < count ? vertex : 0;
          vertices[vertex * 2] = (index % COLUMNS) * STRIDE + 3 + projector.positions[source * 2] * PIXELS;
          vertices[vertex * 2 + 1] =
            Math.floor(index / COLUMNS) * STRIDE + 3 + projector.positions[source * 2 + 1] * PIXELS;
          uvs[vertex * 2] = projector.uvs[source * 2];
          uvs[vertex * 2 + 1] = projector.uvs[source * 2 + 1];
        }
        mesh.geometry.getBuffer("aPosition").update();
        mesh.geometry.getBuffer("aUV").update();
        mesh.visible = true;
        shown += 1;
      };
      casters.forEach((caster, casterIndex) => {
        const elevation = (level ?? 0) + (lifts[casterIndex] ?? 0);
        let nearby = candidates.get(caster);
        if (!nearby || nearby.elevation !== elevation) {
          const across =
            (Math.max(
              Math.abs(caster.display.left - caster.screenFoot.x),
              Math.abs(caster.display.left + caster.display.width - caster.screenFoot.x),
            ) *
              Math.SQRT2) /
            metrics.tileWidth;
          const indices: number[] = [];
          faces.forEach((face, index) => {
            const reach =
              getShadowReach(caster.screenFoot.y - caster.display.top, elevation - face.bottom, metrics) + across + 1;
            const dx = face.x - caster.worldFoot.x,
              dy = face.y - caster.worldFoot.y;
            if (dx * dx + dy * dy <= reach * reach) indices.push(index);
          });
          nearby = { elevation, faces: indices };
          candidates.set(caster, nearby);
        }
        for (const index of nearby.faces) {
          const face = faces[index];
          if (isVisible(views[index].view) && (level === null || face.bottom === level))
            paintCaster(face, index, caster, casterIndex);
        }
      });
      faces.forEach((face, index) => {
        const shows = isVisible(views[index].view) && (level === null || face.bottom === level);
        erasers[index].visible = shows;
        if (!shows) return;
        const left = (index % COLUMNS) * (STRIDE / SAMPLE_SCALE) + 1;
        const top = Math.floor(index / COLUMNS) * (STRIDE / SAMPLE_SCALE) + 1;
        if (!sampleTerrain || !terrainChanged) return;
        for (let x = 0; x < 8; x += 1) {
          const along = (x + 0.5) / 8 - 0.5;
          point.x = face.x + (face.axis === "x" ? -0.501 : along);
          point.y = face.y + (face.axis === "y" ? -0.501 : along);
          const skyline = sampleTerrain.horizon?.(point.x, point.y, light, horizon);
          for (let y = 0; y < 8; y += 1) {
            point.elevation = face.top - ((y + 0.5) / 8) * (face.top - face.bottom);
            const coverage = skyline ? sampleTerrainHorizon(skyline, point.elevation) : sampleTerrain(point, light);
            pixels[((top + y) * maskWidth + left + x) * 4 + 3] = coverage * 255;
          }
        }
      });
      if (terrainChanged) {
        maskSource.update();
        terrainLight = light;
        terrainLevel = level;
      }
      renderer.render({ container: paint, target: working ? work : atlas, clear: false });
    },
    destroy(destroyViews = true) {
      const geometries = meshes.map((mesh) => mesh.geometry);
      paint.destroy({ children: true });
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
