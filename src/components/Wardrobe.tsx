import React, { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { WardrobeItem } from "../lib/hooks";
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
  userId,
}: {
  items: WardrobeItem[];
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
    setImageSrcQueue((prev) => prev.slice(1)); // Proceed to next image internally

    const compressedBase64 = await getResizedBase64(croppedImageBase64, 800);
    const newRef = doc(collection(db, `users/${userId}/wardrobeItems`));

    try {
      // Optimistic instant save
      await setDoc(newRef, {
        userId,
        imageUrl: compressedBase64,
        type: "Item", // Required to be "Item" or "Look" by firestore rules
        category: "Processing...",
        color: "Unknown",
        source: activeTab,
        tags: [],
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("setDoc Error:", e);
      throw e;
    }

    const toastId = toast.loading(
      t("analyzing", "AI is assessing your look..."),
    );

    // Asynchronously replace with AI suggestions
    try {
      const existingLooks = items
        .filter((i) => i.type === "Look")
        .map((i) => ({
          id: i.id,
          category: i.category,
          color: i.color,
          tags: i.tags,
        }));

      const analyzeRes = await fetch("/api/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: compressedBase64,
          language: i18n.language,
          existingLooks,
        }),
      });
      const aiData = await analyzeRes.json();

      const isDuplicate = aiData.type === "Duplicate";
      const finalType = isDuplicate
        ? "Duplicate"
        : aiData.type === "Look"
          ? "Look"
          : "Item";

      try {
        await updateDoc(newRef, {
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
        });
      } catch (e) {
        console.error("updateDoc Error:", e);
        throw e;
      }

      if (
        aiData.type === "Look" &&
        aiData.extractedItems &&
        Array.isArray(aiData.extractedItems)
      ) {
        const itemPromises = aiData.extractedItems.map(
          async (extractedItem: any) => {
            const itemRef = doc(
              collection(db, `users/${userId}/wardrobeItems`),
            );
            try {
              return await setDoc(itemRef, {
                userId,
                imageUrl: compressedBase64, // using original image
                type: "Item",
                category: String(
                  extractedItem.category || extractedItem.name || "Unknown",
                ).substring(0, 120),
                color: String(extractedItem.color || "Unknown").substring(
                  0,
                  120,
                ),
                source: activeTab,
                tags: [
                  String(extractedItem.attributes || "").substring(0, 50),
                ].filter(Boolean),
                rating: 0, // No rating yet for extracted items
                advice: t("extracted_from_look", "Extracted from Look"),
                createdAt: serverTimestamp(),
              });
            } catch (e) {
              console.error("extracted image setDoc Error:", e);
              throw e;
            }
          },
        );
        await Promise.all(itemPromises);
      }

      toast.success(t("analyzed", "AI assessment complete!"), { id: toastId });
    } catch (e: any) {
      toast.error(t("analyze_failed", "Failed to tag: ") + e.message, {
        id: toastId,
      });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: true,
    maxFiles: 10,
  } as any);

  const filteredItems = items.filter((item) => {
    if (activeTab === "my_looks")
      return (
        item.source !== "internet" &&
        (item.type === "Look" ||
          item.category === "Processing..." ||
          item.rating === 0 ||
          !item.type)
      );
    if (activeTab === "my_items")
      return (
        item.source !== "internet" &&
        item.type === "Item" &&
        item.category !== "Processing..." &&
        item.rating !== 0
      );
    return item.source === "internet";
  });

  const handleReanalyzeMissed = async () => {
    const missed = items.filter(
      (i) => !i.rating || i.rating === 0 || i.category === "Processing...",
    );
    if (missed.length === 0) {
      toast.info("No missed items to re-analyze.");
      return;
    }

    abortRef.current = false;
    setReanalyzeStatus({
      total: missed.length,
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

    // Process in batches of 3 to speed up, while avoiding simple rate limits
    let completedCount = 0;
    const batchSize = 1;

    for (let i = 0; i < missed.length; i += batchSize) {
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

      const batch = missed.slice(i, i + batchSize);

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
          const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 seconds timeout

          const analyzeRes = await fetch("/api/analyze-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: item.imageUrl,
              language: i18n.language,
              existingLooks,
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (abortRef.current) return;

          if (!analyzeRes.ok) {
            const errText = await analyzeRes.text();
            throw new Error(errText);
          }

          const aiData = await analyzeRes.json();
          const finalType =
            aiData.type === "Duplicate"
              ? "Duplicate"
              : aiData.type === "Look"
                ? "Look"
                : "Item";

          await updateDoc(doc(db, `users/${userId}/wardrobeItems/${item.id}`), {
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
          });

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
                : `Done. Processed ${successCount}/${missed.length} successfully.`,
            ],
          }
        : null,
    );

    toast.success(
      abortRef.current
        ? `Analysis aborted.`
        : `Analysis complete. Processed ${successCount}/${missed.length}`,
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex bg-slate-800 p-1.5 rounded-full overflow-x-auto border border-slate-700 max-w-full no-scrollbar">
          <button
            onClick={() => setActiveTab("my_looks")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === "my_looks"
                ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <ImageIcon size={16} />
            {t("my_looks", "Мои Луки")}
          </button>
          <button
            onClick={() => setActiveTab("my_items")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === "my_items"
                ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <ImageIcon size={16} />
            {t("my_items", "Мои Вещи")}
          </button>
          <button
            onClick={() => setActiveTab("internet")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === "internet"
                ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <DownloadCloud size={16} />
            {t("internet_looks", "Из Интернета")}
          </button>
        </div>
        <button
          onClick={handleReanalyzeMissed}
          disabled={!!reanalyzeStatus}
          className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 text-cyan-400 hover:text-cyan-300 border border-slate-700 hover:border-cyan-500/50 rounded-full text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
        >
          {!!reanalyzeStatus
            ? t("evaluating", "Оценка...")
            : t("reanalyze_all", "Анализировать Базу")}
        </button>
      </div>

      {reanalyzeStatus && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-full max-w-lg flex flex-col gap-4">
            <h2 className="text-xl font-black text-white uppercase tracking-tighter">
              {t("reanalyzing", "Re-evaluating DB...")}
            </h2>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-cyan-500 h-full transition-all"
                style={{
                  width: `${(reanalyzeStatus.current / reanalyzeStatus.total) * 100}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-cyan-400 font-bold uppercase tracking-widest flex items-center gap-2">
                {reanalyzeStatus.current < reanalyzeStatus.total &&
                  !abortRef.current && (
                    <Loader2 size={14} className="animate-spin text-cyan-500" />
                  )}
                Processing {reanalyzeStatus.current} / {reanalyzeStatus.total}
              </p>
              {reanalyzeStatus.current < reanalyzeStatus.total &&
                !abortRef.current && (
                  <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                    <Clock size={12} />~
                    {Math.ceil(
                      ((reanalyzeStatus.total - reanalyzeStatus.current) * 2) /
                        60,
                    )}{" "}
                    min left
                  </p>
                )}
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 h-48 overflow-y-auto flex flex-col gap-2 font-mono text-xs">
              {reanalyzeStatus.logs.map((log, i) => (
                <div key={i} className="text-slate-400">
                  {log}
                </div>
              ))}
              <div
                ref={(el) => {
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            </div>
            <p className="text-[10px] text-slate-500 text-center leading-tight">
              {t(
                "cancel_explanation",
                "Если вы нажмете Отмена, процесс остановится. Уже оцененные вещи сохранятся в базе.",
              )}
            </p>
            {reanalyzeStatus.current === reanalyzeStatus.total ||
            abortRef.current ? (
              <button
                onClick={() => setReanalyzeStatus(null)}
                className="w-full mt-2 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black uppercase tracking-widest text-xs rounded-xl transition-colors"
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

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 relative">
        {currentImageSrc && (
          <CropEditor
            imageSrc={currentImageSrc}
            onConfirm={handleUploadCropped}
            onCancel={() => setImageSrcQueue((prev) => prev.slice(1))}
          />
        )}

        <div
          {...getRootProps()}
          className={`aspect-[3/4] rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all ${
            isDragActive
              ? "border-cyan-400 bg-cyan-400/5"
              : "border-slate-700 bg-slate-800/20 hover:border-slate-500 hover:bg-slate-800/40"
          } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          <input {...getInputProps()} />
          <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 border border-slate-700 group-hover:scale-110 transition-transform">
            <UploadCloud className="text-cyan-400" size={24} />
          </div>
          <p className="text-white text-xs font-black uppercase tracking-widest leading-normal">
            {uploading
              ? t("saving")
              : activeTab === "internet"
                ? t("add_inspiration", "Добавить идею")
                : t("add_item")}
          </p>
        </div>

        {filteredItems.map((item) => (
          <DraggableItem key={item.id} item={item} userId={userId} />
        ))}
      </div>
    </div>
  );
}
