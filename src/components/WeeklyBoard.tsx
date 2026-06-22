import { fetchApi } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { Outfit, WardrobeItem, UserProfile } from '../lib/hooks';
import { DayCard } from './DayCard';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { db } from '../firebase';
import { doc, setDoc, collection, serverTimestamp, writeBatch } from 'firebase/firestore';
import { WeatherWidget, WeatherData } from './WeatherWidget';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function WeeklyBoard({ items, outfits, userId, profile }: { items: WardrobeItem[], outfits: Outfit[], userId: string, profile: UserProfile | null }) {
  const { t, i18n } = useTranslation();
  const [generating, setGenerating] = useState(false);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);

  const handleGeneratePlan = async () => {
    const myItems = items.filter(item => item.source !== 'internet');
    if (myItems.length === 0) {
      toast.error(t('no_items', 'Wardrobe is empty or only contains internet looks.'));
      return;
    }
    setGenerating(true);
    try {
      const data = await fetchApi('/api/generate-weekly-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          items: myItems, 
          language: i18n.language,
          weather: weatherData ? weatherData.daily : null,
          city: weatherData?.city
        })
      });
      
      const batch = writeBatch(db);
      
      // Delete existing outfits
      outfits.forEach(outfit => {
        batch.delete(doc(db, `users/${userId}/outfits/${outfit.id}`));
      });
      
      // Create new ones
      DAYS.forEach((day, index) => {
        if (data[day] && data[day].length > 0) {
          const newRef = doc(collection(db, `users/${userId}/outfits`));
          batch.set(newRef, {
            userId,
            dayOfWeek: day,
            itemIds: data[day],
            status: 'AI_CHOICE',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      });
      
      await batch.commit();
      toast.success(t('status_READY'));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const getOutfitForDay = (day: string) => outfits.find(o => o.dayOfWeek === day);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <WeatherWidget city={profile?.city} onWeatherData={setWeatherData} />
        
        <button 
          onClick={handleGeneratePlan} 
          disabled={generating}
          className="flex items-center gap-3 bg-gradient-to-r from-[#6b8555] to-[#8ca874] text-white px-8 py-4 rounded-full font-black shadow-2xl shadow-[#6b8555]/40 hover:shadow-[#6b8555]/60 transition-all disabled:opacity-50 uppercase tracking-tighter text-sm group"
        >
          <Sparkles className="w-5 h-5 group-hover:animate-pulse" />
          {generating ? t('loading') : t('generate_plan')}
        </button>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-6 relative">
        {DAYS.map((day, index) => {
          const outfit = getOutfitForDay(day);
          
          let dailyForecast = null;
          if (weatherData && weatherData.daily) {
             const dates = Object.keys(weatherData.daily);
             if (dates[index]) dailyForecast = weatherData.daily[dates[index]];
          }

          return (
            <DayCard 
              key={day} 
              day={day} 
              outfit={outfit} 
              userId={userId} 
              allItems={items}
              weather={dailyForecast || undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
