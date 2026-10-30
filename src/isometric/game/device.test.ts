import { describe, expect, it, vi } from "vitest";
import { DESKTOP_PROFILE, isMobileDevice, MOBILE_PROFILE, resolveDeviceProfile } from "./device";

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

describe("resolveDeviceProfile", () => {
  it("keeps desktop as it was and lowers what takes memory on mobile", () => {
    expect(resolveDeviceProfile(false)).toBe(DESKTOP_PROFILE);
    expect(DESKTOP_PROFILE).toEqual({ maxResolution: Infinity, antialias: true, releaseSvgPixels: false });
    expect(resolveDeviceProfile(true)).toBe(MOBILE_PROFILE);
    expect(MOBILE_PROFILE).toEqual({
      maxResolution: 2,
      antialias: false,
      svgDetail: 1,
      releaseSvgPixels: true,
      chunkKeepRadius: 2,
    });
  });
});
