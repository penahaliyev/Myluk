import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { X, Save, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Prompt {
  id: string;
  title: string;
  description: string;
  trigger: string;
  text: string;
  adminText?: string;
  useAdminText?: boolean;
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
If it's a Look, provide its overall style as category (e.g. 'Casual', 'Business', 'Streetwear'), its main color palette as color, and extract up to 5 clothing items clearly visible in the look. Use the extracted items to count what is worn.
FOR 'Look' ONLY:
- We provide a list of existing looks the user has: \${existingLooks ? JSON.stringify(existingLooks) : '[]'}.
- CHECK carefully: if the clothing items being worn in this new image are exactly the same as one of the existing looks, return type as 'Duplicate'.
- If it is a 'Duplicate', set the 'advice' string to tell the user to delete this copy ("This is a duplicate of a previously uploaded look. Delete it."). Do not provide a rating. 
FOR BOTH 'Item' and 'Look' (if not Duplicate):
- Automatically rate it from 1.0 to 5.0 (fractional allowed). For a Look, rate the overall appearance. For an Item, rate its versatility, style, and condition.
- Provide an "advice" string. Explain how these clothes fit together (or what this item combines well with), what does NOT combine with it, and why this rating is given. Mention the number of items and what they are. Keep it concise.
FOR 'Look' ONLY (if not Duplicate):
- Provide an array 'extractedItems'. Each object should have 'name', 'category', 'color', and 'attributes' (brief description of texture, pattern etc).
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

export function AdminPanel({ onClose }: { onClose: () => void }) { // force sync
  const { t } = useTranslation();
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

  const handleToggle = async (p: Prompt) => {
    try {
      const newValue = !p.useAdminText;
      // immediate local update
      setPrompts(prev => prev.map(i => i.id === p.id ? { ...i, useAdminText: newValue } : i));
      
      await setDoc(doc(db, 'prompts', p.id), {
        ...p,
        text: DEFAULT_PROMPTS[p.id].text,
        description: DEFAULT_PROMPTS[p.id].description,
        trigger: DEFAULT_PROMPTS[p.id].trigger,
        useAdminText: newValue,
        adminText: p.adminText || DEFAULT_PROMPTS[p.id].text,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      toast.success(newValue ? 'Switched to Admin override' : 'Switched to AI Preset');
    } catch (e) {
      console.error(e);
      toast.error('Failed to toggle prompt mode');
      fetchPrompts(); // revert on fail
    }
  };

  const saveAdminText = async (p: Prompt, newText: string) => {
    setSaving(p.id);
    try {
      await setDoc(doc(db, 'prompts', p.id), {
        ...p,
        text: DEFAULT_PROMPTS[p.id].text,
        description: DEFAULT_PROMPTS[p.id].description,
        trigger: DEFAULT_PROMPTS[p.id].trigger,
        adminText: newText,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error(e);
      toast.error('Failed to save text');
    } finally {
      setSaving(null);
    }
  };

  const handleInit = async () => {
    setLoading(true);
    try {
      for (const key in DEFAULT_PROMPTS) {
        await setDoc(doc(db, 'prompts', key), {
          ...DEFAULT_PROMPTS[key],
          adminText: DEFAULT_PROMPTS[key].text,
          useAdminText: false,
          updatedAt: serverTimestamp()
        });
      }
      toast.success('Database initialized');
      fetchPrompts();
    } catch (e) {
      console.error(e);
      toast.error('Init failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-[100] bg-white/90 backdrop-blur-md flex items-center justify-center p-6">
        <div className="bg-[#eef2e6] border border-red-500/30 p-8 rounded-3xl max-w-sm w-full text-center">
           <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
           <h2 className="text-xl font-black text-[#2b3327] uppercase tracking-tighter mb-2">{t('admin_access_denied', 'Access Denied')}</h2>
           <p className="text-[#6b7863] text-sm mb-6">{t('admin_restricted_msg', 'This area is reserved for the administrator.')}</p>
           <button onClick={onClose} className="w-full py-3 bg-white text-[#2b3327] rounded-xl font-bold uppercase tracking-widest text-xs">{t('admin_close', 'Close')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#e4ebd8] flex flex-col">
       <header className="flex items-center justify-between p-6 border-b border-[#d2d9c8] bg-[#eef2e6]/50">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-[#6b8555] flex items-center justify-center">
                <ShieldCheck className="text-white" size={24} />
             </div>
             <div>
                <h1 className="text-xl font-black text-[#2b3327] uppercase tracking-tighter">{t('admin_title', 'AI Admin Panel')}</h1>
                <p className="text-[10px] text-[#556943] font-bold uppercase tracking-widest">{t('admin_subtitle', 'Manage System Prompts')}</p>
             </div>
          </div>
          <div className="flex items-center gap-3">
             <button onClick={onClose} className="p-2 text-[#6b7863] hover:text-[#2b3327] bg-white rounded-xl transition-colors">
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
             <div className="text-center py-20 bg-[#eef2e6]/50 border border-dashed border-[#d2d9c8] rounded-3xl">
                <p className="text-[#84917a] mb-6">{t('admin_no_prompts', 'No prompts found in database.')}</p>
                <button onClick={handleInit} className="px-8 py-4 bg-[#6b8555] text-white font-black uppercase tracking-widest text-xs rounded-full">{t('admin_init_db', 'Initialize Database')}</button>
             </div>
          ) : (
             prompts.map(p => (
                <div key={p.id} className="bg-[#eef2e6] border border-[#d2d9c8] rounded-3xl overflow-hidden shadow-xl">
                   <div className="bg-slate-800/50 p-6 border-b border-[#d2d9c8] flex items-center justify-between">
                      <div>
                         <h3 className="text-lg font-black text-[#2b3327] uppercase tracking-tight">{p.title}</h3>
                         <p className="text-xs text-[#84917a] font-medium uppercase tracking-widest">{p.id}</p>
                      </div>
                      <div className="flex items-center gap-3 bg-[#e4ebd8] p-2 rounded-xl border border-[#d2d9c8]">
                         <span className={`text-xs font-bold uppercase tracking-widest ${!p.useAdminText ? 'text-[#556943]' : 'text-[#84917a]'}`}>{t('admin_ai_preset', 'AI Preset')}</span>
                         <button 
                            onClick={() => handleToggle(p)}
                            className={`w-12 h-6 rounded-full relative transition-colors ${p.useAdminText ? 'bg-[#6b8555]' : 'bg-[#d2d9c8]'}`}
                         >
                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${p.useAdminText ? 'translate-x-6' : 'translate-x-0'}`} />
                         </button>
                         <span className={`text-xs font-bold uppercase tracking-widest ${p.useAdminText ? 'text-[#556943]' : 'text-[#84917a]'}`}>{t('admin_override', 'Admin')}</span>
                      </div>
                   </div>
                   <div className="p-6 md:p-8 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                           <label className="block text-[10px] text-[#84917a] font-bold uppercase tracking-[0.2em] mb-2 px-1">{t('admin_desc', 'Description')}</label>
                           <div className="w-full bg-[#e4ebd8] border border-[#d2d9c8] rounded-xl p-4 text-sm text-[#6b7863]">
                              {DEFAULT_PROMPTS[p.id]?.description || p.description}
                           </div>
                        </div>
                        <div>
                           <label className="block text-[10px] text-[#84917a] font-bold uppercase tracking-[0.2em] mb-2 px-1">{t('admin_trigger', 'Trigger Mechanism')}</label>
                           <div className="w-full bg-[#e4ebd8] border border-[#d2d9c8] rounded-xl p-4 text-sm text-[#6b8555]/80">
                              {DEFAULT_PROMPTS[p.id]?.trigger || p.trigger}
                           </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                         <div>
                            <label className="block text-[10px] text-[#84917a] font-bold uppercase tracking-[0.2em] mb-2 px-1 flex flex-wrap gap-2 items-center justify-between">
                               <span>{t('admin_ai_prompt', 'AI Prompt')} {saving === p.id && <RefreshCw size={10} className="inline ml-2 animate-spin text-[#6b8555]" />}</span>
                               {!p.useAdminText && <span className="text-[#556943] flex items-center gap-1"><ShieldCheck size={12}/> {t('admin_active', 'Active')}</span>}
                            </label>
                            <textarea 
                               readOnly
                               value={DEFAULT_PROMPTS[p.id]?.text || p.text}
                               rows={8}
                               className={`w-full bg-[#e4ebd8] border ${!p.useAdminText ? 'border-[#6b8555] shadow-[0_0_15px_rgba(107,133,85,0.1)] text-[#505c4a]' : 'border-[#d2d9c8] text-[#84917a]'} rounded-2xl p-6 text-sm font-mono leading-relaxed outline-none transition-all resize-y`}
                            />
                         </div>
                         <div>
                            <label className="block text-[10px] text-[#84917a] font-bold uppercase tracking-[0.2em] mb-2 px-1 flex flex-wrap gap-2 items-center justify-between">
                               <span>{t('admin_editable', 'Admin Override (Editable)')} </span>
                               {p.useAdminText && <span className="text-[#556943] flex items-center gap-1"><ShieldCheck size={12}/> {t('admin_active', 'Active')}</span>}
                            </label>
                            <textarea 
                               value={p.adminText !== undefined ? p.adminText : (p.text || '')}
                               onChange={(e) => {
                                  const newPrompts = prompts.map(i => i.id === p.id ? {...i, adminText: e.target.value} : i);
                                  setPrompts(newPrompts);
                               }}
                               onBlur={(e) => saveAdminText(p, e.target.value)}
                               rows={8}
                               className={`w-full bg-[#e4ebd8] border ${p.useAdminText ? 'border-[#6b8555] shadow-[0_0_15px_rgba(107,133,85,0.1)] text-[#505c4a]' : 'border-[#d2d9c8] focus:border-[#84917a] text-[#84917a] focus:text-[#505c4a]'} rounded-2xl p-6 text-sm font-mono leading-relaxed outline-none transition-all resize-y`}
                            />
                         </div>
                      </div>
                   </div>
                </div>
             ))
          )}
       </div>
    </div>
  );
}
