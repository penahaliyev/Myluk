import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function fetchApi(url: string, options?: RequestInit) {
  const resp = await fetch(url, options);
  if (!resp.ok) {
    let err = await resp.text();
    try {
      const json = JSON.parse(err);
      if (json.error) err = json.error;
    } catch(e) {}
    throw new Error(err);
  }
  return resp.json();
}

export function resizeImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/webp', 0.85));
      };
      if (e.target?.result) {
        img.src = e.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  });
}
