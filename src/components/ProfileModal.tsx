import React, { useState, useEffect } from 'react';
import { UserProfile } from '../lib/hooks';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import { X, Save, User, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchApi } from '../lib/utils';

export function ProfileModal({ 
  userId, 
  profile, 
  onClose 
}: { 
  userId: string, 
  profile: UserProfile | null,
  onClose: () => void 
}) {
  const { t } = useTranslation();
  const [city, setCity] = useState(profile?.city || '');
  const [citySearch, setCitySearch] = useState('');
  const [cityResults, setCityResults] = useState<any[]>([]);
  const [searchingCity, setSearchingCity] = useState(false);
  
  const [height, setHeight] = useState(profile?.height || '');
  const [weight, setWeight] = useState(profile?.weight || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setCity(profile.city || '');
      setHeight(profile.height || '');
      setWeight(profile.weight || '');
    }
  }, [profile]);

  useEffect(() => {
    if (citySearch.length < 2) {
      setCityResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingCity(true);
      try {
        const data = await fetchApi(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(citySearch)}&count=5&language=ru`);
        if (data.results) {
          setCityResults(data.results);
        } else {
          setCityResults([]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setSearchingCity(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [citySearch]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (!profile?.createdAt) {
        const data: any = {
          userId,
          city,
          height: height ? Number(height) : null,
          weight: weight ? Number(weight) : null,
          language: profile?.language || 'ru',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        await setDoc(doc(db, `users/${userId}`), data);
      } else {
        const data: any = {
          city,
          height: height ? Number(height) : null,
          weight: weight ? Number(weight) : null,
          updatedAt: serverTimestamp()
        };
        await updateDoc(doc(db, `users/${userId}`), data);
      }

      toast.success(t('status_READY', 'Saved Successfully'));
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#e4ebd8]/80 backdrop-blur-sm p-4">
      <div className="bg-[#eef2e6] border border-[#d2d9c8] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden shadow-cyan-900/20 flex flex-col max-h-[90vh]">
        <div className="p-6 flex items-center justify-between border-b border-[#d2d9c8] bg-slate-800/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#6b8555]/20 rounded-xl flex items-center justify-center text-[#556943]">
               <User size={20} />
            </div>
            <h3 className="text-xl font-black text-[#2b3327] uppercase tracking-tighter">{t('home_tab_cabinet', 'Личный Кабинет')}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full text-[#6b7863] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 custom-scrollbar p-6">
          <form id="profile-form" onSubmit={handleSave} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2 relative">
              <label className="text-xs font-bold text-[#6b7863] uppercase tracking-widest">Город (для погоды)</label>
              
              {!city ? (
                <>
                  <input 
                    type="text" 
                    value={citySearch}
                    onChange={e => setCitySearch(e.target.value)}
                    placeholder="Поиск города..."
                    className="bg-white border border-[#d2d9c8] rounded-xl px-4 py-3 text-[#2b3327] focus:outline-none focus:border-[#6b8555] font-medium"
                  />
                  {cityResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-[#d2d9c8] rounded-xl overflow-hidden z-10 shadow-xl max-h-48 overflow-y-auto">
                      {cityResults.map(result => (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => {
                            setCity(result.name);
                            setCitySearch('');
                            setCityResults([]);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-[#d2d9c8] text-[#2b3327] flex flex-col border-b border-[#d2d9c8]/50 last:border-0"
                        >
                          <span className="font-bold">{result.name}</span>
                          <span className="text-xs text-[#6b7863]">{result.admin1}, {result.country}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between bg-[#6b8555]/10 border border-[#6b8555]/30 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-[#556943]" />
                    <span className="text-[#2b3327] font-bold">{city}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setCity(''); setCitySearch(''); }}
                    className="text-[#6b7863] hover:text-[#2b3327]"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[#6b7863] uppercase tracking-widest">Рост (см)</label>
                <input 
                  type="number" 
                  value={height}
                  onChange={e => setHeight(e.target.value)}
                  placeholder="175"
                  className="bg-white border border-[#d2d9c8] rounded-xl px-4 py-3 text-[#2b3327] focus:outline-none focus:border-[#6b8555] font-medium"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[#6b7863] uppercase tracking-widest">Вес (кг)</label>
                <input 
                  type="number" 
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  placeholder="70"
                  className="bg-white border border-[#d2d9c8] rounded-xl px-4 py-3 text-[#2b3327] focus:outline-none focus:border-[#6b8555] font-medium"
                />
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-[#d2d9c8] bg-slate-800/50 flex-shrink-0">
          <button 
            type="submit" 
            form="profile-form"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#6b8555] to-[#8ca874] text-white font-black uppercase tracking-widest text-xs py-4 rounded-xl shadow-lg shadow-[#6b8555]/20 hover:shadow-[#6b8555]/40 transition-all disabled:opacity-50"
          >
            {saving ? 'Сохранение...' : <><Save size={16} /> Сохранить</>}
          </button>
        </div>
      </div>
    </div>
  );
}
