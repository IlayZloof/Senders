import { describe, it, expect } from 'vitest';
import {
  spotIdSet, hiddenSpotIdSet, isVisibleSpotRef, filterBySpotVisibility,
  liveDisplayName, liveSpotName, applyLiveNames, findSpotByRef,
  videoContentType, validateVideoFile, uploadErrorMessage, cannotPlayVideoUrl,
  RECORDER_MIME_PREFERENCE, VIDEO_ERR, MAX_VIDEO_BYTES,
  fitWithin, videoErrorKind, shouldReloadForVersion, clearWebmAlphaFlag,
  isUnshippedLocalVideo, isWebmUrl, repairedWebmBytes,
  classifySignUpResult, isAlreadyRegisteredAuthError,
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

describe('re-encode size cap (bug: 4K VP9 WebM failed in WebKit)', () => {
  it('scales 4K portrait down to 1080x1920', () => {
    expect(fitWithin(2160, 3840)).toEqual({ width: 1080, height: 1920, scaled: true });
  });
  it('never upscales and keeps even dims', () => {
    expect(fitWithin(464, 832)).toEqual({ width: 464, height: 832, scaled: false });
    const r = fitWithin(3001, 1999);
    expect(r.width % 2 + r.height % 2).toBe(0);
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(1920);
  });
  it('handles missing metadata', () => {
    expect(fitWithin(0, 0).scaled).toBe(false);
  });
});

describe('video error reason', () => {
  const lies = () => 'maybe';
  it('code 4 = unsupported even if canPlayType says maybe', () => {
    expect(videoErrorKind(4, 'a.webm', lies)).toBe('unsupported');
  });
  it('network/decode errors are not called unsupported', () => {
    expect(videoErrorKind(2, 'a.mp4', lies)).toBe('error');
  });
});

describe('stale JS guard', () => {
  it('reloads once per new version', () => {
    expect(shouldReloadForVersion('1.0.13', '1.0.14', null)).toBe(true);
    expect(shouldReloadForVersion('1.0.13', '1.0.14', '1.0.14')).toBe(false);
  });
  it('no reload when equal, unknown or dev', () => {
    expect(shouldReloadForVersion('1.0.14', '1.0.14', null)).toBe(false);
    expect(shouldReloadForVersion('dev', '1.0.14', null)).toBe(false);
    expect(shouldReloadForVersion('1.0.13', '', null)).toBe(false);
  });
});

describe('WebM alpha flag (bug: Lev\'s reel did not play on iPhone/WebKit)', () => {
  it('clears AlphaMode=1 in place without changing length', () => {
    const b = Uint8Array.from([0x1a, 0x45, 0x53, 0xc0, 0x81, 0x01, 0x00]);
    expect(clearWebmAlphaFlag(b)).toBe(1);
    expect([...b]).toEqual([0x1a, 0x45, 0x53, 0xc0, 0x81, 0x00, 0x00]);
  });
  it('leaves files without the flag untouched', () => {
    const b = Uint8Array.from([0x53, 0xc0, 0x81, 0x00, 0x42]);
    expect(clearWebmAlphaFlag(b)).toBe(0);
    expect(clearWebmAlphaFlag(new Uint8Array())).toBe(0);
  });
});

describe('unshipped seed videos (bug: iPhone showed format error for missing /videos/)', () => {
  it('detects relative and absolute /videos/ paths', () => {
    expect(isUnshippedLocalVideo('/videos/spots/eilat-katza-2.mov')).toBe(true);
    expect(isUnshippedLocalVideo('https://senders-dev.ilay-zloof.workers.dev/videos/spots/x.mp4')).toBe(true);
    expect(isUnshippedLocalVideo('https://x.supabase.co/storage/v1/object/public/jump-videos/a.webm')).toBe(false);
    expect(isUnshippedLocalVideo('/images/spots/eilat-katza-8.jpg')).toBe(false);
    expect(isUnshippedLocalVideo('')).toBe(false);
  });
  it('filter used by getSpotMedia keeps photos and cloud reels, drops seed /videos/', () => {
    const srcs = [
      '/images/spots/eilat-katza-8.jpg',
      '/videos/spots/eilat-katza-2.mov',
      '/videos/spots/eilat-katza-bridge.mp4',
      'https://rtaqgkaobhecupjzxdex.supabase.co/storage/v1/object/public/jump-videos/a.webm',
    ];
    const kept = srcs.filter((s) => !isUnshippedLocalVideo(s));
    expect(kept).toEqual([
      '/images/spots/eilat-katza-8.jpg',
      'https://rtaqgkaobhecupjzxdex.supabase.co/storage/v1/object/public/jump-videos/a.webm',
    ]);
  });
  it('labels missing seed videos as load error, not unsupported codec', () => {
    expect(videoErrorKind(4, '/videos/spots/x.mov', () => 'maybe')).toBe('error');
  });
});

describe('WebM playback repair helpers', () => {
  it('isWebmUrl ignores query strings', () => {
    expect(isWebmUrl('https://x/a.webm?tok=1')).toBe(true);
    expect(isWebmUrl('https://x/a.mp4')).toBe(false);
  });
  it('repairedWebmBytes returns a cleared copy only when AlphaMode=1', () => {
    const bad = Uint8Array.from([0x1a, 0x45, 0x53, 0xc0, 0x81, 0x01, 0x00]);
    const out = repairedWebmBytes(bad);
    expect(out).not.toBeNull();
    expect([...out]).toEqual([0x1a, 0x45, 0x53, 0xc0, 0x81, 0x00, 0x00]);
    expect([...bad]).toEqual([0x1a, 0x45, 0x53, 0xc0, 0x81, 0x01, 0x00]); // original untouched
    expect(repairedWebmBytes(Uint8Array.from([0x53, 0xc0, 0x81, 0x00]))).toBeNull();
  });
});

describe('email signup classification (bug: signup flipped to login / wrong-password)', () => {
  it('classifySignUpResult: session, confirm-email, already-registered, empty', () => {
    expect(classifySignUpResult({ session: { access_token: 'x' }, user: { identities: [{}] } })).toBe('session');
    expect(classifySignUpResult({ session: null, user: { identities: [{ provider: 'email' }] } })).toBe('confirm_email');
    expect(classifySignUpResult({ session: null, user: { identities: [] } })).toBe('already_registered');
    expect(classifySignUpResult({ user: null, session: null })).toBe('empty');
    expect(classifySignUpResult(null)).toBe('empty');
  });
  it('isAlreadyRegisteredAuthError maps codes and messages', () => {
    expect(isAlreadyRegisteredAuthError({ code: 'user_already_exists' })).toBe(true);
    expect(isAlreadyRegisteredAuthError({ message: 'User already registered' })).toBe(true);
    expect(isAlreadyRegisteredAuthError({ message: 'Invalid login credentials' })).toBe(false);
  });
});
