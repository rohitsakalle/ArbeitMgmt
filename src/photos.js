import { LIMITS } from './model.js';

export async function importPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > LIMITS.imageBytes || file.size === 0) throw new Error('invalidPhoto');
  const originalData = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const reportImage = await reportPhotoCopy(originalData);
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), reportImage, originalData, originalName: file.name.slice(0, 255),
    originalType: file.type, caption: '', visibility: 'internal', createdAt: now, updatedAt: now, history: [],
  };
}

export async function reportPhotoCopy(data) {
  if (typeof data !== 'string' || data.length > LIMITS.imageBytes * 1.4 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(data)) throw new Error('invalidPhoto');
  const image = new Image();
  image.src = data;
  try { await image.decode(); } catch { throw new Error('invalidPhoto'); }
  if (!image.width || !image.height || image.width * image.height > 40_000_000) throw new Error('invalidPhoto');
  const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('invalidPhoto');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const reportImage = canvas.toDataURL('image/jpeg', 0.88);
  canvas.width = 0; canvas.height = 0;
  if (!reportImage.startsWith('data:image/jpeg;base64,')) throw new Error('invalidPhoto');
  return reportImage;
}
