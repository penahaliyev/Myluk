import { Outfit, WardrobeItem, UserProfile } from '../lib/hooks';
import { DayCard } from './DayCard';
import { useState } from 'react';
import { WeatherWidget, WeatherData } from './WeatherWidget';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function WeeklyBoard({ items, outfits, userId, profile }: { items: WardrobeItem[], outfits: Outfit[], userId: string, profile: UserProfile | null }) {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);

  const getOutfitForDay = (day: string) => outfits.find(o => o.dayOfWeek === day);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <WeatherWidget city={profile?.city} onWeatherData={setWeatherData} />
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

