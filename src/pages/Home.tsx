import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useTranslation } from 'react-i18next';
import { useHooks } from '../lib/hooks';
import { WeeklyBoard } from '../components/WeeklyBoard';
import { Wardrobe } from '../components/Wardrobe';
import { ShoppingList } from '../components/ShoppingList';
import { ProfileModal } from '../components/ProfileModal';
import { FloatingChat } from '../components/FloatingChat';
import { AdminPanel } from '../components/AdminPanel';
import { useState } from 'react';
import { Settings, ShoppingBag, LayoutDashboard, ShieldCheck } from 'lucide-react';

export function Home() {
  const { user, items, outfits, profile, shoppingList } = useHooks();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'main' | 'shopping'>('main');
  const [showProfile, setShowProfile] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const isAdmin = user?.email === 'penahaliyev@gmail.com';

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
        <h2 className="text-4xl font-black tracking-tighter uppercase mb-4">{t('app_name').split(' / ')[0]}</h2>
        <p className="text-slate-400 max-w-md mx-auto">{t('no_items')}</p>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      {showProfile && (
        <ProfileModal 
          userId={user.uid} 
          profile={profile} 
          onClose={() => setShowProfile(false)} 
        />
      )}

      {showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
      )}

      <div className="p-8 md:p-12 space-y-12 max-w-7xl mx-auto flex-1">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-b border-slate-700 pb-8">
          <div className="flex bg-slate-800 p-1.5 rounded-full border border-slate-700">
            <button
              onClick={() => setActiveTab('main')}
              className={`flex items-center gap-2 px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === 'main' 
                  ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <LayoutDashboard size={16} />
              <span className="hidden sm:block">{t('home_tab_wardrobe', 'Гардероб & План')}</span>
            </button>
            <button
              onClick={() => setActiveTab('shopping')}
              className={`flex items-center gap-2 px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === 'shopping' 
                  ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <ShoppingBag size={16} />
              <span className="hidden sm:block">{t('home_tab_shopping', 'Покупки')}</span>
              {shoppingList.length > 0 && (
                <span className="bg-slate-900 text-cyan-400 px-2 py-0.5 rounded-full text-[10px]">
                  {shoppingList.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-4">
            {isAdmin && (
              <button 
                onClick={() => setShowAdmin(true)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all border border-slate-700"
              >
                <ShieldCheck size={16} className="text-cyan-400" />
                <span className="hidden sm:block">{t('home_tab_admin', 'Admin')}</span>
              </button>
            )}

            <button 
              onClick={() => setShowProfile(true)}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all border border-slate-700"
            >
              <Settings size={16} className="text-cyan-400" />
              <span className="hidden sm:block">{t('home_tab_cabinet', 'Кабинет')}</span>
            </button>
          </div>
        </div>

        {activeTab === 'main' && (
          <div className="space-y-16">
            <section>
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-4xl font-black tracking-tighter uppercase text-white">{t('home_title')}</h2>
              </div>
              <WeeklyBoard items={items} outfits={outfits} userId={user.uid} profile={profile} />
            </section>

            <section>
              <div className="flex items-center justify-between mb-8 mt-16 border-t border-slate-700 pt-16">
                <h2 className="text-4xl font-black tracking-tighter uppercase text-white">{t('wardrobe')}</h2>
              </div>
              <Wardrobe items={items} userId={user.uid} />
            </section>
          </div>
        )}

        {activeTab === 'shopping' && (
          <section className="py-8">
            <ShoppingList items={shoppingList} userId={user.uid} />
          </section>
        )}
        
        <FloatingChat wardrobeItems={items} profile={profile} />
      </div>
    </DndProvider>
  );
}
