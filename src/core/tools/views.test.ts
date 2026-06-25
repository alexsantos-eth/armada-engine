import { describe, expect, it } from "vitest";
import { withView } from "./views";
import { DebugBoardView, DEFAULT_BOARD_VIEW } from "../modes/classic/entities/views";

describe("views tool", () => {
  describe("withView", () => {
    it("should allow providing base", () => {
      const view = withView({ width: 10 }, DebugBoardView);
      expect(view.width).toBe(10);
      expect(view.id).toBe("debug");
    });

    it("should use DEFAULT_BOARD_VIEW when base is omitted", () => {
      const view = withView({ width: 15 });
      expect(view.width).toBe(15);
      expect(view.id).toBe(DEFAULT_BOARD_VIEW.id);
    });
  });
});
