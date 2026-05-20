import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, LogOut, Shirt } from 'lucide-react';
import { auth, db } from '../firebase';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export function Layout() {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    return auth.onAuthStateChanged((u) => {
      setUser(u);
      if (u) {
        // sync language
        getDoc(doc(db, 'users', u.uid)).then(docSnap => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.language) i18n.changeLanguage(data.language);
          } else {
            setDoc(doc(db, 'users', u.uid), {
              userId: u.uid,
              language: i18n.language,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            }, { merge: true });
          }
        });
      }
    });
  }, []);

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    if (user) {
      setDoc(doc(db, 'users', user.uid), {
        language: lang,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
  };

  const login = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans flex flex-col">
      <header className="px-12 py-10 flex justify-between items-start bg-transparent z-50">
        <div className="flex items-center gap-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tighter uppercase">
              {t('app_name').split(' / ')[0]} 
            </h1>
            <div className="text-xs text-slate-400 uppercase tracking-widest hidden sm:block">
              {t('app_name').split(' / ')[1] || 'Universal System Interface'}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex border border-slate-700 rounded-full px-4 py-2 gap-4 text-xs font-bold">
            <span 
              className={`cursor-pointer transition-colors ${i18n.language === 'en' ? 'text-cyan-400' : 'text-slate-400 hover:text-white'}`}
              onClick={() => changeLanguage('en')}
            >
              EN
            </span>
            <span className="text-slate-500">/</span>
            <span 
              className={`cursor-pointer transition-colors ${i18n.language === 'ru' ? 'text-cyan-400' : 'text-slate-400 hover:text-white'}`}
              onClick={() => changeLanguage('ru')}
            >
              RU
            </span>
            <span className="text-slate-500">/</span>
            <span 
              className={`cursor-pointer transition-colors ${i18n.language === 'az' ? 'text-cyan-400' : 'text-slate-400 hover:text-white'}`}
              onClick={() => changeLanguage('az')}
            >
              AZ
            </span>
          </div>
          
          {user ? (
            <button onClick={() => signOut(auth)} className="bg-white text-slate-900 px-6 py-2 rounded-full text-xs font-bold uppercase hover:bg-cyan-400 transition-colors flex gap-2 items-center">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{t('sign_out')}</span>
            </button>
          ) : (
            <button onClick={login} className="bg-white text-slate-900 px-6 py-2 rounded-full text-xs font-bold uppercase hover:bg-cyan-400 transition-colors flex gap-2 items-center">
              <LogIn className="w-4 h-4" />
              <span>{t('sign_in_google')}</span>
            </button>
          )}
        </div>
      </header>
      
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
