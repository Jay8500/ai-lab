import type { QRCodeToDataURLOptions } from 'qrcode';

/**
 * QR code as a PNG data URL. `qrcode` is CommonJS, so in a lazy chunk its functions may sit on
 * the module itself or on `.default` depending on the bundler — always go through this helper.
 */
export async function qrDataUrl(text: string, opts: QRCodeToDataURLOptions = {}): Promise<string> {
  const mod = (await import('qrcode')) as unknown as { toDataURL?: unknown; default?: { toDataURL?: unknown } };
  const fn = (typeof mod.toDataURL === 'function' ? mod.toDataURL : mod.default?.toDataURL) as
    | ((t: string, o: QRCodeToDataURLOptions) => Promise<string>)
    | undefined;
  if (!fn) throw new Error('QR code library failed to load');
  return fn(text, opts);
}
