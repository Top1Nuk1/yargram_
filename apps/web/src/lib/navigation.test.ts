import { describe, expect, it, vi } from 'vitest';
import {
  isInternalYargramUrl,
  parseInternalUrl,
  navigateInternal,
} from './navigation';

describe('navigation', () => {
  describe('isInternalYargramUrl', () => {
    it('detects https://yargram.site/join/... as internal', () => {
      expect(isInternalYargramUrl('https://yargram.site/join/6qftfroT16Ka')).toBe(true);
      expect(isInternalYargramUrl('http://yargram.site/join/6qftfroT16Ka')).toBe(true);
      expect(isInternalYargramUrl('https://www.yargram.site/join/6qftfroT16Ka')).toBe(true);
    });

    it('detects relative /join/... and /app as internal', () => {
      expect(isInternalYargramUrl('/join/6qftfroT16Ka')).toBe(true);
      expect(isInternalYargramUrl('/app')).toBe(true);
      expect(isInternalYargramUrl('/app/join/xyz')).toBe(true);
      expect(isInternalYargramUrl('#theme=abc')).toBe(true);
    });

    it('detects external links as non-internal', () => {
      expect(isInternalYargramUrl('https://google.com')).toBe(false);
      expect(isInternalYargramUrl('https://t.me/durov')).toBe(false);
      expect(isInternalYargramUrl('https://youtube.com/watch?v=123')).toBe(false);
    });

    it('does not treat /api/ or /api/uploads/ as internal SPA route', () => {
      expect(isInternalYargramUrl('https://yargram.site/api/uploads/123')).toBe(false);
      expect(isInternalYargramUrl('/api/uploads/123')).toBe(false);
      expect(isInternalYargramUrl('/api/health')).toBe(false);
    });

    it('treats landing page (yargram.site root without /app) as non-internal so it opens the main website', () => {
      expect(isInternalYargramUrl('/')).toBe(false);
      expect(isInternalYargramUrl('https://yargram.site')).toBe(false);
      expect(isInternalYargramUrl('https://yargram.site/')).toBe(false);
      expect(isInternalYargramUrl('http://yargram.site')).toBe(false);
      expect(isInternalYargramUrl('https://www.yargram.site')).toBe(false);
    });
  });

  describe('parseInternalUrl', () => {
    it('parses join URLs', () => {
      const parsed = parseInternalUrl('https://yargram.site/join/6qftfroT16Ka');
      expect(parsed).toEqual({
        type: 'join',
        code: '6qftfroT16Ka',
      });
    });

    it('parses join URLs with /app prefix', () => {
      const parsed = parseInternalUrl('https://yargram.site/app/join/myCode123');
      expect(parsed).toEqual({
        type: 'join',
        code: 'myCode123',
      });
    });

    it('parses theme hash URLs', () => {
      const parsed = parseInternalUrl('https://yargram.site/#theme=base64data');
      expect(parsed).toEqual({
        type: 'theme',
        hash: '#theme=base64data',
      });
    });

    it('parses app URLs', () => {
      const parsed = parseInternalUrl('https://yargram.site/app');
      expect(parsed).toEqual({
        type: 'app',
        path: '/app',
      });
    });
  });

  describe('navigateInternal', () => {
    it('dispatches yargram:join-group for join URLs', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      const handled = navigateInternal('https://yargram.site/join/test-code-99');
      expect(handled).toBe(true);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'yargram:join-group',
          detail: { code: 'test-code-99' },
        }),
      );
      dispatchSpy.mockRestore();
    });

    it('updates hash for theme URLs', () => {
      const handled = navigateInternal('https://yargram.site/#theme=custom-theme');
      expect(handled).toBe(true);
      expect(window.location.hash).toBe('#theme=custom-theme');
    });
  });
});
