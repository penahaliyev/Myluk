import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../lib/cropImage';
import { useTranslation } from 'react-i18next';
import { X, Check, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';

interface CropEditorProps {
  imageSrc: string;
  onConfirm: (base64: string) => Promise<void> | void;
  onCancel: () => void;
}

export function CropEditor({ imageSrc, onConfirm, onCancel }: CropEditorProps) {
  const { t } = useTranslation();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const base64 = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
      await onConfirm(base64);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
      <div className="bg-slate-900 border border-slate-700/50 rounded-3xl w-full max-w-2xl flex flex-col h-[85vh] shadow-[0_0_50px_-12px_rgba(34,211,238,0.3)]">
        <div className="p-6 flex items-center justify-between border-b border-slate-800">
          <h3 className="text-xl font-black text-white uppercase tracking-tighter">{t('crop')}</h3>
          <button onClick={onCancel} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="relative flex-1 bg-black overflow-hidden m-4 rounded-2xl border border-slate-800">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={3 / 4}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
          />
        </div>

        <div className="p-6 bg-slate-900/50 flex flex-col gap-6">
          <div className="flex items-center gap-6">
             <div className="flex-1 flex flex-col gap-2">
                <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                  <span>Zoom</span>
                  <span>{Math.round(zoom * 100)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <ZoomOut size={16} className="text-slate-500" />
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    aria-labelledby="Zoom"
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                  <ZoomIn size={16} className="text-slate-500" />
                </div>
             </div>

             <div className="flex-1 flex flex-col gap-2">
                <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                  <span>Rotation</span>
                  <span>{rotation}°</span>
                </div>
                <div className="flex items-center gap-2">
                  <RotateCw size={16} className="text-slate-500" />
                  <input
                    type="range"
                    value={rotation}
                    min={0}
                    max={360}
                    step={1}
                    aria-labelledby="Rotation"
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>
             </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={onCancel}
              className="flex-1 py-4 px-6 rounded-2xl border border-slate-700 text-slate-300 font-bold uppercase tracking-widest text-xs hover:bg-slate-800 transition-all disabled:opacity-50"
              disabled={processing}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-4 px-6 rounded-2xl bg-cyan-500 text-slate-950 font-black uppercase tracking-widest text-xs hover:bg-cyan-400 shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              disabled={processing}
            >
              {processing ? 'Processing...' : <><Check size={18} /> Confirm</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
