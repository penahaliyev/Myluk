import React, { useState } from 'react';
import { ShoppingItem, UserProfile } from '../lib/hooks';
import { useTranslation } from 'react-i18next';
import { Trash2, ShoppingBag, Plus } from 'lucide-react';
import { doc, deleteDoc, setDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';

export function ShoppingList({ items, userId }: { items: ShoppingItem[], userId: string }) {
  const { t } = useTranslation();
  const [newItemName, setNewItemName] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    
    setAdding(true);
    try {
      const newRef = doc(collection(db, `users/${userId}/shoppingItems`));
      await setDoc(newRef, {
        userId,
        name: newItemName.trim(),
        createdAt: serverTimestamp()
      });
      setNewItemName('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await deleteDoc(doc(db, `users/${userId}/shoppingItems/${itemId}`));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-4 bg-slate-800 p-6 rounded-3xl border border-slate-700">
        <div className="w-12 h-12 bg-cyan-500/20 rounded-2xl flex items-center justify-center">
          <ShoppingBag className="text-cyan-400" size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-tighter">План Закупок</h2>
          <p className="text-sm text-slate-400">Список вещей, которые ИИ советует добавить в гардероб</p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="flex gap-4">
        <input
          type="text"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Добавить новую вещь..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-medium"
        />
        <button
          type="submit"
          disabled={adding || !newItemName.trim()}
          className="bg-cyan-500 text-slate-950 px-8 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-cyan-400 transition-all disabled:opacity-50 shadow-lg shadow-cyan-500/20 flex items-center gap-2"
        >
          <Plus size={16} />
          Добавить
        </button>
      </form>

      <div className="flex flex-col gap-3">
        {items.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm font-bold uppercase tracking-widest italic border border-dashed border-slate-700 rounded-3xl">
            Список покупок пуст
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="flex items-center justify-between bg-slate-800 p-4 rounded-2xl border border-slate-700 group hover:border-slate-600 transition-all">
              <div className="flex flex-col">
                <span className="text-white font-medium">{item.name}</span>
                {item.reason && <span className="text-xs text-slate-400 italic">"{item.reason}"</span>}
              </div>
              <button 
                onClick={() => handleDelete(item.id)}
                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
