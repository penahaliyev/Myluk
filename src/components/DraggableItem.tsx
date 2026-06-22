import React, { useState } from 'react';
import { useDrag } from 'react-dnd';
import { WardrobeItem, UserProfile, Outfit } from '../lib/hooks';
import { useTranslation } from 'react-i18next';
import { doc, deleteDoc, updateDoc, collection, setDoc, serverTimestamp, getDocs, query, where, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Trash2, Sparkles, Wand2, Star, Crop, Wand, X, Info, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { cn, fetchApi } from '../lib/utils';
import { CropEditor } from './CropEditor';
import { ImageModal } from './ImageModal';

export function DraggableItem(props: { item: WardrobeItem, userId: string, profile?: UserProfile | null, allItems?: WardrobeItem[], outfits?: Outfit[], key?: string | number }) {
  const { item, userId, profile, allItems, outfits } = props;
  const { t, i18n } = useTranslation();
  const [evaluating, setEvaluating] = useState(false);
  const [improving, setImproving] = useState(false);
  const [showAdvice, setShowAdvice] = useState(false);
  const [editingImage, setEditingImage] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  
  const handleOpenDayPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const currentDays = outfits?.filter(o => o.itemIds.includes(item.id)).map(o => o.dayOfWeek) || [];
    setSelectedDays(currentDays);
    setShowDayPicker(true);
  };

  const toggleDay = (day: string) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleSaveDays = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const batch = writeBatch(db);
    
    // Unassign from days that were previously assigned but are now unselected
    const currentDays = outfits?.filter(o => o.itemIds.includes(item.id)).map(o => o.dayOfWeek) || [];
    const daysToRemove = currentDays.filter(d => !selectedDays.includes(d));
    
    for (const day of daysToRemove) {
      const o = outfits?.find(x => x.dayOfWeek === day);
      if (o) {
        const newItemIds = o.itemIds.filter(id => id !== item.id);
        if (newItemIds.length === 0) {
          batch.delete(doc(db, `users/${userId}/outfits`, o.id));
        } else {
          batch.update(doc(db, `users/${userId}/outfits`, o.id), {
            itemIds: newItemIds,
            updatedAt: serverTimestamp()
          });
        }
      }
    }
    
    // Assign to selected days (overwrite)
    for (const day of selectedDays) {
      const o = outfits?.find(x => x.dayOfWeek === day);
      if (o) {
        batch.update(doc(db, `users/${userId}/outfits`, o.id), {
          itemIds: [item.id],
          updatedAt: serverTimestamp()
        });
      } else {
        const newRef = doc(collection(db, `users/${userId}/outfits`));
        batch.set(newRef, {
          userId,
          dayOfWeek: day,
          itemIds: [item.id],
          status: 'READY',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }
    
    await batch.commit();
    toast.success(t('assigned_to_days', 'Назначено на выбранные дни'));
    setShowDayPicker(false);
  };
  
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
      if (item.type === 'Look' && item.itemsIds && item.itemsIds.length > 0) {
        // Look is deleted -> Update its extracted items
        for (const childId of item.itemsIds) {
          const childRef = doc(db, `users/${userId}/wardrobeItems/${childId}`);
          const childSnap = await getDoc(childRef);
          if (childSnap.exists()) {
             const childData = childSnap.data();
             const newUsedInLooks = (childData.usedInLooks || []).filter((id: string) => id !== item.id);
             if (newUsedInLooks.length === 0) {
                // If it's not used in any other look, delete it
                await deleteDoc(childRef);
             } else {
                await updateDoc(childRef, { usedInLooks: newUsedInLooks });
             }
          }
        }
      } else if (item.type === 'Item' && item.usedInLooks && item.usedInLooks.length > 0) {
         // Item is deleted -> Remove its ID from all looks that used it
         for (const lookId of item.usedInLooks) {
            const lookRef = doc(db, `users/${userId}/wardrobeItems/${lookId}`);
            const lookSnap = await getDoc(lookRef);
            if (lookSnap.exists()) {
               const lookData = lookSnap.data();
               if (lookData.itemsIds && lookData.itemsIds.includes(item.id)) {
                  await updateDoc(lookRef, {
                    itemsIds: lookData.itemsIds.filter((id: string) => id !== item.id)
                  });
               }
            }
         }
      }

      await deleteDoc(doc(db, `users/${userId}/wardrobeItems/${item.id}`));
      
      // Remove item from any outfits (the manual Outfits created in WeeklyBoard)
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
      console.error("Delete failed:", error);
      toast.error(error.message, { id: toastId });
    }
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    try {
      const data = await fetchApi('/api/evaluate-single-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, language: i18n.language, profile })
      });
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
      const aiData = await fetchApi('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: item.imageUrl, language: i18n.language, existingLooks: [] })
      });
      
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
      const data = await fetchApi('/api/suggest-improvements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, language: i18n.language, profile })
      });
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
        className={`group relative rounded-3xl overflow-hidden bg-white border ${item.type === 'Duplicate' ? 'border-red-500/50' : 'border-[#d2d9c8] hover:border-[#6b8555]/50'} aspect-[2/3] cursor-grab active:cursor-grabbing transition-all ${isDragging ? 'opacity-50 scale-95' : ''}`}
      >
        <img 
           src={item.imageUrl} 
           alt={item.category} 
           className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 cursor-zoom-in" 
           onClick={() => setZoomedImage(item.imageUrl)} 
        />
        
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#2b3327]/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            {item.type === 'Look' && (
               <span className="bg-[#6b8555] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-widest">{t('look')}</span>
            )}
            <p className="text-[#2b3327] text-xs font-medium uppercase tracking-wider line-clamp-1">{item.category}</p>
          </div>
        </div>

        <div className="absolute top-3 right-3 flex flex-col gap-2 z-20">
          <button 
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleOpenDayPicker}
            className="p-2 bg-white/80 backdrop-blur-md text-[#2b3327] rounded-full hover:bg-[#6b8555] transition-all cursor-pointer"
            title={t('assign_to_day', 'Назначить на день')}
          >
            <CalendarPlus className="w-4 h-4" />
          </button>
          <button 
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleDeleteClick}
            className="p-2 bg-white/80 backdrop-blur-md text-[#2b3327] rounded-full hover:bg-red-500 transition-all cursor-pointer"
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
            className="p-2 bg-white/80 backdrop-blur-md text-[#2b3327] rounded-full hover:bg-[#6b8555] transition-all cursor-pointer"
            title={t('crop')}
          >
            <Crop className="w-4 h-4" />
          </button>
        </div>
        
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-[#e4ebd8]/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-4 text-center" onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}>
            <div className="bg-[#eef2e6] border border-[#d2d9c8] rounded-2xl p-4 w-full shadow-2xl" onClick={e => e.stopPropagation()}>
              <Trash2 className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-[#2b3327] font-bold text-xs mb-4 leading-tight">
                 {t('confirm_delete', 'Are you sure you want to delete this item?')}
              </p>
              <div className="flex gap-2 w-full">
                <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }} className="flex-1 py-3 bg-white hover:bg-[#d2d9c8] transition-colors text-[#2b3327] rounded-xl text-[10px] font-black uppercase tracking-widest">{t('cancel', 'Отмена')}</button>
                <button onClick={confirmDelete} className="flex-1 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 transition-colors text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest">{t('delete', 'Удалить')}</button>
              </div>
            </div>
          </div>
        )}

        {showDayPicker && (
          <div className="absolute inset-0 bg-[#e4ebd8]/95 backdrop-blur-md z-40 flex flex-col p-4 w-full h-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-black uppercase text-[#2b3327] tracking-widest">{t('assign_to_days', 'Установить на дни')}</h4>
              <button 
                type="button"
                onClick={() => setShowDayPicker(false)} 
                className="text-[#6b7863] bg-white p-1 rounded-full border border-[#d2d9c8] hover:bg-[#d2d9c8] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            
            <div className="flex flex-col gap-2 overflow-y-auto mb-4 flex-1 custom-scrollbar pr-1">
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
                const o = outfits?.find(x => x.dayOfWeek === day);
                const hasOtherItems = o && o.itemIds.length > 0 && !o.itemIds.includes(item.id);
                const isSelected = selectedDays.includes(day);

                return (
                  <label key={day} className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-colors ${isSelected ? 'bg-white border-[#6b8555]' : 'bg-white/50 border-[#d2d9c8] hover:bg-white'}`}>
                    <div className="flex items-center gap-2.5">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-[#6b8555] rounded border-[#d2d9c8] focus:ring-[#6b8555] focus:ring-1 bg-white"
                        checked={isSelected}
                        onChange={() => toggleDay(day)}
                      />
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#2b3327]">{t(day)}</span>
                    </div>
                    {hasOtherItems && (
                      <span className="w-2 h-2 rounded-full bg-orange-400" title={t('already_occupied', 'Уже занят')}></span>
                    )}
                  </label>
                );
              })}
            </div>
            
            <button 
              type="button"
              onClick={handleSaveDays} 
              className="mt-auto block w-full py-3 bg-[#6b8555] hover:bg-[#556943] transition-colors text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg shadow-[#6b8555]/20 flex-shrink-0"
            >
              {t('save', 'Сохранить')}
            </button>
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
        <div className="flex items-center gap-2">
          {item.displayId && (
            <span className="text-[10px] font-black bg-white text-[#556943] px-1.5 py-0.5 rounded border border-[#d2d9c8] font-mono tracking-tight leading-none">
              #{item.displayId}
            </span>
          )}
          {item.rating ? (
             <div className="flex items-center gap-1">
                <span className={cn("text-xs font-black tracking-tighter", getRatingColor(item.rating))}>
                  {item.rating.toFixed(1)}
                </span>
                <Star className={cn("w-3 h-3 fill-current", getRatingColor(item.rating))} strokeWidth={2} />
             </div>
          ) : (
             <span className="text-[9px] text-[#84917a] uppercase font-black tracking-widest opacity-50 italic">No Rank</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openInfo} title={t('info')} className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-[#d2d9c8] transition-colors text-[#6b7863] border border-[#d2d9c8]">
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      {showAdvice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#e4ebd8]/80 backdrop-blur-sm" onClick={() => setShowAdvice(false)}>
          <div className="bg-[#eef2e6] border border-[#d2d9c8] rounded-3xl overflow-hidden w-[90vw] md:w-[70vw] max-w-4xl shadow-2xl relative flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex p-2 bg-slate-800/50 border-b border-[#d2d9c8]/50">
               <button 
                  onClick={() => setActiveTab('info')}
                  className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-colors", activeTab === 'info' ? "bg-[#d2d9c8] text-[#2b3327]" : "text-[#6b7863] hover:text-[#505c4a]")}
               >
                  Info
               </button>
               <button 
                  onClick={() => setActiveTab('improve')}
                  className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-colors", activeTab === 'improve' ? "bg-[#6b8555] text-white" : "text-[#6b7863] hover:text-[#505c4a]")}
               >
                  Improve
               </button>
               <button onClick={() => setShowAdvice(false)} className="px-4 text-[#84917a] hover:text-[#2b3327] transition-colors">
                 <X size={20} />
               </button>
            </div>
            
            <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar">
               {activeTab === 'info' ? (
                  <div className="flex flex-col items-center">
                    {item.displayId && (
                       <h2 className="text-3xl font-black text-[#2b3327] uppercase tracking-tighter mb-4">
                         {item.type === 'Look' ? t("look_title", "ОБРАЗ") : t("item_title", "ВЕЩЬ")} #{item.displayId}
                       </h2>
                    )}
                    {item.rating ? (
                       <>
                           <div className="w-24 h-24 rounded-full border-[6px] flex items-center justify-center mb-6" style={{ borderColor: item.rating! >= 4 ? '#22c55e' : item.rating! >= 3 ? '#f59e0b' : '#ef4444' }}>
                              <span className="text-4xl font-black text-[#2b3327]">{item.rating!.toFixed(1)}</span>
                           </div>
                         <p className="text-[#505c4a] whitespace-pre-wrap md:text-lg leading-relaxed text-center">
                            {item.advice ? item.advice.split('Improve!:')[0] : t('no_advice', 'No advice yet. AI is still processing.')}
                         </p>

                         {item.type === 'Look' && item.itemsIds && item.itemsIds.length > 0 && (
                          <div className="mt-8 border-t border-[#d2d9c8]/50 pt-6 w-full text-center">
                            <h4 className="text-sm font-bold text-[#6b7863] uppercase tracking-widest mb-4">{t('look_composition', 'Состав образа:')}</h4>
                            <div className="flex flex-wrap gap-2 justify-center">
                              {item.itemsIds.map(id => {
                                const found = allItems?.find(x => x.id === id);
                                return (
                                  <span key={id} className="bg-white text-[#556943] border border-[#d2d9c8] px-3 py-1.5 rounded-xl text-xs font-bold tracking-wider">
                                    {found ? `${found.category} #${found.displayId || '...'}` : `Item #${id.slice(0, 4)}`}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {item.type === 'Item' && item.usedInLooks && item.usedInLooks.length > 0 && (
                          <div className="mt-8 border-t border-[#d2d9c8]/50 pt-6 w-full text-center">
                            <h4 className="text-sm font-bold text-[#6b7863] uppercase tracking-widest mb-4">{t('used_in_looks', 'Составлен в образах:')}</h4>
                            <div className="flex flex-wrap gap-2 justify-center">
                              {item.usedInLooks.map(id => {
                                const found = allItems?.find(x => x.id === id);
                                 return (
                                  <span key={id} className="bg-white text-purple-400 border border-[#d2d9c8] px-3 py-1.5 rounded-xl text-xs font-bold tracking-wider">
                                     {found && found.displayId ? `${t("look_title", "ОБРАЗ")} #${found.displayId}` : `${t("look_title", "ОБРАЗ")} #${id.slice(0,4)}`}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                       </>
                    ) : (
                       <div className="text-center">
                           <p className="text-[#6b7863] mb-4">
                            {item.category === 'Processing...' || item.category === 'Not Analyzed'
                               ? t('not_analyzed_msg', 'This image has not been analyzed by AI yet.') 
                               : t('no_score_yet', 'Item has not been scored yet.')}
                          </p>
                          <button 
                            onClick={item.category === 'Processing...' || item.category === 'Not Analyzed' ? handleRetryAnalyze : handleEvaluate} 
                            disabled={evaluating} 
                            className="px-8 py-3 bg-[#6b8555] text-white font-bold uppercase tracking-widest text-sm rounded-full"
                          >
                             {evaluating 
                                ? t('evaluating', 'Processing...') 
                                : item.category === 'Processing...' || item.category === 'Not Analyzed'
                                   ? t('analyze_now', 'Analyze Image') 
                                   : t('evaluate', 'Score Now')}
                          </button>
                       </div>
                    )}
                  </div>
               ) : (
                  <div className="flex flex-col items-center max-w-2xl mx-auto w-full">
                     <h3 className="text-xl font-black text-[#2b3327] uppercase tracking-tighter mb-6 text-center">Get Better</h3>
                     <button 
                        onClick={handleImprove} 
                        disabled={improving} 
                        className="mb-8 px-8 py-4 bg-[#6b8555] hover:bg-[#556943] transition-colors text-white font-bold uppercase tracking-widest text-sm rounded-full w-full sm:w-auto shadow-lg shadow-[#6b8555]/20"
                     >
                        {improving ? 'Generating Advice...' : 'Suggest Improvements'}
                     </button>
                     {item.advice && item.advice.includes("Improve!") && (
                       <div className="bg-slate-800/50 p-6 rounded-2xl border border-[#d2d9c8] w-full">
                         <p className="text-[#384232] whitespace-pre-wrap text-md leading-relaxed">
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
