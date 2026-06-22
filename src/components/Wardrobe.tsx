import React, { useState, useCallback, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { WardrobeItem, Outfit } from "../lib/hooks";
import { useTranslation } from "react-i18next";
import { DraggableItem } from "./DraggableItem";
import {
  Plus,
  UploadCloud,
  DownloadCloud,
  Image as ImageIcon,
  Loader2,
  Clock,
} from "lucide-react";
import { db } from "../firebase";
import {
  doc,
  setDoc,
  updateDoc,
  collection,
  serverTimestamp,
  arrayUnion,
  deleteDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { fetchApi } from "../lib/utils";
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

const cropImage = async (base64: string, boundingBox: number[]): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx || !boundingBox || boundingBox.length !== 4) return resolve(base64);

      let [ymin, xmin, ymax, xmax] = boundingBox;
      ymin = Math.max(0, Math.min(1, ymin));
      xmin = Math.max(0, Math.min(1, xmin));
      ymax = Math.max(0, Math.min(1, ymax));
      xmax = Math.max(0, Math.min(1, xmax));
      
      if (ymin >= ymax || xmin >= xmax) {
        return resolve(base64);
      }

      const x = Math.max(0, xmin * img.width);
      const y = Math.max(0, ymin * img.height);
      const w = Math.min(img.width, (xmax - xmin) * img.width);
      const h = Math.min(img.height, (ymax - ymin) * img.height);

      canvas.width = w;
      canvas.height = h;
      
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      resolve(canvas.toDataURL('image/webp', 0.9));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
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
  const { t, i18n } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [imageSrcQueue, setImageSrcQueue] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<
    "my_looks" | "my_items" | "internet"
  >("my_looks");
  const [reanalyzeStatus, setReanalyzeStatus] = useState<{
    total: number;
    current: number;
    currentItemId: string;
    logs: string[];
  } | null>(null);
  const abortRef = useRef(false);

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
      // Optimistic instant save
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

  // --- Cleanup Orphaned Items ---
  useEffect(() => {
    if (!userId || items.length === 0) return;

    const cleanupOrphanedItems = async () => {
      const allLookIds = new Set(items.filter(i => i.type === "Look").map(i => i.id));
      const orphanedItems = items.filter(i => {
        if (i.type === "Item" && Array.isArray(i.usedInLooks) && i.usedInLooks.length > 0) {
          // If all looks that use this item are gone, it's orphaned
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
  }, [items, userId, db]);
  // ------------------------------

  const handleReanalyzeMissed = async () => {
    const toAnalyze = items.filter(i => i.category === 'Processing...' || i.category === 'Not Analyzed');
    if (toAnalyze.length === 0) {
      toast.info("No items to analyze.");
      return;
    }

    abortRef.current = false;
    setReanalyzeStatus({
      total: toAnalyze.length,
      current: 0,
      currentItemId: "",
      logs: ["Starting database re-evaluation..."],
    });
    let successCount = 0;

    // Build context of existing looks for duplicate detection
    const existingLooks = items
      .filter((i) => i.type === "Look")
      .map((i) => ({
        id: i.id,
        category: i.category,
        color: i.color,
        tags: i.tags,
      }));

    const existingItemsForAI = items
      .filter((i) => i.type === "Item")
      .map((i) => ({
        id: i.id,
        category: i.category,
        color: i.color,
        tags: i.tags,
      }));

    // Process in batches of 3 to speed up, while avoiding simple rate limits
    let completedCount = 0;
    const batchSize = 1;

    for (let i = 0; i < toAnalyze.length; i += batchSize) {
      if (abortRef.current) {
        setReanalyzeStatus((prev) =>
          prev
            ? {
                ...prev,
                logs: [...prev.logs, `CANCELED BY USER.`],
              }
            : null,
        );
        break;
      }

      const batch = toAnalyze.slice(i, i + batchSize);

      setReanalyzeStatus((prev) =>
        prev
          ? {
              ...prev,
              logs: [
                ...prev.logs,
                `Starting batch ${Math.floor(i / batchSize) + 1} (${batch.length} items)...`,
                `Sending ${batch.length} images to AI for visual analysis...`,
              ],
            }
          : null,
      );

      const promises = batch.map(async (item) => {
        if (abortRef.current) return;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 180000); // 180 seconds timeout

          const aiData = await fetchApi("/api/analyze-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: item.imageUrl,
              language: i18n.language,
              existingLooks: existingLooks.filter(l => l.id !== item.id),
              existingItems: existingItemsForAI.filter(i => i.id !== item.id),
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (abortRef.current) return;
          const finalType =
            aiData.type === "Duplicate"
              ? "Duplicate"
              : aiData.type === "Look"
                ? "Look"
                : "Item";
                
          const newlyExtractedItemIds: string[] = [];

          if (
            aiData.type === "Look" &&
            aiData.extractedItems &&
            Array.isArray(aiData.extractedItems)
          ) {
            const itemPromises = aiData.extractedItems.map(
              async (extractedItem: any) => {
                if (extractedItem.matchedExistingItemId) {
                  const matchedId = extractedItem.matchedExistingItemId;
                  newlyExtractedItemIds.push(matchedId);
                  try {
                    const itemRef = doc(db, `users/${userId}/wardrobeItems`, matchedId);
                    await updateDoc(itemRef, {
                      usedInLooks: arrayUnion(item.id)
                    });
                  } catch (e) {
                    console.error("error updating matched item", e);
                  }
                  return;
                }
                
                const itemRef = doc(
                  collection(db, `users/${userId}/wardrobeItems`),
                );
                newlyExtractedItemIds.push(itemRef.id);
                try {
                  let finalImageUrl = item.imageUrl;
                  if (extractedItem.boundingBox && Array.isArray(extractedItem.boundingBox)) {
                    finalImageUrl = await cropImage(item.imageUrl, extractedItem.boundingBox);
                  }
    
                  return await setDoc(itemRef, {
                    userId,
                    imageUrl: finalImageUrl,
                    type: "Item",
                    category: String(
                      extractedItem.category || extractedItem.name || "Unknown",
                    ).substring(0, 120),
                    color: String(extractedItem.color || "Unknown").substring(
                      0,
                      120,
                    ),
                    source: "my",
                    tags: [
                      String(extractedItem.attributes || "").substring(0, 50),
                    ].filter(Boolean),
                    rating: 0,
                    advice: t("extracted_from_look", "Extracted from Look"),
                    createdAt: serverTimestamp(),
                    usedInLooks: [item.id]
                  });
                } catch (e) {
                  console.error("extracted image setDoc Error:", e);
                  throw e;
                }
              },
            );
            await Promise.all(itemPromises);
          }

          const docUpdates: any = {
            type: finalType,
            category: String(aiData.category || "Other").substring(0, 120),
            color: String(aiData.color || "Unknown").substring(0, 120),
            tags: Array.isArray(aiData.tags)
              ? aiData.tags.map((t) => String(t).substring(0, 50)).slice(0, 20)
              : [],
            rating:
              typeof aiData.rating === "number"
                ? aiData.rating
                : parseFloat(aiData.rating) || 0,
            advice: String(aiData.advice || "").substring(0, 4000),
          };
          if (finalType === "Look" && newlyExtractedItemIds.length > 0) {
            docUpdates.itemsIds = newlyExtractedItemIds;
          }
          if (finalType === "Duplicate" && aiData.duplicateOfId) {
            docUpdates.duplicateOfId = aiData.duplicateOfId;
          }

          await updateDoc(doc(db, `users/${userId}/wardrobeItems/${item.id}`), docUpdates);

          if (abortRef.current) return;

          successCount++;
          completedCount++;

          setReanalyzeStatus((prev) =>
            prev
              ? {
                  ...prev,
                  current: completedCount,
                  logs: [
                    ...prev.logs,
                    `Success! Classified item as ${finalType}. Rating: ${aiData.rating || "N/A"}`,
                  ],
                }
              : null,
          );
        } catch (e: any) {
          if (abortRef.current) return;
          console.error("Re-analyze failed for", item.id, e);
          completedCount++;
          setReanalyzeStatus((prev) =>
            prev
              ? {
                  ...prev,
                  current: completedCount,
                  logs: [
                    ...prev.logs,
                    `Error on item ${item.id.slice(0, 5)}: ${e.message}`,
                  ],
                }
              : null,
          );
        }
      });

      await Promise.all(promises);
    }

    setReanalyzeStatus((prev) =>
      prev
        ? {
            ...prev,
            logs: [
              ...prev.logs,
              abortRef.current
                ? `Process aborted. Completed ${successCount} items.`
                : `Done. Processed ${successCount}/${toAnalyze.length} successfully.`,
            ],
          }
        : null,
    );

    toast.success(
      abortRef.current
        ? `Analysis aborted.`
        : `Analysis complete. Processed ${successCount}/${toAnalyze.length}`,
    );
  };

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
        <button
          onClick={handleReanalyzeMissed}
          disabled={!!reanalyzeStatus}
          className="flex items-center gap-2 px-6 py-2.5 bg-white text-[#556943] hover:text-[#455438] border border-[#d2d9c8] hover:border-[#6b8555]/50 rounded-full text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
        >
          {!!reanalyzeStatus
            ? t("evaluating", "Оценка...")
            : t("reanalyze_all", "Анализировать Базу")}
        </button>
      </div>

      {reanalyzeStatus && (
        <div className="fixed inset-0 z-50 bg-white/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#eef2e6] border border-[#d2d9c8] p-6 rounded-3xl w-full max-w-lg flex flex-col gap-4">
            <h2 className="text-xl font-black text-[#2b3327] uppercase tracking-tighter">
              {t("reanalyzing", "Re-evaluating DB...")}
            </h2>
            <div className="w-full bg-white rounded-full h-2 overflow-hidden">
              <div
                className="bg-[#6b8555] h-full transition-all"
                style={{
                  width: `${(reanalyzeStatus.current / reanalyzeStatus.total) * 100}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#556943] font-bold uppercase tracking-widest flex items-center gap-2">
                {reanalyzeStatus.current < reanalyzeStatus.total &&
                  !abortRef.current && (
                    <Loader2 size={14} className="animate-spin text-[#6b8555]" />
                  )}
                Processing {reanalyzeStatus.current} / {reanalyzeStatus.total}
              </p>
              {reanalyzeStatus.current < reanalyzeStatus.total &&
                !abortRef.current && (
                  <p className="text-xs text-[#84917a] font-medium flex items-center gap-1">
                    <Clock size={12} />~
                    {Math.ceil(
                      ((reanalyzeStatus.total - reanalyzeStatus.current) * 2) /
                        60,
                    )}{" "}
                    min left
                  </p>
                )}
            </div>
            <div className="bg-[#e4ebd8] border border-[#d2d9c8] rounded-xl p-4 h-48 overflow-y-auto flex flex-col gap-2 font-mono text-xs">
              {reanalyzeStatus.logs.map((log, i) => (
                <div key={i} className="text-[#6b7863]">
                  {log}
                </div>
              ))}
              <div
                ref={(el) => {
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            </div>
            <p className="text-[10px] text-[#84917a] text-center leading-tight">
              {t(
                "cancel_explanation",
                "Если вы нажмете Отмена, процесс остановится. Уже оцененные вещи сохранятся в базе.",
              )}
            </p>
            {reanalyzeStatus.current === reanalyzeStatus.total ||
            abortRef.current ? (
              <button
                onClick={() => setReanalyzeStatus(null)}
                className="w-full mt-2 py-3 bg-[#6b8555] hover:bg-[#556943] text-white font-black uppercase tracking-widest text-xs rounded-xl transition-colors"
              >
                {t("admin_close", "Close")}
              </button>
            ) : (
              <button
                onClick={() => {
                  abortRef.current = true;
                  setReanalyzeStatus((prev) =>
                    prev
                      ? { ...prev, logs: [...prev.logs, "Stopping..."] }
                      : null,
                  );
                }}
                className="w-full mt-2 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-black uppercase tracking-widest text-xs rounded-xl transition-colors"
              >
                {t("cancel", "Отмена")}
              </button>
            )}
          </div>
        </div>
      )}

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
