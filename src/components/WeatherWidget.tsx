import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, Sun, CloudRain, Thermometer, MapPin } from 'lucide-react';
import { Wind, Droplets } from 'lucide-react';
import { fetchApi } from '../lib/utils';

export interface DailyWeather {
  date: string; // YYYY-MM-DD
  tempMax: number;
  tempMin: number;
  condition: string;
  rainProb: number;
  windSpeed: number;
}

export interface WeatherData {
  currentTemp: number;
  currentCondition: string;
  city: string;
  daily: Record<string, DailyWeather>;
}

function getWeatherCondition(code: number) {
  if (code >= 51) return 'Rainy';
  if (code >= 1 && code <= 3) return 'Cloudy';
  return 'Clear';
}

export function WeatherWidget({ city, onWeatherData }: { city?: string, onWeatherData: (data: WeatherData) => void }) {
  const { t, i18n } = useTranslation();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!city) {
      setError(t('no_city_set', 'City not set in profile'));
      setLoading(false);
      return;
    }

    const fetchWeather = async () => {
      try {
        setLoading(true);
        // 1. Geocode City
        const geoData = await fetchApi(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=${i18n.language}`);
        
        if (!geoData.results || geoData.results.length === 0) {
          setError(t('city_not_found', 'City not found'));
          setLoading(false);
          return;
        }

        const { latitude, longitude, name } = geoData.results[0];

        // 2. Fetch Weather
        const weatherData = await fetchApi(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=auto`);

        // 3. Parse Data
        const currentTemp = Math.round(weatherData.current_weather.temperature);
        const currentCondition = getWeatherCondition(weatherData.current_weather.weathercode);
        
        const dailyRecord: Record<string, DailyWeather> = {};
        
        if (weatherData.daily) {
          weatherData.daily.time.forEach((timeStr: string, idx: number) => {
            dailyRecord[timeStr] = {
              date: timeStr,
              tempMax: Math.round(weatherData.daily.temperature_2m_max[idx]),
              tempMin: Math.round(weatherData.daily.temperature_2m_min[idx]),
              condition: getWeatherCondition(weatherData.daily.weather_code[idx]),
              rainProb: weatherData.daily.precipitation_probability_max[idx] || 0,
              windSpeed: Math.round(weatherData.daily.wind_speed_10m_max[idx])
            };
          });
        }

        const data: WeatherData = {
          currentTemp,
          currentCondition,
          city: city,
          daily: dailyRecord
        };

        setWeather(data);
        onWeatherData(data);
      } catch (e) {
        console.error(e);
        setError(t('weather_error', 'Weather error'));
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, [city]);

  if (loading) return <div className="text-[#84917a] text-xs animate-pulse">{t('weather_loading', 'Loading weather...')}</div>;
  if (error || !weather) return <div className="text-[#84917a] text-xs">{error || t('weather_error')}</div>;

  const Icon = weather.currentCondition === 'Rainy' ? CloudRain : weather.currentCondition === 'Cloudy' ? Cloud : Sun;
  const tCondition = t(weather.currentCondition.toLowerCase(), weather.currentCondition);

  return (
    <div className="flex items-center gap-6 bg-slate-800/50 backdrop-blur-md px-6 py-3 rounded-full border border-[#d2d9c8]">
      <div className="flex items-center gap-2 text-[#2b3327]">
        <MapPin className="w-4 h-4 text-[#556943]" />
        <span className="text-sm font-bold uppercase tracking-wider">{weather.city}</span>
      </div>
      <div className="h-4 w-px bg-[#d2d9c8]" />
      <div className="flex items-center gap-3">
        <Icon className={weather.currentCondition === 'Clear' ? 'text-yellow-400' : 'text-[#6b7863]'} size={20} />
        <div className="flex flex-col">
          <span className="text-lg font-black text-[#2b3327] leading-none">{weather.currentTemp}°</span>
          <span className="text-[10px] text-[#6b7863] uppercase tracking-widest font-bold">{tCondition}</span>
        </div>
      </div>
      <div className="h-4 w-px bg-[#d2d9c8]" />
      <div className="text-right flex flex-col items-end">
        <span className="text-xs font-bold text-[#505c4a] leading-none capitalize">
          {new Date().toLocaleDateString(i18n.language === 'en' ? 'en-US' : (i18n.language === 'ru' ? 'ru-RU' : 'az-AZ'), { weekday: 'long' })}
        </span>
        <span className="text-[10px] text-[#84917a] uppercase tracking-widest">
          {new Date().toLocaleDateString(i18n.language === 'en' ? 'en-US' : (i18n.language === 'ru' ? 'ru-RU' : 'az-AZ'), { day: 'numeric', month: 'short' })}
        </span>
      </div>
    </div>
  );
}
