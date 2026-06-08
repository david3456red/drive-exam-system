import { describe, expect, it } from 'vitest';

import { formatDeviceDisplay } from '@/lib/device-display';

describe('formatDeviceDisplay', () => {
  it('formats Windows Chrome devices with a short audit id', () => {
    const device = formatDeviceDisplay({
      deviceId: '8a1f6b2c9d4e7f00aa11',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    });

    expect(device.label).toBe('Windows · Chrome');
    expect(device.shortId).toBe('ID 00aa11');
  });

  it('formats iPhone Safari devices', () => {
    const device = formatDeviceDisplay({
      deviceId: 'mobile-device-123456',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    });

    expect(device.label).toBe('iOS · Safari');
    expect(device.shortId).toBe('ID 123456');
  });

  it('formats Android Edge devices', () => {
    const device = formatDeviceDisplay({
      deviceId: 'android-edge-fingerprint',
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.0.0',
    });

    expect(device.label).toBe('Android · Edge');
  });

  it('handles missing fingerprint and unknown browsers', () => {
    const device = formatDeviceDisplay({
      deviceId: null,
      userAgent: 'SomeCrawler/1.0',
    });

    expect(device.label).toBe('未知系统 · 未知浏览器');
    expect(device.shortId).toBe('未识别设备');
  });
});
