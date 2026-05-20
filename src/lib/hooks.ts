import { useEffect, useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

export interface WardrobeItem {
  id: string;
  userId: string;
  imageUrl: string;
  type: 'Item' | 'Look';
  category: string;
  color: string;
  source?: 'my' | 'internet';
  tags?: string[];
  rating?: number;
  advice?: string;
  createdAt: Date;
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
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WardrobeItem)));
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
