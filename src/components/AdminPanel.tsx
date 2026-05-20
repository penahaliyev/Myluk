import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { X, Save, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface Prompt {
  id: string;
  title: string;
  description: string;
  trigger: string;
  text: string;
  updatedAt: any;
}

const DEFAULT_PROMPTS: Record<string, Omit<Prompt, 'updatedAt'>> = {
  'analyze-image': {
    id: 'analyze-image',
    title: 'Image Analysis & Assessment',
    description: 'Automated AI categorization and look scoring.',
    trigger: 'Background (Triggered automatically when any image is uploaded to the wardrobe).',
    text: `Analyze this image which contains either a single clothing item or a full outfit/look. 
Determine whether it's a single item ('Item') or a full ready-made look/outfit ('Look').
If it's an Item, provide its category and color.
If it's a Look, provide its overall style as category (e.g. 'Casual', 'Business', 'Streetwear'), its main color palette as color, and extract up to 5 clothing items clearly visible in the look as an array of tags.
FOR BOTH 'Item' and 'Look':
- Automatically rate it from 1.0 to 5.0 (fractional allowed). For a Look, rate the overall appearance. For an Item, rate its versatility, style, and condition.
- Provide an "advice" string. Explain briefly how these clothes combine (or what this item combines well with), what does NOT combine with it, and why this rating is given. Keep it concise.
- DO NOT provide tips on what to buy or how to improve it yet. That will be asked later.
Translate all string values into the given Language.`
  },
  'evaluate-outfit': {
    id: 'evaluate-outfit',
    title: 'Outfit Matching Check',
    description: 'Validates style and color compatibility for a specific event.',
    trigger: 'Manual (Triggered when user drops items into a Day Card and clicks the "Check Matching" button).',
    text: `Evaluate the following outfit combinations for a user going to {targetEvent || 'daily activities'}.
Analyze the style, color matching, formal correctness, and give a short advice. 
Determine if the outfit is "READY", "NEEDS_IMPROVEMENT" or "NOT_RECOMMENDED".
Finally, suggest 1 missing item that the user should buy to improve their wardrobe based on these items.
Return the result in JSON.`
  },
  'evaluate-single-item': {
    id: 'evaluate-single-item',
    title: 'Manual Item Scoring',
    description: 'Score a single item (legacy/fallback).',
    trigger: 'Manual (Triggered by "Score Now" button in the Item Card info tab).',
    text: `Evaluate this clothing item or look for a personal wardrobe.
Rate it on a scale of 1 to 5 based on versatility, style, and utility. Fractional numbers (e.g. 4.5) are allowed. Return only a JSON object with rating (number).`
  },
  'suggest-improvements': {
    id: 'suggest-improvements',
    title: 'Actionable Styling Tips',
    description: 'Fixing looks and shopping suggestions.',
    trigger: 'Manual (Triggered when the user clicks the "Suggest Improvements" button inside the Item Card).',
    text: `Analyze this clothing item or look for a personal wardrobe and suggest specific, actionable improvements based on current trends.
Keep the answer very short and specific. What must be changed? What should be bought? 
If an item needs to be bought to improve this look, add it to itemsToBuy.`
  },
  'generate-weekly-plan': {
    id: 'generate-weekly-plan',
    title: 'Weekly Scheduler Engine',
    description: 'Core logic for 7-day automated planning.',
    trigger: 'Manual (Triggered via the main "Generate" button on the weekly board).',
    text: `You are a virtual stylist. Create a weekly wardrobe plan (7 days).
Take weather and location into account when choosing outfits.
If there are not enough items, you can repeat looks throughout the week, but try to vary them.
Return a JSON object mapping each day key to an array of item IDs.`
  },
  'chat-assistant': {
    id: 'chat-assistant',
    title: 'Stylist Chat Core',
    description: 'The personality and contextual engine of the AI Chat.',
    trigger: 'Background (Injected into every chat segment to provide the AI with user wardrobe context).',
    text: `You are an expert personal stylist. Be concise, direct, and knowledgeable.
Answer the user's fashion & styling questions using their wardrobe items as context.`
  }
};

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const isAdmin = auth.currentUser?.email === 'penahaliyev@gmail.com';

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'prompts'), orderBy('id'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => doc.data() as Prompt);
      setPrompts(data);
    } catch (e) {
      console.error(e);
      toast.error('Failed to fetch prompts');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (p: Prompt) => {
    setSaving(p.id);
    try {
      await setDoc(doc(db, 'prompts', p.id), {
        ...p,
        updatedAt: serverTimestamp()
      });
      toast.success(`${p.title} saved`);
    } catch (e) {
      console.error(e);
      toast.error('Save failed');
    } finally {
      setSaving(null);
    }
  };

  const handleSeed = async (mode: 'all' | 'meta' = 'all') => {
    setLoading(true);
    try {
      for (const key in DEFAULT_PROMPTS) {
        const existing = prompts.find(pr => pr.id === key);
        const dataToSave = mode === 'all' 
          ? { ...DEFAULT_PROMPTS[key], updatedAt: serverTimestamp() }
          : { 
              ...(existing || DEFAULT_PROMPTS[key]), 
              description: DEFAULT_PROMPTS[key].description, 
              trigger: DEFAULT_PROMPTS[key].trigger,
              updatedAt: serverTimestamp() 
            };

        await setDoc(doc(db, 'prompts', key), dataToSave);
      }
      toast.success(mode === 'all' ? 'All prompts reset to default' : 'Triggers & descriptions updated');
      fetchPrompts();
    } catch (e) {
      console.error(e);
      toast.error('Seed failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-red-500/30 p-8 rounded-3xl max-w-sm w-full text-center">
           <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
           <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Access Denied</h2>
           <p className="text-slate-400 text-sm mb-6">This area is reserved for the administrator.</p>
           <button onClick={onClose} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold uppercase tracking-widest text-xs">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col">
       <header className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center">
                <ShieldCheck className="text-slate-900" size={24} />
             </div>
             <div>
                <h1 className="text-xl font-black text-white uppercase tracking-tighter">AI Admin Panel</h1>
                <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">Manage System Prompts</p>
             </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center bg-slate-800 rounded-xl overflow-hidden p-1">
                <button 
                   onClick={() => {
                     if (confirm('Обновить описание и триггеры всех промптов? (Безопасный сброс)')) {
                       if (confirm('Вы точно уверены? Это обновит только описание и информацию о триггерах, основной текст промптов останется прежним.')) {
                          handleSeed('meta');
                       }
                     }
                   }} 
                   className="px-4 py-2 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
                   title="Обновить только описание и механизмы триггеров"
                >
                   <ShieldCheck size={14} />
                   Безопасный сброс
                </button>
                <div className="w-[1px] h-4 bg-slate-700" />
                <button 
                   onClick={() => {
                     if (confirm('ВНИМАНИЕ: Сбросить ВСЕ промпты к начальным настройкам?')) {
                        if (confirm('ЭТО УДАЛИТ ВАШИ ИЗМЕНЕНИЯ В ТЕКСТЕ ПРОМПТОВ. Продолжить?')) {
                           handleSeed('all');
                        }
                     }
                   }} 
                   className="px-4 py-2 hover:bg-red-500/10 text-slate-300 hover:text-red-400 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
                   title="Полный сброс всех промптов и текстов"
                >
                   <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                   Полный сброс
                </button>
             </div>
             <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors">
                <X size={20} />
             </button>
          </div>
       </header>

       <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10 custom-scrollbar">
          {loading ? (
             <div className="flex flex-col items-center justify-center h-full opacity-50">
                <RefreshCw className="animate-spin mb-4" />
                <p className="text-sm uppercase tracking-widest font-bold">Loading Prompts...</p>
             </div>
          ) : prompts.length === 0 ? (
             <div className="text-center py-20 bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl">
                <p className="text-slate-500 mb-6">No prompts found in database.</p>
                <button onClick={handleSeed} className="px-8 py-4 bg-cyan-500 text-slate-900 font-black uppercase tracking-widest text-xs rounded-full">Initialize Database</button>
             </div>
          ) : (
             prompts.map(p => (
                <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                   <div className="bg-slate-800/50 p-6 border-b border-slate-800 flex items-center justify-between">
                      <div>
                         <h3 className="text-lg font-black text-white uppercase tracking-tight">{p.title}</h3>
                         <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">{p.id}</p>
                      </div>
                      <button 
                        onClick={() => handleSave(p)} 
                        disabled={saving === p.id}
                        className="flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-xl font-bold uppercase tracking-widest text-xs transition-all disabled:opacity-50"
                      >
                         {saving === p.id ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                         {saving === p.id ? 'Saving...' : 'Save Changes'}
                      </button>
                   </div>
                   <div className="p-6 md:p-8 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                           <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mb-2 px-1">Description</label>
                           <input 
                              type="text" 
                              value={p.description || ''}
                              onChange={(e) => {
                                 const newPrompts = prompts.map(i => i.id === p.id ? {...i, description: e.target.value} : i);
                                 setPrompts(newPrompts);
                              }}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 focus:border-cyan-500/50 outline-none transition-colors"
                           />
                        </div>
                        <div>
                           <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mb-2 px-1">Trigger Mechanism</label>
                           <input 
                              type="text" 
                              value={p.trigger || ''}
                              onChange={(e) => {
                                 const newPrompts = prompts.map(i => i.id === p.id ? {...i, trigger: e.target.value} : i);
                                 setPrompts(newPrompts);
                              }}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-cyan-400 focus:border-cyan-500/50 outline-none transition-colors"
                              placeholder="e.g. Automatic or User Request"
                           />
                        </div>
                      </div>
                      <div>
                         <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mb-2 px-1">Prompt Text</label>
                         <textarea 
                            value={p.text || ''}
                            onChange={(e) => {
                               const newPrompts = prompts.map(i => i.id === p.id ? {...i, text: e.target.value} : i);
                               setPrompts(newPrompts);
                            }}
                            rows={8}
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 text-sm text-slate-300 font-mono leading-relaxed focus:border-cyan-500/50 outline-none transition-colors"
                         />
                      </div>
                   </div>
                </div>
             ))
          )}
       </div>
    </div>
  );
}
