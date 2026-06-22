import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { WardrobeItem, Outfit } from "../lib/hooks";
import { useTranslation } from "react-i18next";
import { DraggableItem } from "./DraggableItem";
import {
  Plus,
  UploadCloud,
  DownloadCloud,
  Image as ImageIcon,
} from "lucide-react";
import { db } from "../firebase";
import {
  doc,
  setDoc,
  collection,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { CropEditor } from "./CropEditor";

const getResizedBase64 = (dataUrl: string, maxDim = 800): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.floor((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.floor((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = dataUrl;
  });
};

export function Wardrobe({
  items,
  outfits,
  userId,
}: {
  items: WardrobeItem[];
  outfits: Outfit[];
  userId: string;
}) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [imageSrcQueue, setImageSrcQueue] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<
    "my_looks" | "my_items" | "internet"
  >("my_looks");

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const filesToProcess = acceptedFiles.slice(0, 10); // up to 10 files

    for (const file of filesToProcess) {
      const reader = new FileReader();
      const readPromise = new Promise<string>((resolve) => {
        reader.addEventListener("load", () =>
          resolve(reader.result?.toString() || ""),
        );
        reader.readAsDataURL(file);
      });
      const dataUrl = await readPromise;
      if (dataUrl) {
        setImageSrcQueue((prev) => [...prev, dataUrl]);
      }
    }
  }, []);

  const currentImageSrc = imageSrcQueue[0] || null;

  const handleUploadCropped = async (croppedImageBase64: string) => {
    setImageSrcQueue((prev) => prev.slice(1));

    const compressedBase64 = await getResizedBase64(croppedImageBase64, 800);
    const newRef = doc(collection(db, `users/${userId}/wardrobeItems`));

    try {
      const initialType = activeTab === "my_looks" ? "Look" : "Item";
      await setDoc(newRef, {
        userId,
        imageUrl: compressedBase64,
        type: initialType,
        category: "Not Analyzed",
        color: "Unknown",
        source: activeTab,
        tags: [],
        createdAt: serverTimestamp(),
      });
      toast.success(t("uploaded", "Image uploaded successfully"));
    } catch (e) {
      console.error("setDoc Error:", e);
      throw e;
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: true,
    maxFiles: 10,
    maxSize: 10 * 1024 * 1024, // 10MB
  } as any);

  const filteredItems = items.filter((item) => {
    if (activeTab === "my_looks")
      return (
        item.source !== "internet" &&
        item.type === "Look"
      );
    if (activeTab === "my_items")
      return (
        item.source !== "internet" &&
        item.type === "Item"
      );
    return item.source === "internet";
  });

  useEffect(() => {
    if (!userId || items.length === 0) return;

    const cleanupOrphanedItems = async () => {
      const allLookIds = new Set(items.filter(i => i.type === "Look").map(i => i.id));
      const orphanedItems = items.filter(i => {
        if (i.type === "Item" && Array.isArray(i.usedInLooks) && i.usedInLooks.length > 0) {
          return i.usedInLooks.every(lookId => !allLookIds.has(lookId));
        }
        return false;
      });

      if (orphanedItems.length > 0) {
        console.log(`Found ${orphanedItems.length} orphaned items. Cleaning them up...`);
        for (const orphan of orphanedItems) {
           try {
             await deleteDoc(doc(db, `users/${userId}/wardrobeItems/${orphan.id}`));
             console.log(`Cleaned up orphaned item ${orphan.id}`);
           } catch (e) {
             console.error("Failed to delete orphaned item", orphan.id, e);
           }
        }
      }
    };

    cleanupOrphanedItems();
  }, [items, userId]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex bg-white p-1.5 rounded-full overflow-x-auto border border-[#d2d9c8] max-w-full no-scrollbar">
          <button
            onClick={() => setActiveTab("my_looks")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === "my_looks"
                ? "bg-[#6b8555] text-white shadow-lg shadow-[#6b8555]/20"
                : "text-[#6b7863] hover:text-[#2b3327] hover:bg-[#d2d9c8]/50"
            }`}
          >
            <ImageIcon size={16} />
            {t("my_looks", "Мои Луки")}
          </button>
          <button
            onClick={() => setActiveTab("my_items")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === "my_items"
                ? "bg-[#6b8555] text-white shadow-lg shadow-[#6b8555]/20"
                : "text-[#6b7863] hover:text-[#2b3327] hover:bg-[#d2d9c8]/50"
            }`}
          >
            <ImageIcon size={16} />
            {t("my_items", "Мои Вещи")}
          </button>
          <button
            onClick={() => setActiveTab("internet")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === "internet"
                ? "bg-[#6b8555] text-white shadow-lg shadow-[#6b8555]/20"
                : "text-[#6b7863] hover:text-[#2b3327] hover:bg-[#d2d9c8]/50"
            }`}
          >
            <DownloadCloud size={16} />
            {t("internet_looks", "Из Интернета")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-6 relative">
        {currentImageSrc && (
          <CropEditor
            imageSrc={currentImageSrc}
            onConfirm={handleUploadCropped}
            onCancel={() => setImageSrcQueue((prev) => prev.slice(1))}
          />
        )}

        <div
          {...getRootProps()}
          className={`aspect-[2/3] rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all ${
            isDragActive
              ? "border-[#6b8555] bg-[#6b8555]/5"
              : "border-[#d2d9c8] bg-[#e4ebd8]/20 hover:border-[#6b8555] hover:bg-[#e4ebd8]/40"
          } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          <input {...getInputProps()} />
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mb-4 border border-[#d2d9c8] group-hover:scale-110 transition-transform">
            <UploadCloud className="text-[#556943]" size={24} />
          </div>
          <p className="text-[#2b3327] text-xs font-black uppercase tracking-widest leading-normal">
            {uploading
              ? t("saving")
              : activeTab === "internet"
                ? t("add_inspiration", "Добавить идею")
                : t("add_item")}
          </p>
          <div className="mt-4 flex flex-col items-center gap-1 opacity-60">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#556943]">Limit: ~10 MB</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#6b7863]">Resized to ~150 KB</p>
          </div>
        </div>

        {filteredItems.map((item) => (
          <DraggableItem key={item.id} item={item} userId={userId} allItems={items} outfits={outfits} />
        ))}
      </div>
    </div>
  );
}
