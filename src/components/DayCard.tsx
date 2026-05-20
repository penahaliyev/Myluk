import React, { useState } from 'react';
import { useDrop } from 'react-dnd';
import { Outfit, WardrobeItem } from '../lib/hooks';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { doc, setDoc, updateDoc, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Trash2, Droplets, Wind, Cloud, CloudRain, Sun } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { DailyWeather } from './WeatherWidget';
import { ImageModal } from './ImageModal';

export function DayCard(props: { day: string, outfit?: Outfit, userId: string, allItems: WardrobeItem[], weather?: DailyWeather, key?: string | number }) {
  const { day, outfit, userId, allItems, weather } = props;
  const { t } = useTranslation();
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const [{ isOver }, dropRef] = useDrop({
    accept: 'WARDROBE_ITEM',
    drop: async (item: { id: string }) => {
      const newItemIds = outfit ? [...outfit.itemIds, item.id] : [item.id];
      const uniqueItems = Array.from(new Set(newItemIds));
      if (outfit) {
        await updateDoc(doc(db, `users/${userId}/outfits`, outfit.id), {
          itemIds: uniqueItems,
          updatedAt: serverTimestamp()
        });
      } else {
        const newId = doc(collection(db, `users/${userId}/outfits`)).id;
        await setDoc(doc(db, `users/${userId}/outfits`, newId), {
          userId,
          dayOfWeek: day,
          itemIds: uniqueItems,
          status: 'READY',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver()
    })
  });

  const outfitItems = outfit?.itemIds.map(id => allItems.find(i => i.id === id)).filter(Boolean) as WardrobeItem[] || [];

  const removeItem = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!outfit) return;
    const newItemIds = outfit.itemIds.filter(id => id !== itemId);
    if (newItemIds.length === 0) {
      await deleteDoc(doc(db, `users/${userId}/outfits`, outfit.id));
    } else {
      await updateDoc(doc(db, `users/${userId}/outfits`, outfit.id), {
        itemIds: newItemIds,
        updatedAt: serverTimestamp()
      });
    }
  };

  const WeatherIcon = weather?.condition === 'Rainy' ? CloudRain : weather?.condition === 'Cloudy' ? Cloud : Sun;

  return (
    <div className="flex flex-col gap-3 h-full group">
      <div className="flex justify-between items-center px-2">
        <h3 className="text-[13px] font-black uppercase tracking-widest text-[#ececf1] leading-none">
          {t(day)}
        </h3>
      </div>

      <div 
        ref={dropRef as any}
        className={cn(
          "bg-slate-800 rounded-3xl border flex flex-col min-h-[220px] flex-1 transition-colors relative overflow-hidden",
          isOver ? "border-cyan-400 bg-slate-800/80" : "border-slate-700 hover:border-slate-500"
        )}
      >
        {/* Background Images */}
        {outfitItems.length > 0 && (
          <div className="absolute inset-0 flex flex-wrap">
            {outfitItems.map((item, i) => (
               <div key={item.id} className="group/item overflow-hidden relative flex-1 min-w-[50%] h-full cursor-zoom-in" onClick={() => setZoomedImage(item.imageUrl)}>
                 <img src={item.imageUrl} alt={item.category} className="w-full h-full object-cover transition-transform duration-500 group-hover/item:scale-110" />
                 <div className="absolute inset-0 bg-black/10 group-hover/item:bg-black/30 transition-colors pointer-events-none" />
                 <button 
                   onClick={(e) => removeItem(item.id, e)}
                   className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-100 lg:opacity-0 lg:group-hover/item:opacity-100 transition-opacity z-10 hover:bg-red-500"
                   title="Remove"
                 >
                   <Trash2 className="w-3 h-3" />
                 </button>
               </div>
            ))}
          </div>
        )}

        {outfitItems.length === 0 && (
          <div className="m-auto flex items-center justify-center text-center text-slate-500 text-[10px] font-black uppercase tracking-widest italic p-4 leading-relaxed">
            {t('drop_text')}
          </div>
        )}
      </div>

      {weather && (
        <div className="flex items-center justify-between px-3 py-2 bg-slate-800 rounded-2xl border border-slate-700 transition-colors group-hover:border-slate-600">
           <div className="flex items-center gap-2">
              <WeatherIcon size={16} className={weather.condition === 'Clear' ? 'text-yellow-400' : 'text-cyan-400'} />
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-black text-white">{weather.tempMax}°</span>
              </div>
           </div>
           <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              <div className="flex items-center gap-1" title="Rain probability"><Droplets size={12} className="text-blue-400" />{weather.rainProb}%</div>
              <div className="flex items-center gap-1" title="Wind speed"><Wind size={12} className="text-slate-300" />{weather.windSpeed}</div>
           </div>
         </div>
      )}
      
      {zoomedImage && <ImageModal imageUrl={zoomedImage} onClose={() => setZoomedImage(null)} />}
    </div>
  );
}
