import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageModalProps {
  imageUrl: string;
  onClose: () => void;
}

export function ImageModal({ imageUrl, onClose }: ImageModalProps) {
  const [isZoomed, setIsZoomed] = useState(false);

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 cursor-zoom-out"
      onClick={onClose}
    >
      <div className="absolute top-6 right-6 flex items-center gap-3 z-[101]">
         <button 
           className="p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors hidden md:flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-5 group"
           onClick={(e) => {
             e.stopPropagation();
             setIsZoomed(!isZoomed);
           }}
         >
           {isZoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
           <span className="group-hover:translate-x-1 transition-transform">{isZoomed ? 'Zoom Out' : 'Zoom 2x'}</span>
         </button>
         <button 
           onClick={onClose} 
           className="p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
         >
           <X size={24} />
         </button>
      </div>

      <div 
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <img 
          src={imageUrl} 
          alt="Zoomed" 
          className={`max-w-none transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] rounded-sm md:rounded-xl shadow-2xl ${isZoomed ? 'scale-[2.5] cursor-zoom-out' : 'max-w-[90vw] max-h-[85vh] object-contain cursor-zoom-in'}`}
          onClick={() => setIsZoomed(!isZoomed)}
        />
      </div>
      
      {!isZoomed && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/40 text-[10px] font-bold uppercase tracking-[0.3em] pointer-events-none">
          Click image to toggle 2.5x Zoom
        </div>
      )}
    </div>
  );
}
