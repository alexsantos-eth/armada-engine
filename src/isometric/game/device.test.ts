import { describe, expect, it, vi } from "vitest";
import { DESKTOP_RENDER, isMobileDevice, MOBILE_RENDER, resolveRenderProfile } from "./device";

describe("isMobileDevice", () => {
  it("is a device whose main pointer is a finger that cannot hover", () => {
    const matchMedia = vi.fn(() => ({ matches: true }));

    expect(isMobileDevice({ matchMedia } as never)).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(pointer: coarse) and (hover: none)");
    expect(isMobileDevice({ matchMedia: () => ({ matches: false }) } as never)).toBe(false);
  });

  it("is not one where the window cannot tell", () => {
    expect(isMobileDevice({} as never)).toBe(false);
  });
});

describe("resolveRenderProfile", () => {
  it("keeps desktop as it was and lowers what takes memory on mobile", () => {
    expect(resolveRenderProfile(false)).toBe(DESKTOP_RENDER);
    expect(DESKTOP_RENDER).toEqual({ maxResolution: Infinity, antialias: true });
    expect(resolveRenderProfile(true)).toBe(MOBILE_RENDER);
    expect(MOBILE_RENDER).toEqual({ maxResolution: 2, antialias: false, svgDetail: 1 });
  });
});
