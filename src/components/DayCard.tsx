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
    <div className="flex flex-col gap-3 group">
      <div 
        ref={dropRef as any}
        className={cn(
          "bg-white rounded-3xl border flex flex-col aspect-[2/3] transition-colors relative overflow-hidden",
          isOver ? "border-[#6b8555] bg-[#6b8555]/5" : "border-[#d2d9c8] hover:border-[#6b8555]"
        )}
      >
        {/* Background Images */}
        {outfitItems.length > 0 && (
          <div className="absolute inset-0 flex flex-wrap">
            {outfitItems.map((item, i) => (
               <div key={item.id} className="group/item overflow-hidden relative flex-1 min-w-[50%] h-full cursor-zoom-in" onClick={() => setZoomedImage(item.imageUrl)}>
                 <img src={item.imageUrl} alt={item.category} className="w-full h-full object-cover transition-transform duration-500 group-hover/item:scale-110" />
                 <div className="absolute inset-0 bg-[#6b8555]/10 group-hover/item:bg-[#6b8555]/30 transition-colors pointer-events-none" />
                 <button 
                   onClick={(e) => removeItem(item.id, e)}
                   className="absolute top-2 right-2 p-1.5 bg-white/90 text-[#2b3327] rounded-full opacity-100 lg:opacity-0 lg:group-hover/item:opacity-100 transition-opacity z-10 hover:bg-red-500"
                   title="Remove"
                 >
                   <Trash2 className="w-3 h-3" />
                 </button>
               </div>
            ))}
          </div>
        )}

        {outfitItems.length === 0 && (
          <div className="m-auto flex items-center justify-center text-center text-[#84917a] text-[10px] font-black uppercase tracking-widest italic p-4 leading-relaxed">
            {t('drop_text')}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 px-1">
        <h3 className="text-xs font-black uppercase tracking-widest text-[#556943] text-center w-full">
          {t(day)}
        </h3>
      </div>

      {weather && (
        <div className="flex items-center justify-between px-3 py-2 bg-white rounded-2xl border border-[#d2d9c8] transition-colors group-hover:border-slate-600">
           <div className="flex items-center gap-2">
              <WeatherIcon size={16} className={weather.condition === 'Clear' ? 'text-yellow-400' : 'text-[#556943]'} />
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-black text-[#2b3327]">{weather.tempMax}°</span>
              </div>
           </div>
           <div className="flex items-center gap-3 text-[10px] text-[#6b7863] font-bold uppercase tracking-widest">
              <div className="flex items-center gap-1" title="Rain probability"><Droplets size={12} className="text-blue-400" />{weather.rainProb}%</div>
              <div className="flex items-center gap-1" title="Wind speed"><Wind size={12} className="text-[#505c4a]" />{weather.windSpeed}</div>
           </div>
         </div>
      )}
      
      {zoomedImage && <ImageModal imageUrl={zoomedImage} onClose={() => setZoomedImage(null)} />}
    </div>
  );
}
