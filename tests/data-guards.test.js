import { describe, it, expect } from 'vitest';
import {
  spotIdSet, hiddenSpotIdSet, isVisibleSpotRef, filterBySpotVisibility,
  liveDisplayName, liveSpotName, applyLiveNames, findSpotByRef,
  videoContentType, validateVideoFile, uploadErrorMessage, cannotPlayVideoUrl,
  RECORDER_MIME_PREFERENCE, VIDEO_ERR, MAX_VIDEO_BYTES,
} from '../js/data-guards.js';

const all = [
  { id: 'devora-fall', name: 'מפל דבורה', aliases: ['devora'] },
  { id: 'secret', name: 'סודי' },
];
const visible = [all[0]];

describe('spot visibility (bug: reels on custom spots vanished)', () => {
  const hidden = hiddenSpotIdSet(all, visible);
  it('hides only admin-only spots', () => {
    expect([...hidden]).toEqual(['secret']);
  });
  it('keeps custom:, alias, deleted/unknown and empty refs', () => {
    ['custom:מעיין נצח ישראל', 'devora', 'deleted-spot-123', '', null, undefined]
      .forEach((id) => expect(isVisibleSpotRef(id, hidden)).toBe(true));
  });
  it('drops items on hidden spots', () => {
    const items = [{ spotId: 'secret' }, { spotId: 'custom:x' }, { spotId: 'devora-fall' }];
    expect(filterBySpotVisibility(items, hidden)).toHaveLength(2);
  });
  it('treats a missing hidden set as show-all', () => {
    expect(filterBySpotVisibility([{ spotId: 'x' }], undefined)).toHaveLength(1);
  });
  it('indexes aliases', () => {
    expect(spotIdSet(all).has('devora')).toBe(true);
    expect(findSpotByRef(all, 'devora')?.id).toBe('devora-fall');
  });
});

describe('live data over stored copies (bug: old name on reel)', () => {
  it('prefers live profile name', () => {
    expect(liveDisplayName({ display_name: 'Lev' }, 'levperi654')).toBe('Lev');
  });
  it('falls back to stored copy when profile missing or generic', () => {
    expect(liveDisplayName(undefined, 'levperi654')).toBe('levperi654');
    expect(liveDisplayName({ display_name: 'משתמש' }, 'levperi654')).toBe('levperi654');
    expect(liveDisplayName(null, '')).toBe('משתמש');
  });
  it('applyLiveNames maps by userId and keeps unknown users', () => {
    const out = applyLiveNames([{ userId: 'a', displayName: 'old' }, { userId: 'b', displayName: 'kept' }], { a: { display_name: 'new' } });
    expect(out.map((x) => x.displayName)).toEqual(['new', 'kept']);
  });
  it('spot names: live, then stored, then custom tag text', () => {
    expect(liveSpotName(all, 'devora', 'שם ישן')).toBe('מפל דבורה');
    expect(liveSpotName(all, 'gone', 'שם שמור')).toBe('שם שמור');
    expect(liveSpotName(all, 'custom:מעיין', 'ספוט')).toBe('מעיין');
    expect(liveSpotName([], '', '')).toBe('ספוט');
  });
});

describe('upload validation (bug class: unclear upload failures)', () => {
  const f = (name, type, size = 1000) => ({ name, type, size });
  it('accepts iPhone MOV/HEVC and empty MIME by extension', () => {
    expect(videoContentType(f('IMG_1.MOV', ''))).toBe('video/quicktime');
    expect(videoContentType(f('a.mov', 'video/hevc'))).toBe('video/quicktime');
    expect(videoContentType(f('a.webm', 'video/webm;codecs=vp9'))).toBe('video/webm');
    expect(videoContentType(f('a.m4v', 'video/x-m4v'))).toBe('video/mp4');
  });
  it('rejects unsupported types and oversize/empty files with Hebrew reasons', () => {
    expect(validateVideoFile(f('a.avi', 'video/x-msvideo')).error).toBe(VIDEO_ERR.badType);
    expect(validateVideoFile(f('a.mp4', 'video/mp4', MAX_VIDEO_BYTES + 1)).error).toMatch(/גדול מדי \(41MB\)/);
    expect(validateVideoFile(f('a.mp4', 'video/mp4', 0)).error).toBe(VIDEO_ERR.empty);
    expect(validateVideoFile(null).ok).toBe(false);
    expect(validateVideoFile(f('a.mp4', 'video/mp4')).ok).toBe(true);
  });
  it('maps server/network errors to clear reasons', () => {
    expect(uploadErrorMessage({ status: 413 }, 50 * 1024 * 1024)).toMatch(/50MB/);
    expect(uploadErrorMessage({ message: 'invalid_mime_type' })).toBe(VIDEO_ERR.badType);
    expect(uploadErrorMessage({ network: true })).toBe(VIDEO_ERR.network);
    expect(uploadErrorMessage({ message: 'Failed to fetch' })).toBe(VIDEO_ERR.network);
    expect(uploadErrorMessage({ status: 403, message: 'new row violates row-level security policy' })).toBe(VIDEO_ERR.forbidden);
    expect(uploadErrorMessage({ status: 400, message: 'jwt expired' })).toBe(VIDEO_ERR.auth);
    expect(uploadErrorMessage({ status: 503 })).toBe(VIDEO_ERR.server);
    expect(uploadErrorMessage({})).toBe(VIDEO_ERR.generic);
  });
});

describe('playback (bug: videos via map/iOS did not play)', () => {
  it('detects containers the browser cannot decode', () => {
    const iosLike = (m) => (m === 'video/webm' ? '' : 'maybe');
    expect(cannotPlayVideoUrl('https://x/a.webm?x=1', iosLike)).toBe(true);
    expect(cannotPlayVideoUrl('https://x/a.mp4', iosLike)).toBe(false);
    expect(cannotPlayVideoUrl('https://x/a', iosLike)).toBe(false);
  });
  it('recorder prefers MP4 over WebM', () => {
    expect(RECORDER_MIME_PREFERENCE[0]).toMatch(/^video\/mp4/);
    expect(RECORDER_MIME_PREFERENCE.findIndex((m) => m.startsWith('video/webm')))
      .toBeGreaterThan(RECORDER_MIME_PREFERENCE.findIndex((m) => m.startsWith('video/mp4')));
  });
});
