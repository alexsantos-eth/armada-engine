import type { BoardViewConfig } from "../types/config";
import { DEFAULT_BOARD_VIEW } from "../modes/classic/entities/views";

export const withView = (
  overrides: Partial<BoardViewConfig>,
  base: BoardViewConfig = DEFAULT_BOARD_VIEW,
): BoardViewConfig => ({ ...base, ...overrides });
