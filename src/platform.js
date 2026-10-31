import { Capacitor, registerPlugin } from './vendor/capacitor.js';

export const isAndroid = Capacitor.getPlatform() === 'android';
export const native = registerPlugin('VisitNative');

export async function saveNativeFile(blob, name, share = false) {
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return native.exportFile({ data, name, mime: blob.type, share });
}
