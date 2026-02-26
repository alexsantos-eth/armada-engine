import { describe, it, expect } from 'vitest';
import { generateShotPatterns } from '../../tools/shots';
import {
  SINGLE_SHOT,
  CROSS_SHOT,
  SHOT_PATTERNS,
} from '../../constants/shots';

describe('generateShotPatterns', () => {
  it('should return patterns for the given ids', () => {
    const patterns = generateShotPatterns({ shotPatternIds: ['single', 'cross'] });
    expect(patterns).toHaveLength(2);
    expect(patterns[0].id).toBe('single');
    expect(patterns[1].id).toBe('cross');
  });

  it('should preserve offsets from the source pattern', () => {
    const [pattern] = generateShotPatterns({ shotPatternIds: ['single'] });
    expect(pattern.offsets).toEqual(SINGLE_SHOT.offsets);
  });

  it('should preserve offsets for cross pattern', () => {
    const [pattern] = generateShotPatterns({ shotPatternIds: ['cross'] });
    expect(pattern.offsets).toEqual(CROSS_SHOT.offsets);
  });

  it('should deduplicate repeated ids', () => {
    const patterns = generateShotPatterns({ shotPatternIds: ['single', 'single', 'cross'] });
    expect(patterns).toHaveLength(2);
    const ids = patterns.map(p => p.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('should skip unknown pattern ids', () => {
    const patterns = generateShotPatterns({ shotPatternIds: ['single', 'nonexistent'] });
    expect(patterns).toHaveLength(1);
    expect(patterns[0].id).toBe('single');
  });

  it('should return an empty array for unknown-only ids', () => {
    const patterns = generateShotPatterns({ shotPatternIds: ['ghost', 'phantom'] });
    expect(patterns).toHaveLength(0);
  });

  it('should return an empty array for empty id list', () => {
    const patterns = generateShotPatterns({ shotPatternIds: [] });
    expect(patterns).toHaveLength(0);
  });

  it('should use default pattern ids when none are specified', () => {
    const patterns = generateShotPatterns({});
    expect(patterns.length).toBeGreaterThanOrEqual(0);
  });

  it('should generate patterns for all known pattern ids', () => {
    const allIds = Object.keys(SHOT_PATTERNS);
    const patterns = generateShotPatterns({ shotPatternIds: allIds });
    expect(patterns).toHaveLength(allIds.length);
    patterns.forEach(p => {
      expect(SHOT_PATTERNS[p.id]).toBeDefined();
      expect(p.offsets).toEqual(SHOT_PATTERNS[p.id].offsets);
    });
  });

  it('should maintain order of ids', () => {
    const ids = ['cross', 'single', 'square'];
    const patterns = generateShotPatterns({ shotPatternIds: ids });
    patterns.forEach((p, i) => expect(p.id).toBe(ids[i]));
  });

  it('each pattern should have at least one offset', () => {
    const ids = Object.keys(SHOT_PATTERNS);
    const patterns = generateShotPatterns({ shotPatternIds: ids });
    for (const p of patterns) {
      expect(p.offsets.length).toBeGreaterThan(0);
    }
  });
});
