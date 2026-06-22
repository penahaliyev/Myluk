import { useEffect, useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

export interface WardrobeItem {
  id: string;
  userId: string;
  imageUrl: string;
  type: 'Item' | 'Look' | 'Duplicate';
  category: string;
  color: string;
  source?: 'my' | 'internet';
  tags?: string[];
  rating?: number;
  advice?: string;
  itemsIds?: string[];
  usedInLooks?: string[];
  duplicateOfId?: string;
  createdAt: Date;
  displayId?: string;
}

export interface ShoppingItem {
  id: string;
  userId: string;
  name: string;
  reason?: string;
  createdAt: Date;
}

export interface UserProfile {
  language?: string;
  city?: string;
  height?: number;
  weight?: number;
  tempUnit?: 'C' | 'F';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Outfit {
  id: string;
  userId: string;
  dayOfWeek: string;
  itemIds: string[];
  description?: string;
  aiEvaluation?: string;
  status?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function useHooks() {
  const [user, setUser] = useState(auth.currentUser);
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(setUser);
    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setOutfits([]);
      setProfile(null);
      setShoppingList([]);
      return;
    }

    const unsubProfile = onSnapshot(doc(db, `users/${user.uid}`), (doc) => {
      if (doc.exists()) {
        setProfile(doc.data() as UserProfile);
      }
    });

    const qItems = query(collection(db, `users/${user.uid}/wardrobeItems`), where('userId', '==', user.uid));
    const unsubItems = onSnapshot(qItems, (snapshot) => {
      const rawItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WardrobeItem));
      
      const getTimestamp = (val: any): number => {
        if (!val) return 0;
        if (val instanceof Date) return val.getTime();
        if (typeof val.toDate === 'function') {
          try {
            return val.toDate().getTime();
          } catch (_) {}
        }
        if (typeof val.seconds === 'number') return val.seconds * 1000;
        if (typeof val === 'string') return new Date(val).getTime();
        if (typeof val === 'number') return val;
        return 0;
      };

      const sorted = [...rawItems].sort((a, b) => {
        const timeA = getTimestamp(a.createdAt);
        const timeB = getTimestamp(b.createdAt);
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      });

      const mapped = rawItems.map(item => {
        const displayId = String(item.id).substring(item.id.length - 4).toUpperCase();
        return { ...item, displayId };
      });

      setItems(mapped);
    }, error => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/wardrobeItems`));

    const qOutfits = query(collection(db, `users/${user.uid}/outfits`), where('userId', '==', user.uid));
    const unsubOutfits = onSnapshot(qOutfits, (snapshot) => {
      setOutfits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Outfit)));
    }, error => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/outfits`));

    const qShopping = query(collection(db, `users/${user.uid}/shoppingItems`), where('userId', '==', user.uid));
    const unsubShopping = onSnapshot(qShopping, (snapshot) => {
      setShoppingList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShoppingItem)));
    }, error => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/shoppingItems`));

    return () => {
      unsubProfile();
      unsubItems();
      unsubOutfits();
      unsubShopping();
    };
  }, [user]);

  return { user, items, outfits, profile, shoppingList };
}
