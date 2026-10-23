import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../random";
import { pairShadows, type ShadowBody, type ShadowReach } from "./pairs";
import type { ShadowReceiver } from "./received-shadow";
import type { Silhouette } from "./silhouette";

/** A silhouette `height` pixels tall standing on `(x, y)`: all the pairing reads. */
const silhouette = (x: number, y: number, height: number) =>
  ({ worldFoot: { x, y }, display: { left: 0, top: 0, width: 10, height } }) as Silhouette;

const body = (elevation: number, ...silhouettes: Silhouette[]): ShadowBody => ({ elevation, silhouettes });

/** A tile of reach per 10 pixels of height and per block of lift; never negative. */
const reach: ShadowReach = (height, lift) => Math.max(0, height / 10 + lift);

/** Every receiver against every other body: the pairing the grid must match. */
function everyPair(bodies: readonly ShadowBody[], receives: (body: ShadowBody) => boolean): ShadowReceiver[] {
  return bodies
    .filter(receives)
    .flatMap((receiver) =>
      receiver.silhouettes.map((own) => ({
        own,
        casters: bodies
          .filter((other) => other !== receiver)
          .flatMap((other) => {
            const lift = other.elevation - receiver.elevation;
            return other.silhouettes
              .filter(
                ({ worldFoot, display }) =>
                  Math.hypot(own.worldFoot.x - worldFoot.x, own.worldFoot.y - worldFoot.y) <=
                  reach(display.height, lift),
              )
              .map((caster) => ({ silhouette: caster, lift }));
          }),
      })),
    )
    .filter(({ casters }) => casters.length > 0);
}

describe("pairShadows", () => {
  it("gives each receiving silhouette the other bodies' silhouettes within reach, with their lift", () => {
    const tree = body(0, silhouette(0, 0, 20));
    const tower = body(1, silhouette(2, 0, 30));
    const far = body(0, silhouette(9, 0, 20));
    const own = body(0, silhouette(1, 0, 20), silhouette(1, 1, 20));

    const pairs = pairShadows([tree, tower, far, own], (receiver) => receiver === own, reach);

    expect(pairs).toEqual([
      {
        own: own.silhouettes[0],
        casters: [
          { silhouette: tree.silhouettes[0], lift: 0 },
          { silhouette: tower.silhouettes[0], lift: 1 },
        ],
      },
      {
        own: own.silhouettes[1],
        casters: [
          { silhouette: tree.silhouettes[0], lift: 0 },
          { silhouette: tower.silhouettes[0], lift: 1 },
        ],
      },
    ]);
  });

  it("leaves out the silhouettes nothing reaches, and the body's own silhouettes", () => {
    const alone = body(0, silhouette(0, 0, 10), silhouette(0, 1, 10));
    const lower = body(-3, silhouette(30, 0, 10));
    const above = body(0, silhouette(31, 0, 10));

    expect(pairShadows([alone], () => true, reach)).toEqual([]);
    // A caster three blocks below reaches nothing: its reach never goes under zero.
    expect(pairShadows([lower, above], (receiver) => receiver === above, reach)).toEqual([]);
    expect(pairShadows([], () => true, reach)).toEqual([]);
  });

  it("pairs as comparing every pair does, across cells and with negative coordinates", () => {
    const random = createSeededRandom(42);
    const at = (span: number) => Math.round((random() - 0.5) * span);
    const bodies = Array.from({ length: 120 }, () =>
      body(
        at(6),
        ...Array.from({ length: 1 + Math.floor(random() * 3) }, () => silhouette(at(80), at(80), 5 + random() * 40)),
      ),
    );
    const receives = (receiver: ShadowBody) => bodies.indexOf(receiver) % 3 === 0;

    const pairs = pairShadows(bodies, receives, reach);

    expect(pairs.length).toBeGreaterThan(10);
    expect(pairs).toEqual(everyPair(bodies, receives));
  });
});
