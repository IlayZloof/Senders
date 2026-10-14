import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportMissingSchema, missingObjectName, _resetMissingSchemaReports } from '../js/missing-feature.js';

describe('missing feature table logging', () => {
  beforeEach(() => _resetMissingSchemaReports());
  it('extracts table name from PGRST205', () => {
    expect(missingObjectName({ code: 'PGRST205', message: "Could not find the table 'public.jump_video_saves' in the schema cache" })).toBe('public.jump_video_saves');
  });
  it('logs once per missing object', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = { code: 'PGRST205', message: "Could not find the table 'public.x' in the schema cache" };
    expect(reportMissingSchema(err)).toBe(true);
    expect(reportMissingSchema(err)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('public.x');
    spy.mockRestore();
  });
});
