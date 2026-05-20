import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { WardrobeItem } from '../lib/hooks';
import { useTranslation } from 'react-i18next';
import { DraggableItem } from './DraggableItem';
import { Plus, UploadCloud, DownloadCloud, Image as ImageIcon } from 'lucide-react';
import { db } from '../firebase';
import { doc, setDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { CropEditor } from './CropEditor';

export function Wardrobe({ items, userId }: { items: WardrobeItem[], userId: string }) {
  const { t, i18n } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'my' | 'internet'>('my');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    const reader = new FileReader();
    reader.addEventListener('load', () => setImageSrc(reader.result?.toString() || null));
    reader.readAsDataURL(file);
  }, []);

  const handleUploadCropped = async (croppedImageBase64: string) => {
    setImageSrc(null); // Close editor immediately
    
    const newRef = doc(collection(db, `users/${userId}/wardrobeItems`));
    
    // Optimistic instant save
    await setDoc(newRef, {
      userId,
      imageUrl: croppedImageBase64,
      type: "Item", // Required to be "Item" or "Look" by firestore rules
      category: "Processing...",
      color: "Unknown",
      source: activeTab,
      tags: [],
      createdAt: serverTimestamp()
    });
    
    const toastId = toast.loading(t('analyzing', 'AI is assessing your look...'));

    // Asynchronously replace with AI suggestions
    try {
      const analyzeRes = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: croppedImageBase64, language: i18n.language })
      });
      const aiData = await analyzeRes.json();
      
      await updateDoc(newRef, {
        type: aiData.type === 'Look' ? 'Look' : 'Item',
        category: aiData.category || "Other",
        color: aiData.color || "Unknown",
        tags: aiData.tags || [],
        rating: aiData.rating || 0,
        advice: aiData.advice || ""
      });
      
      toast.success(t('analyzed', 'AI assessment complete!'), { id: toastId });
    } catch (e: any) {
      toast.error(t('analyze_failed', 'Failed to tag: ') + e.message, { id: toastId });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'image/*': [] },
    multiple: false
  } as any);

  const filteredItems = items.filter(item => {
    if (activeTab === 'my') return item.source !== 'internet';
    return item.source === 'internet';
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex bg-slate-800 p-1.5 rounded-full self-start border border-slate-700">
        <button
          onClick={() => setActiveTab('my')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
            activeTab === 'my' 
              ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' 
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <ImageIcon size={16} />
          {t('my_looks', 'Мои Луки')}
        </button>
        <button
          onClick={() => setActiveTab('internet')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
            activeTab === 'internet' 
              ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' 
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <DownloadCloud size={16} />
          {t('internet_looks', 'Из Интернета')}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 relative">
        {imageSrc && (
          <CropEditor 
            imageSrc={imageSrc} 
            onConfirm={handleUploadCropped} 
            onCancel={() => setImageSrc(null)}
          />
        )}

        <div 
          {...getRootProps()} 
          className={`aspect-[3/4] rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all ${
            isDragActive ? 'border-cyan-400 bg-cyan-400/5' : 'border-slate-700 bg-slate-800/20 hover:border-slate-500 hover:bg-slate-800/40'
          } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <input {...getInputProps()} />
          <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 border border-slate-700 group-hover:scale-110 transition-transform">
            <UploadCloud className="text-cyan-400" size={24} />
          </div>
          <p className="text-white text-xs font-black uppercase tracking-widest leading-normal">
            {uploading ? t('saving') : activeTab === 'my' ? t('add_item') : t('add_inspiration', 'Добавить идею')}
          </p>
        </div>

        {filteredItems.map((item) => (
          <DraggableItem key={item.id} item={item} userId={userId} />
        ))}
      </div>
    </div>
  );
}
