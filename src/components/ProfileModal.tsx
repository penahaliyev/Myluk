import React, { useState, useEffect } from 'react';
import { UserProfile } from '../lib/hooks';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import { X, Save, User, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
        const resp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(citySearch)}&count=5&language=ru`);
        const data = await resp.json();
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden shadow-cyan-900/20 flex flex-col max-h-[90vh]">
        <div className="p-6 flex items-center justify-between border-b border-slate-800 bg-slate-800/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center text-cyan-400">
               <User size={20} />
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Личный Кабинет</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 custom-scrollbar p-6">
          <form id="profile-form" onSubmit={handleSave} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2 relative">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Город (для погоды)</label>
              
              {!city ? (
                <>
                  <input 
                    type="text" 
                    value={citySearch}
                    onChange={e => setCitySearch(e.target.value)}
                    placeholder="Поиск города..."
                    className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 font-medium"
                  />
                  {cityResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden z-10 shadow-xl max-h-48 overflow-y-auto">
                      {cityResults.map(result => (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => {
                            setCity(result.name);
                            setCitySearch('');
                            setCityResults([]);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-slate-700 text-white flex flex-col border-b border-slate-700/50 last:border-0"
                        >
                          <span className="font-bold">{result.name}</span>
                          <span className="text-xs text-slate-400">{result.admin1}, {result.country}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between bg-cyan-500/10 border border-cyan-500/30 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-cyan-400" />
                    <span className="text-white font-bold">{city}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setCity(''); setCitySearch(''); }}
                    className="text-slate-400 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Рост (см)</label>
                <input 
                  type="number" 
                  value={height}
                  onChange={e => setHeight(e.target.value)}
                  placeholder="175"
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 font-medium"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Вес (кг)</label>
                <input 
                  type="number" 
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  placeholder="70"
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400 font-medium"
                />
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-slate-800 bg-slate-800/50 flex-shrink-0">
          <button 
            type="submit" 
            form="profile-form"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 font-black uppercase tracking-widest text-xs py-4 rounded-xl shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all disabled:opacity-50"
          >
            {saving ? 'Сохранение...' : <><Save size={16} /> Сохранить</>}
          </button>
        </div>
      </div>
    </div>
  );
}
