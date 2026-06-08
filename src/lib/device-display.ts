export type DeviceDisplayInput = {
  deviceId: string | null | undefined;
  userAgent: string | null | undefined;
};

export type DeviceDisplay = {
  label: string;
  shortId: string;
};

export function formatDeviceDisplay(input: DeviceDisplayInput): DeviceDisplay {
  const userAgent = input.userAgent ?? '';
  const os = detectOs(userAgent);
  const browser = detectBrowser(userAgent);
  const deviceId = input.deviceId?.trim();

  return {
    label: `${os} · ${browser}`,
    shortId: deviceId ? `ID ${deviceId.slice(-6)}` : '未识别设备',
  };
}

function detectOs(userAgent: string): string {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/Windows NT/i.test(userAgent)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return '未知系统';
}

function detectBrowser(userAgent: string): string {
  if (/EdgA?|EdgiOS\//i.test(userAgent)) return 'Edge';
  if (/Firefox|FxiOS/i.test(userAgent)) return 'Firefox';
  if (/CriOS|Chrome\//i.test(userAgent)) return 'Chrome';
  if (/Safari\//i.test(userAgent)) return 'Safari';
  return '未知浏览器';
}
