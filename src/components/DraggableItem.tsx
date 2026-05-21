import React, { useState } from 'react';
import { useDrag } from 'react-dnd';
import { WardrobeItem, UserProfile } from '../lib/hooks';
import { useTranslation } from 'react-i18next';
import { doc, deleteDoc, updateDoc, collection, setDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Trash2, Sparkles, Wand2, Star, Crop, Wand, X, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { CropEditor } from './CropEditor';
import { ImageModal } from './ImageModal';

export function DraggableItem(props: { item: WardrobeItem, userId: string, profile?: UserProfile | null, key?: string | number }) {
  const { item, userId, profile } = props;
  const { t, i18n } = useTranslation();
  const [evaluating, setEvaluating] = useState(false);
  const [improving, setImproving] = useState(false);
  const [showAdvice, setShowAdvice] = useState(false);
  const [editingImage, setEditingImage] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [{ isDragging }, dragRef] = useDrag({
    type: 'WARDROBE_ITEM',
    item: { id: item.id, type: item.type },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowDeleteConfirm(false);
    
    const toastId = toast.loading(t('deleting', 'Deleting...'));
    try {
      await deleteDoc(doc(db, `users/${userId}/wardrobeItems/${item.id}`));
      
      // Remove item from any outfits
      const outfitsRef = collection(db, `users/${userId}/outfits`);
      const snapshot = await getDocs(query(outfitsRef, where('userId', '==', userId)));
      const updatePromises = snapshot.docs.map(async (docSnap) => {
         const outfitData = docSnap.data();
         if (outfitData.itemIds && outfitData.itemIds.includes(item.id)) {
            const newItemIds = outfitData.itemIds.filter((id: string) => id !== item.id);
            if (newItemIds.length === 0) {
               return deleteDoc(doc(db, `users/${userId}/outfits`, docSnap.id));
            } else {
               return updateDoc(doc(db, `users/${userId}/outfits`, docSnap.id), {
                  itemIds: newItemIds,
                  updatedAt: serverTimestamp()
               });
            }
         }
      });
      await Promise.all(updatePromises);
      
      toast.success(t('status_READY', 'Item removed'), { id: toastId });
    } catch (error: any) {
      console.error("Delete failed at step:", error);
      toast.error(error.message, { id: toastId });
    }
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    try {
      const resp = await fetch('/api/evaluate-single-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, language: i18n.language, profile })
      });
      const data = await resp.json();
      if (data.rating) {
        await updateDoc(doc(db, `users/${userId}/wardrobeItems/${item.id}`), {
          rating: data.rating,
          advice: data.advice || ""
        });
        toast.success(t('evaluated', 'Evaluated!'));
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEvaluating(false);
    }
  };

  const handleRetryAnalyze = async () => {
    setEvaluating(true);
    try {
      const analyzeRes = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: item.imageUrl, language: i18n.language, existingLooks: [] })
      });
      const aiData = await analyzeRes.json();
      
      const isDuplicate = aiData.type === 'Duplicate';
      const finalType = isDuplicate ? 'Duplicate' : (aiData.type === 'Look' ? 'Look' : 'Item');

      await updateDoc(doc(db, `users/${userId}/wardrobeItems/${item.id}`), {
        type: finalType,
        category: aiData.category || "Other",
        color: aiData.color || "Unknown",
        tags: aiData.tags || [],
        rating: aiData.rating || 0,
        advice: aiData.advice || ""
      });

      if (aiData.type === 'Look' && aiData.extractedItems && Array.isArray(aiData.extractedItems)) {
        const itemPromises = aiData.extractedItems.map(async (extractedItem: any) => {
          const itemRef = doc(collection(db, `users/${userId}/wardrobeItems`));
          return setDoc(itemRef, {
            userId,
            imageUrl: item.imageUrl,
            type: "Item",
            category: extractedItem.category || extractedItem.name || "Unknown",
            color: extractedItem.color || "Unknown",
            source: item.source,
            tags: [extractedItem.attributes].filter(Boolean),
            rating: 0,
            advice: t('extracted_from_look', 'Extracted from Look'),
            createdAt: serverTimestamp()
          });
        });
        await Promise.all(itemPromises);
      }
      
      toast.success(t('analyzed', 'AI assessment complete!'));
    } catch (e: any) {
      toast.error(t('analyze_failed', 'Failed to tag: ') + e.message);
    } finally {
      setEvaluating(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'info'|'improve'>('info');

  const handleImprove = async () => {
    setActiveTab('improve');
    setImproving(true);
    try {
      const resp = await fetch('/api/suggest-improvements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, language: i18n.language, profile })
      });
      const data = await resp.json();
      if (data.advice) {
        // Since we can generate multiple times, let's just keep the last improvement or append to basic advice.
        const baseAdvice = item.advice ? item.advice.split("Improve!:")[0] : "";
        await updateDoc(doc(db, `users/${userId}/wardrobeItems/${item.id}`), {
          advice: baseAdvice + "\n\nImprove!: " + data.advice
        });
        
        // Add items to shopping list if internet item
        if (data.itemsToBuy && data.itemsToBuy.length > 0) {
          for (const buyItem of data.itemsToBuy) {
            const newRef = doc(collection(db, `users/${userId}/shoppingItems`));
            await setDoc(newRef, {
              userId,
              name: buyItem.name,
              reason: buyItem.reason,
              createdAt: serverTimestamp()
            });
          }
          toast.success(t('added_to_shopping_list', 'Added to shopping list'));
        }
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImproving(false);
    }
  };

  const openInfo = () => {
    setActiveTab('info');
    setShowAdvice(true);
  };

  const handleUpdateImage = async (newBase64: string) => {
    try {
      await updateDoc(doc(db, `users/${userId}/wardrobeItems/${item.id}`), {
        imageUrl: newBase64
      });
      toast.success(t('status_READY'));
      setEditingImage(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 5) return 'text-green-500';
    if (rating >= 4) return 'text-blue-400';
    if (rating >= 3) return 'text-orange-400';
    return 'text-red-500';
  };

  return (
    <div className="flex flex-col gap-2">
      <div 
        ref={dragRef as any}
        className={`group relative rounded-3xl overflow-hidden bg-slate-800 border ${item.type === 'Duplicate' ? 'border-red-500/50' : 'border-slate-700 hover:border-cyan-400/50'} aspect-[3/4] cursor-grab active:cursor-grabbing transition-all ${isDragging ? 'opacity-50 scale-95' : ''}`}
      >
        <img 
           src={item.imageUrl} 
           alt={item.category} 
           className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 cursor-zoom-in" 
           onClick={() => setZoomedImage(item.imageUrl)} 
        />
        
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            {item.type === 'Look' && (
               <span className="bg-cyan-500 text-slate-900 text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-widest">{t('look')}</span>
            )}
            <p className="text-white text-xs font-medium uppercase tracking-wider line-clamp-1">{item.category}</p>
          </div>
        </div>

        <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all z-20">
          <button 
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleDeleteClick}
            className="p-2 bg-black/40 backdrop-blur-md text-white rounded-full hover:bg-red-500 transition-all cursor-pointer"
            title={t('confirm_delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button 
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditingImage(true);
            }}
            className="p-2 bg-black/40 backdrop-blur-md text-white rounded-full hover:bg-cyan-500 transition-all cursor-pointer"
            title={t('crop')}
          >
            <Crop className="w-4 h-4" />
          </button>
        </div>
        
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-4 text-center" onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}>
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 w-full shadow-2xl" onClick={e => e.stopPropagation()}>
              <Trash2 className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-white font-bold text-xs mb-4 leading-tight">
                 {t('confirm_delete', 'Are you sure you want to delete this item?')}
              </p>
              <div className="flex gap-2 w-full">
                <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 transition-colors text-white rounded-xl text-[10px] font-black uppercase tracking-widest">{t('cancel', 'Отмена')}</button>
                <button onClick={confirmDelete} className="flex-1 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 transition-colors text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest">{t('delete', 'Удалить')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {item.type === 'Duplicate' ? (
        <div className="px-1 py-1">
          <p className="text-red-400 font-bold text-xs uppercase text-center">{t('delete', 'DELETE')}</p>
          <p className="text-red-400/70 text-[10px] text-center">{item.advice || t('copy_detected', 'Copy detected')}</p>
        </div>
      ) : (
      <>
      {/* Action Row Under Photo */}
      <div className="flex items-center justify-between px-1 h-6">
        {item.rating ? (
           <div className="flex items-center gap-1.5">
              <span className={cn("text-sm font-black tracking-tighter", getRatingColor(item.rating))}>
                {item.rating.toFixed(1)}
              </span>
              <Star className={cn("w-3 h-3 fill-current", getRatingColor(item.rating))} strokeWidth={2} />
           </div>
        ) : (
           <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest opacity-50 italic">No AI Rank</span>
        )}
        <div className="flex items-center gap-2">
          <button onClick={openInfo} title={t('info')} className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 transition-colors text-slate-400 border border-slate-700">
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      {showAdvice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowAdvice(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden w-[90vw] md:w-[70vw] max-w-4xl shadow-2xl relative flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex p-2 bg-slate-800/50 border-b border-slate-700/50">
               <button 
                  onClick={() => setActiveTab('info')}
                  className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-colors", activeTab === 'info' ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-300")}
               >
                  Info
               </button>
               <button 
                  onClick={() => setActiveTab('improve')}
                  className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-colors", activeTab === 'improve' ? "bg-cyan-500 text-slate-900" : "text-slate-400 hover:text-slate-300")}
               >
                  Improve
               </button>
               <button onClick={() => setShowAdvice(false)} className="px-4 text-slate-500 hover:text-white transition-colors">
                 <X size={20} />
               </button>
            </div>
            
            <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar">
               {activeTab === 'info' ? (
                  <div className="flex flex-col items-center">
                    {item.rating ? (
                       <>
                         <div className="w-24 h-24 rounded-full border-[6px] flex items-center justify-center mb-6" style={{ borderColor: item.rating >= 4 ? '#22c55e' : item.rating >= 3 ? '#f59e0b' : '#ef4444' }}>
                            <span className="text-4xl font-black text-white">{item.rating.toFixed(1)}</span>
                         </div>
                         <p className="text-slate-300 whitespace-pre-wrap md:text-lg leading-relaxed text-center">
                            {item.advice ? item.advice.split('Improve!:')[0] : t('no_advice', 'No advice yet. AI is still processing.')}
                         </p>
                       </>
                    ) : (
                       <div className="text-center">
                           <p className="text-slate-400 mb-4">
                            {item.category === 'Processing...' 
                               ? t('analyze_failed_msg', 'Image analysis failed previously.') 
                               : t('no_score_yet', 'Item has not been scored yet.')}
                          </p>
                          <button 
                            onClick={item.category === 'Processing...' ? handleRetryAnalyze : handleEvaluate} 
                            disabled={evaluating} 
                            className="px-8 py-3 bg-cyan-500 text-slate-900 font-bold uppercase tracking-widest text-sm rounded-full"
                          >
                             {evaluating 
                                ? t('evaluating', 'Processing...') 
                                : item.category === 'Processing...' 
                                   ? t('retry_analysis', 'Retry AI Analysis') 
                                   : t('evaluate', 'Score Now')}
                          </button>
                       </div>
                    )}
                  </div>
               ) : (
                  <div className="flex flex-col items-center max-w-2xl mx-auto w-full">
                     <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-6 text-center">Get Better</h3>
                     <button 
                        onClick={handleImprove} 
                        disabled={improving} 
                        className="mb-8 px-8 py-4 bg-cyan-500 hover:bg-cyan-400 transition-colors text-slate-900 font-bold uppercase tracking-widest text-sm rounded-full w-full sm:w-auto shadow-lg shadow-cyan-500/20"
                     >
                        {improving ? 'Generating Advice...' : 'Suggest Improvements'}
                     </button>
                     {item.advice && item.advice.includes("Improve!") && (
                       <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 w-full">
                         <p className="text-slate-200 whitespace-pre-wrap text-md leading-relaxed">
                            {item.advice.split("Improve!:")[1]}
                         </p>
                       </div>
                     )}
                  </div>
               )}
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {editingImage && (
        <CropEditor 
          imageSrc={item.imageUrl} 
          onConfirm={handleUpdateImage}
          onCancel={() => setEditingImage(false)}
        />
      )}
      
      {zoomedImage && <ImageModal imageUrl={zoomedImage} onClose={() => setZoomedImage(null)} />}
    </div>
  );
}
