import { BufferImageSource, Container, Graphics, Sprite, Texture } from "pixi.js";
import { getGroundPointBelow } from "../camera";
import {
  getPlayerClimbProgress,
  getPlayerColumn,
  getPlayerFacing,
  getPlayerJumpPhase,
  getPlayerRenderPosition,
  isPlayerRunning,
  isPlayerSkidding,
  PLAYER_FACINGS,
  PLAYER_PART,
} from "../player";
import { projectBoxesToIsometric, projectGridPoint } from "../projection";
import { createBlockViews, getBlockDepth, getSheetFrames, showFrame } from "../render";
import { SCENE_LAYER, type BuiltScene, type SceneModule } from "../scene";
import type { GridPoint, PlayerAppearance, PlayerRenderPosition } from "../../types";
import {
  DANCE_DELAY_MS,
  getBodyShape,
  getIdleDance,
  getSideLeanShare,
  getLeanTarget,
  stepBodyLean,
  type BodyLean,
} from "./body-motion";
import { DUST_MIN_IMPACT, getBodyScale, getDust, getVoxelFaces } from "./feedback";
import {
  getClimbPose,
  getClimbSheetLayout,
  getIdlePose,
  getIdleSheetLayout,
  getJumpPose,
  getJumpSheetLayout,
  getWalkPose,
  getWalkSheetCell,
  getWalkSheetLayout,
  PLAYER_START_FACING,
} from "./walk";

const TERRAIN_SHADOW_BANDS = 16;

/** The body's own shape, without a dance. */
const UPRIGHT: GridPoint = { x: 1, y: 1 };
const SHADOW_COLUMNS = 8;

/** Colours of the dust it raises, nearly white: the lit top of each voxel, its left side and its right side. */
const DUST_COLORS = { top: 0xfbf9f4, left: 0xe6e2d8, right: 0xcfcabd };

/**
 * Voxels of a puff of dust, back to front: bottom centre (in tiles across and down from the feet)
 * and size (in tiles).
 */
const DUST_VOXELS: ReadonlyArray<readonly [number, number, number]> = [
  [-0.03, -0.07, 0.04],
  [0.09, -0.055, 0.05],
  [-0.06, -0.04, 0.06],
  [0.17, -0.02, 0.045],
  [-0.19, -0.01, 0.05],
  [-0.13, 0, 0.08],
  [0.13, 0, 0.08],
  [0.03, 0.02, 0.05],
  [0.07, 0.035, 0.07],
  [-0.1, 0.04, 0.055],
  [0.16, 0.05, 0.04],
  [0, 0.06, 0.06],
];

/** Voxels of the small puff a running player kicks up, back to front, like {@link DUST_VOXELS}. */
const RUN_DUST_VOXELS: ReadonlyArray<readonly [number, number, number]> = [
  [0.05, -0.03, 0.04],
  [-0.07, 0, 0.05],
  [0.08, 0.02, 0.045],
  [-0.01, 0.04, 0.04],
];

/** Columns a running player covers between two puffs of dust. */
const RUN_DUST_EVERY = 0.7;

/** Columns a skidding player slides between two puffs of dust: more often than running. */
const SKID_DUST_EVERY = 0.2;

/** Puffs of running or skidding dust drawn at most at once (reused in turn). */
const RUN_PUFFS = 6;

/**
 * How fast its feet pedal while it skids, as columns of walk cycle per column slid: let go, they run
 * backwards against the slide; held the other way, they run that way while it slides on.
 */
const SKID_PEDAL = 2;

/**
 * How the player view answers what the player does (`createPlayerView()`). Every field is optional;
 * the game sets them from its launch options (`?effects=off`) and the reduced-motion preference.
 */
export type PlayerViewOptions = {
  /** Squash and stretch at take-off and landing, and dust. Defaults to `true`. */
  readonly effects?: boolean;
};

/**
 * Scene module of the player: draws the world's player (`PLAYER_PART`) with `appearance` (game
 * content) as one sprite, at `appearance.scale` of its tile about its feet, never culled (the
 * camera keeps it on screen). Every frame it places the sprite between the player's last two
 * ticks (`frame.alpha`) and, when it moved, tells the `camera` (if any) to follow it. The sprite
 * moves in the draw order only when the player enters another column or elevation (`placeAt()`,
 * at the depth of that column's top) or crosses the middle of its column: behind it (further from
 * the camera, `x + y` above the column's) it goes on the column's top but before what stands
 * there (`move()` to `SCENE_LAYER.behindObject`), so it walks behind a tree's trunk; in front,
 * after it. Never with `zIndex`. On a column with a `topInset` (sand) it stands that much lower (the
 * player's `inset`, which the simulation keeps so it falls onto that top instead of dropping there).
 * While it jumps or falls (`height`), the sprite and the feet it gives the shadow rise that many
 * blocks; its place in the draw order stays with the ground below it. The camera looks at the top it
 * stands on, or at its feet while they are below where they left the ground: a jump does not bob the
 * camera, and a fall to a lower top is followed as it falls, not in one jolt when it lands.
 *
 * With `effects`, it answers take-offs and landings from the counters in `player.feedback` (no
 * events): dust at a take-off and at a hard landing (`getDust()`), a stretch at take-off and a squash
 * at landing (`getBodyScale()`); and while it runs (`isPlayerRunning()`), a small puff of dust every
 * {@link RUN_DUST_EVERY} columns, every {@link SKID_DUST_EVERY} while it skids (`isPlayerSkidding()`).
 * Skidding, its feet pedal against the slide ({@link SKID_PEDAL}): backwards if it let go. Standing still with `appearance.dance`, it dances: on every beat
 * its weight lands on one foot and then the other, the body leaning over it and dipping
 * (`getIdleDance()`), on top of its idle sheet.
 *
 * With a walk sheet (`appearance.walk`) the sprite shows one of its cells: turned to the facing
 * nearest the way the player walks (`getPlayerFacing()`; standing, the last one, at first
 * `PLAYER_START_FACING`), the standing pose on a frame it did not move and, while it moves, the walk
 * pose for how far it has gone since it set off (`getWalkPose()`), so its feet keep pace with the
 * ground; in the air or just landed, with the sheet's `jump` sheet, the pose of its jump phase
 * (`getPlayerJumpPhase()`, `getJumpPose()`: take-off, rise, apex, fall, landing), or else the sheet's
 * `airPose`; standing still on the ground, with the sheet's `idle` sheet, the pose of its idle cycle
 * (breathing, looking around) for how long it has stood (`getIdlePose()`, by real time), from the
 * standing pose; climbing onto a higher top (`player.climb`), turned the way it climbs, with the
 * sheet's `climb` sheet, the pose for how far through the climb it is (`getPlayerClimbProgress()`,
 * `getClimbPose()`), or the standing pose without it, while the camera follows its feet up. Every cell is the same window of its canvas, so the sprite keeps its size and its
 * feet; its texture is written only when the cell changes. Without the sheet, or if it cannot be loaded,
 * the still `textureSource` is drawn.
 *
 * Its SVGs are rasterized at `appearance.scale` (`loadSvg()`'s `scale`), as small as it is drawn.
 *
 * Provides `focus` (the ground below the player), so the camera starts on it, and the player as
 * the one `movingCasters`, so `shadows` lays its shadow where its feet are drawn. When the world
 * has no player part or its SVG cannot be loaded, nothing is drawn or followed.
 */
export function createPlayerView(appearance: PlayerAppearance, options: PlayerViewOptions = {}): SceneModule {
  const { effects = true } = options;
  return {
    id: "player",
    async setup({ world, projection, metrics, columnAt, assets, services }) {
      const player = world.parts.find(PLAYER_PART);
      const sheet = appearance.walk;
      const scale = appearance.scale ?? 1;
      // Rasterized as small as it is drawn: the walk sheet at full size is tens of MB of texture.
      const sheetTexture = player && sheet && (await assets.loadSvg(sheet.source, { scale }));
      // The sheet and its cells by facing, then pose (column `0` standing), shared.
      const walk =
        sheet && sheetTexture ? { sheet, frames: getSheetFrames(sheetTexture, getWalkSheetLayout(sheet)) } : undefined;
      // Its idle cycle while it stands still, from a second sheet laid out like the first.
      const idleSheet = walk?.sheet.idle;
      const idleTexture = idleSheet && (await assets.loadSvg(idleSheet.source, { scale }));
      const idle =
        walk && idleSheet && idleTexture
          ? { sheet: idleSheet, frames: getSheetFrames(idleTexture, getIdleSheetLayout(walk.sheet, idleSheet)) }
          : undefined;
      // Its climb onto a higher top, from a third sheet laid out like the first.
      const climbSheet = walk?.sheet.climb;
      const climbTexture = climbSheet && (await assets.loadSvg(climbSheet.source, { scale }));
      const climb =
        walk && climbSheet && climbTexture
          ? { sheet: climbSheet, frames: getSheetFrames(climbTexture, getClimbSheetLayout(walk.sheet, climbSheet)) }
          : undefined;
      // Its jump, from a fourth sheet laid out like the first: take-off, rise, apex, fall, landing.
      const jumpSheet = walk?.sheet.jump;
      const jumpTexture = jumpSheet && (await assets.loadSvg(jumpSheet.source, { scale }));
      const jump =
        walk && jumpSheet && jumpTexture
          ? { sheet: jumpSheet, frames: getSheetFrames(jumpTexture, getJumpSheetLayout(walk.sheet, jumpSheet)) }
          : undefined;
      let facing = PLAYER_START_FACING;
      const texture =
        walk?.frames[facing][0] ?? (player && (await assets.loadSvg(appearance.textureSource, { scale })));
      if (!player || !texture) return { destroy: () => {} };

      // Blocks above elevation `0` the camera looks at: the top the player stands on or, while its
      // feet are below where they left the ground or it climbs, its feet.
      let level = player.elevation - player.inset;
      const ground = (at: PlayerRenderPosition) => {
        const top = at.elevation - at.inset;
        if (player.motion.type === "climbing") level = top + at.height;
        else level = at.height > 0 ? Math.min(level, top + at.height) : top;
        return getGroundPointBelow(at, level, projection);
      };
      const [projected] = projectBoxesToIsometric(
        [{ ...getPlayerColumn(player), elevation: player.elevation, metadata: {} }],
        projection,
      );
      const [{ view }] = createBlockViews({
        texture,
        box: projected,
        metrics,
        height: appearance.height ?? 1,
        surfaceAligned: true,
        cell: walk && getWalkSheetCell(walk.sheet),
      });
      if (!(view instanceof Sprite)) return { destroy: () => {} };
      view.cullable = false;
      // Scaled about the feet, which stand on the column's top (`projected.screenY`).
      view.scale.set(view.scale.x * scale, view.scale.y * scale);
      // Its scale before any squash or stretch.
      const base = { x: view.scale.x, y: view.scale.y };
      const terrainShadowOverlay = new Container();
      terrainShadowOverlay.alpha = 0;
      terrainShadowOverlay.visible = false;
      view.addChild(terrainShadowOverlay);
      const shadowPixels = new Uint8ClampedArray(SHADOW_COLUMNS * TERRAIN_SHADOW_BANDS * 4);
      const shadowSource = new BufferImageSource({
        resource: shadowPixels,
        width: SHADOW_COLUMNS,
        height: TERRAIN_SHADOW_BANDS,
      });
      const shadowTexture = new Texture({ source: shadowSource });
      const shadowBody = new Sprite();
      shadowBody.tint = 0x000000;
      const shadowMask = new Sprite(shadowTexture);
      shadowBody.setMask({ mask: shadowMask, channel: "alpha" });
      terrainShadowOverlay.addChild(shadowBody, shadowMask);
      let syncedTerrainTexture: Texture | undefined;
      const syncTerrainShadowOverlay = () => {
        if (syncedTerrainTexture === view.texture) return;
        syncedTerrainTexture = view.texture;
        const scaleX = Math.abs(view.scale.x) || 1;
        const scaleY = Math.abs(view.scale.y) || 1;
        const width = view.width / scaleX;
        const height = view.height / scaleY;
        shadowBody.texture = view.texture;
        for (const overlay of [shadowBody, shadowMask]) {
          overlay.position.set(-view.anchor.x * width, -view.anchor.y * height);
          overlay.width = width;
          overlay.height = height;
        }
      };
      syncTerrainShadowOverlay();
      const offset = { x: view.position.x - projected.screenX, y: (view.position.y - projected.screenY) * scale };

      let drawnAt = getPlayerRenderPosition(player, 1);
      // Columns walked since the player last stood still, for its walk pose, and real milliseconds
      // it has stood still on the ground, for its idle cycle and its dance.
      let walked = 0;
      let stood = 0;
      /**
       * Turns the sprite and picks its pose for a frame, `elapsedMs` after the last one, that draws it
       * at `at`, after `drawnAt`.
       */
      const animate = (at: PlayerRenderPosition, alpha: number, elapsedMs: number) => {
        const climbing = getPlayerClimbProgress(player, alpha);
        const walking =
          player.motion.type === "walking" || player.motion.type === "running" || player.motion.type === "skidding";
        const flying = player.motion.type === "jumping" || player.motion.type === "falling";
        const jumpPose = jump && getJumpPose(getPlayerJumpPhase(player), jump.sheet);
        stood = climbing !== undefined || walking || flying || jumpPose !== undefined ? 0 : stood + elapsedMs;
        if (!walk) return;
        facing = getPlayerFacing(player.climb?.direction ?? player.walk) ?? facing;
        if (climbing !== undefined) {
          walked = 0;
          showFrame(view, climb ? climb.frames[facing][getClimbPose(climbing, climb.sheet)] : walk.frames[facing][0]);
          return;
        }
        const moved = Math.hypot(at.x - drawnAt.x, at.y - drawnAt.y);
        // Skidding, the feet pedal against the slide (backwards, if it let go), as if trying to run.
        const skidding = isPlayerSkidding(player);
        const pedal = !skidding ? 1 : player.walk.x === 0 && player.walk.y === 0 ? -SKID_PEDAL : SKID_PEDAL;
        walked = walking ? walked + moved * pedal : 0;
        if (jump && jumpPose !== undefined) {
          showFrame(view, jump.frames[facing][jumpPose]);
          return;
        }
        if (idle && !walking && !flying) {
          // Dancing, its cycle is the dance's: standing until the dance starts, then in step with it.
          const ms = appearance.dance ? Math.max(0, stood - DANCE_DELAY_MS) : stood;
          showFrame(view, idle.frames[facing][getIdlePose(ms, idle.sheet)]);
          return;
        }
        const pose = flying ? (walk.sheet.airPose ?? 0) : walking ? getWalkPose(walked, walk.sheet) : 0;
        showFrame(view, walk.frames[facing][pose]);
      };
      // Where its feet are on screen: written by `place()`, read by whoever casts its shadow.
      const drawnFoot = { x: 0, y: 0 };
      const adaptedSamples = new Float32Array(SHADOW_COLUMNS * TERRAIN_SHADOW_BANDS);
      const receiveShadowGrid = (samples: ArrayLike<number>) => {
        terrainShadowOverlay.alpha = 1;
        let dirty = false;
        let visible = false;
        for (let row = 0; row < TERRAIN_SHADOW_BANDS; row += 1)
          for (let column = 0; column < SHADOW_COLUMNS; column += 1) {
            const alpha = Math.max(0, Math.min(1, samples[row * SHADOW_COLUMNS + column] ?? 0));
            const pixel = ((TERRAIN_SHADOW_BANDS - row - 1) * SHADOW_COLUMNS + column) * 4;
            const byte = Math.round(alpha * 255);
            if (shadowPixels[pixel + 3] !== byte) {
              shadowPixels[pixel + 3] = byte;
              dirty = true;
            }
            visible ||= alpha > 0.005;
          }
        if (dirty) shadowSource.update();
        if (terrainShadowOverlay.visible !== visible) terrainShadowOverlay.visible = visible;
      };
      const receiveTerrainShadow = (alpha: number) => {
        adaptedSamples.fill(1);
        receiveShadowGrid(adaptedSamples);
        terrainShadowOverlay.alpha = alpha;
        terrainShadowOverlay.visible = alpha > 0.005;
      };
      const receiveTerrainShadowBands = (samples: ArrayLike<number>) => {
        for (let row = 0; row < TERRAIN_SHADOW_BANDS; row += 1)
          adaptedSamples.fill(samples[row], row * SHADOW_COLUMNS, (row + 1) * SHADOW_COLUMNS);
        receiveShadowGrid(adaptedSamples);
      };
      // Where its feet are in the world for its shadow: lifted by a jump's height, as if it stood higher.
      let castFrom = { x: drawnAt.x, y: drawnAt.y, elevation: drawnAt.elevation };
      let drawnDepth: number | undefined;
      let drawnBehind: boolean | undefined;
      let depthFor: { x: number; y: number; elevation: number } | undefined;
      let depth = 0;
      // Set by `start()`, before the first `place()`.
      let scene!: BuiltScene;

      // Answers to what the player did (`player.feedback`): real milliseconds since its last take-off
      // and landing (at `impact`), the counters seen so far, and what they do to the body.
      const seen = { ...player.feedback };
      let sinceTakeoff = Infinity;
      let sinceLanding = Infinity;
      let impact = 0;
      let body: GridPoint = { x: 1, y: 1 };
      // How it leans (a spring toward its speed and acceleration across the screen), as drawn, and
      // the velocity and tick it last saw, to tell how fast it speeds up.
      const lean: BodyLean = { angle: 0, speed: 0 };
      let tilt = 0;
      let seenTick: number | undefined;
      let seenVelocity: GridPoint = { x: 0, y: 0 };
      let acceleration: GridPoint = { x: 0, y: 0 };
      // Puffs of dust, made when first raised: one for take-offs (in the air too, where the feet are,
      // for a double jump), one for landings, then {@link RUN_PUFFS} small ones for running, in turn.
      const puffs: Array<{ view: Graphics; ms: number } | undefined> = [];
      const raiseDust = (index: number, at: PlayerRenderPosition) => {
        let puff = puffs[index];
        if (!puff) {
          const dust = new Graphics();
          for (const [x, y, size] of index < 2 ? DUST_VOXELS : RUN_DUST_VOXELS) {
            const faces = getVoxelFaces(x, y, size, metrics);
            dust.poly(faces.top).fill({ color: DUST_COLORS.top });
            dust.poly(faces.left).fill({ color: DUST_COLORS.left });
            dust.poly(faces.right).fill({ color: DUST_COLORS.right });
          }
          dust.cullable = false;
          puff = puffs[index] = { view: dust, ms: 0 };
        }
        puff.ms = 0;
        const screen = projectGridPoint(at, projection);
        puff.view.position.set(screen.x, screen.y - (at.elevation - at.inset + at.height) * metrics.boxHeight);
        scene.placeAt(puff.view, depth);
      };
      // Columns run or slid since the last puff of running dust, and the puff it raises next.
      let ran = 0;
      let runPuff = 0;
      const kickDust = (at: PlayerRenderPosition) => {
        const every = isPlayerSkidding(player) ? SKID_DUST_EVERY : isPlayerRunning(player) ? RUN_DUST_EVERY : 0;
        if (every === 0) {
          ran = 0;
          return;
        }
        ran += Math.hypot(at.x - drawnAt.x, at.y - drawnAt.y);
        if (ran < every) return;
        ran %= every;
        raiseDust(2 + runPuff, at);
        runPuff = (runPuff + 1) % RUN_PUFFS;
      };
      const settleDust = (elapsedMs: number) => {
        for (const puff of puffs) {
          if (!puff || puff.ms === Infinity) continue;
          puff.ms += elapsedMs;
          const look = getDust(puff.ms);
          if (!look) puff.ms = Infinity;
          if (puff.view.visible !== (look !== undefined)) puff.view.visible = look !== undefined;
          if (!look) continue;
          puff.view.alpha = look.alpha;
          puff.view.scale.set(look.scale, look.scale);
        }
      };
      /**
       * Notices what the player did since the last frame (`player.feedback`), raises its dust and
       * gives the body its shape for this frame, `elapsedMs` after the last, on tick `tick`
       * (`alpha` of the way to the next): the squash and stretch of a take-off or a landing, times
       * the bob, air stretch or climb stretch of its state (`getBodyShape()`), and its lean into how
       * it moves across the screen (`getLeanTarget()`, `stepBodyLean()`); standing still, with
       * `appearance.dance`, its dance on top (`getIdleDance()`: the lean the spring follows, to its own
       * sides as far as they show across the screen for its facing (`getSideLeanShare()`), and a dip
       * on each beat). Only transforms of the one sprite: no pose is added. Whether the body's scale or lean changed, so it is placed again.
       */
      const react = (at: PlayerRenderPosition, tick: number, alpha: number, elapsedMs: number) => {
        if (!effects) return false;
        sinceTakeoff += elapsedMs;
        sinceLanding += elapsedMs;
        const { feedback } = player;
        if (feedback.landings !== seen.landings) {
          sinceLanding = 0;
          impact = feedback.impact;
          if (impact >= DUST_MIN_IMPACT) raiseDust(1, at);
        }
        if (feedback.jumps !== seen.jumps) {
          sinceTakeoff = 0;
          raiseDust(0, at);
        }
        kickDust(at);
        Object.assign(seen, feedback);
        const { velocity } = player;
        if (tick !== seenTick) {
          const ticks = seenTick === undefined ? 0 : tick - seenTick;
          acceleration =
            ticks > 0
              ? { x: (velocity.x - seenVelocity.x) / ticks, y: (velocity.y - seenVelocity.y) / ticks }
              : { x: 0, y: 0 };
          seenVelocity = { ...velocity };
          seenTick = tick;
        }
        const climbing = player.motion.type === "climbing" ? getPlayerClimbProgress(player, alpha) : undefined;
        const dance = appearance.dance && getIdleDance(stood, appearance.dance);
        // The dance leans to the monkey's own sides: across the screen only as far as they show.
        const sway = (dance?.lean ?? 0) * getSideLeanShare(facing, PLAYER_FACINGS.length);
        const target =
          climbing === undefined ? getLeanTarget(velocity, acceleration, isPlayerSkidding(player)) + sway : 0;
        stepBodyLean(lean, target, elapsedMs);
        const pulse = getBodyScale(sinceTakeoff, sinceLanding, impact);
        const shape = getBodyShape({
          motion: player.motion.type,
          speed: Math.hypot(velocity.x, velocity.y),
          walked,
          stride: walk?.sheet.stride ?? 0,
          verticalSpeed: player.verticalSpeed,
          climb: climbing,
        });
        const swing = dance?.shape ?? UPRIGHT;
        const next = { x: pulse.x * shape.x * swing.x, y: pulse.y * shape.y * swing.y };
        if (next.x === body.x && next.y === body.y && lean.angle === tilt) return false;
        body = next;
        if (lean.angle !== tilt) {
          tilt = lean.angle;
          // Skewed about its feet (see `place()`): the head leans `tilt` to the right.
          view.skew.x = -tilt;
        }
        view.scale.set(base.x * body.x, base.y * body.y);
        return true;
      };

      const place = (at: PlayerRenderPosition) => {
        const column = getPlayerColumn(at);
        const screen = projectGridPoint(at, projection);
        drawnFoot.x = screen.x;
        const lifted = at.elevation + at.height;
        drawnFoot.y = screen.y - (lifted - at.inset) * metrics.boxHeight;
        castFrom = { x: at.x, y: at.y, elevation: lifted };
        // Scaled and leant about its feet: a skew of `−tilt` moves a point `d` below the sprite's
        // origin by `sin(tilt) × d` to the left and raises it by `(1 − cos(tilt)) × d`, so the
        // origin moves the other way and the feet stay where they stand.
        const below = offset.y * body.y;
        view.position.set(
          drawnFoot.x + offset.x * body.x - Math.sin(tilt) * below,
          drawnFoot.y + Math.cos(tilt) * below,
        );
        // In the draw order by the column it stands on, at that column's top: computed, and the
        // view moved, only when that column or the side of its middle changes, not on every frame.
        const elevation = columnAt.get(column.x, column.y)?.elevation ?? player.elevation;
        if (depthFor?.x !== column.x || depthFor.y !== column.y || depthFor.elevation !== elevation) {
          depthFor = { ...column, elevation };
          const [top] = projectBoxesToIsometric([{ ...depthFor, metadata: {} }], projection);
          depth = getBlockDepth(top, metrics);
        }
        const behind = at.x + at.y > column.x + column.y;
        if (depth !== drawnDepth || behind !== drawnBehind) {
          if (behind) scene.move({ view, depth, layer: SCENE_LAYER.behindObject });
          else scene.placeAt(view, depth);
          drawnDepth = depth;
          drawnBehind = behind;
        }
        drawnAt = at;
      };

      return {
        provides: {
          focus: { ground: () => getGroundPointBelow(player, level, projection) },
          movingCasters: [
            {
              view,
              foot: () => ({ ground: castFrom, screen: drawnFoot }),
              receiveTerrainShadow,
              receiveTerrainShadowBands,
              receiveShadowGrid,
            },
          ],
        },
        start: (built) => {
          scene = built;
          place(drawnAt);
          services.get("camera")?.follow(ground(drawnAt));
        },
        update: ({ tick, alpha, elapsedMs }) => {
          const at = getPlayerRenderPosition(player, alpha);
          const moved =
            at.x !== drawnAt.x ||
            at.y !== drawnAt.y ||
            at.elevation !== drawnAt.elevation ||
            at.inset !== drawnAt.inset ||
            at.height !== drawnAt.height;
          animate(at, alpha, elapsedMs);
          const reshaped = react(at, tick, alpha, elapsedMs);
          settleDust(elapsedMs);
          syncTerrainShadowOverlay();
          if (moved || reshaped) place(at);
          if (moved) services.get("camera")?.follow(ground(at));
        },
        destroy: () => {
          shadowBody.mask = null;
          shadowTexture.destroy(true);
        },
      };
    },
  };
}
