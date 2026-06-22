import React, { useState, useRef } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useTranslation } from 'react-i18next';
import { X, Check } from 'lucide-react';

interface CropEditorProps {
  imageSrc: string;
  onConfirm: (base64: string) => Promise<void> | void;
  onCancel: () => void;
}

export function CropEditor({ imageSrc, onConfirm, onCancel }: CropEditorProps) {
  const { t } = useTranslation();
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [processing, setProcessing] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const handleConfirm = async () => {
    if (!completedCrop || !imgRef.current) return;
    setProcessing(true);
    try {
      const image = imgRef.current;
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      const canvas = document.createElement('canvas');
      const MAX_DIM = 1000;
      let targetWidth = completedCrop.width * scaleX;
      let targetHeight = completedCrop.height * scaleY;

      if (targetWidth > targetHeight) {
        if (targetWidth > MAX_DIM) {
          targetHeight = Math.round(targetHeight * (MAX_DIM / targetWidth));
          targetWidth = MAX_DIM;
        }
      } else {
        if (targetHeight > MAX_DIM) {
          targetWidth = Math.round(targetWidth * (MAX_DIM / targetHeight));
          targetHeight = MAX_DIM;
        }
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingQuality = 'high';

      // Draw the cropped area
      ctx.drawImage(
        image,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        targetWidth,
        targetHeight
      );

      const base64 = canvas.toDataURL('image/webp', 0.85);
      await onConfirm(base64);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#eef2e6]/95 backdrop-blur-xl p-4">
      <div className="bg-[#eef2e6] border border-[#d2d9c8]/50 rounded-3xl w-full max-w-4xl flex flex-col h-[95vh] shadow-[0_0_50px_-12px_rgba(107,133,85,0.3)]">
        <div className="p-6 flex items-center justify-between border-b border-[#d2d9c8]">
          <h3 className="text-xl font-black text-[#2b3327] uppercase tracking-tighter">{t('crop')}</h3>
          <button onClick={onCancel} className="p-2 hover:bg-white rounded-full text-[#6b7863] transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="relative flex-1 bg-black overflow-hidden m-4 rounded-2xl flex items-center justify-center border border-[#d2d9c8]">
          <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} onComplete={(c) => setCompletedCrop(c)} aspect={9 / 16}>
            <img ref={imgRef} src={imageSrc} alt="Crop" style={{ maxHeight: 'calc(95vh - 200px)' }} className="w-auto object-contain" />
          </ReactCrop>
        </div>

        <div className="p-6 bg-[#eef2e6]/50 flex flex-col gap-6">
          <div className="flex gap-4">
            <button
              onClick={onCancel}
              className="flex-1 py-4 px-6 rounded-2xl border border-[#d2d9c8] text-[#505c4a] font-bold uppercase tracking-widest text-xs hover:bg-white transition-all disabled:opacity-50"
              disabled={processing}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-4 px-6 rounded-2xl bg-[#6b8555] text-white font-black uppercase tracking-widest text-xs hover:bg-[#556943] shadow-lg shadow-[#6b8555]/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              disabled={processing || !completedCrop?.width || !completedCrop?.height}
            >
              {processing ? 'Processing...' : <><Check size={18} /> Confirm</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
