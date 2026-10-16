"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import type { FileInfo, PlaylistInfoResponse } from "@/lib/types";
import {
  matchImportBatch,
  fetchInfo,
  searchYouTube,
  resolveMediaUrl,
  getStreamUrl,
} from "@/lib/api";
import {
  upsertTrack,
  savePlaylist,
  importYouTubePlaylist,
  type PlaylistRecord,
  type TrackRecord,
} from "@/lib/db";
import {
  parseCsvString,
  parsePastedText,
} from "@/lib/importer/csvParser";
import type {
  ParsedTrackItem,
  MatchedTrackRow,
  CandidateMatchUI,
} from "@/lib/importer/types";
import { useTheme } from "@/context/ThemeContext";

interface PlaylistImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (playlistId: string) => void;
  onPreviewTrack?: (file: FileInfo) => void;
}

type ImportTab = "youtube" | "csv" | "text";
type ImportStep = "input" | "matching" | "review" | "report";

export function PlaylistImportModal({
  isOpen,
  onClose,
  onImportComplete,
  onPreviewTrack,
}: PlaylistImportModalProps) {
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";

  // Tab & Step state
  const [activeTab, setActiveTab] = useState<ImportTab>("csv");
  const [currentStep, setCurrentStep] = useState<ImportStep>("input");

  // Input states
  const [ytUrl, setYtUrl] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [flipOrder, setFlipOrder] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedTrackItem[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<Record<string, string | undefined>>({});

  // Matching progression state
  const [matchedRows, setMatchedRows] = useState<MatchedTrackRow[]>([]);
  const [matchingProgress, setMatchingProgress] = useState({ current: 0, total: 0 });
  const [isCancelled, setIsCancelled] = useState(false);
  const [matchingError, setMatchingError] = useState<string | null>(null);
  const isCancelledRef = useRef(false);

  // Review states
  const [playlistName, setPlaylistName] = useState("Imported Playlist");
  const [filterConfidence, setFilterConfidence] = useState<"all" | "review" | "high">("all");
  const [manualSearchRowId, setManualSearchRowId] = useState<string | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [manualSearchResults, setManualSearchResults] = useState<CandidateMatchUI[]>([]);
  const [isSearchingManual, setIsSearchingManual] = useState(false);
  const [previewingVideoId, setPreviewingVideoId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Post-import report
  const [importReport, setImportReport] = useState<{
    createdPlaylistId: string;
    matchedCount: number;
    skippedCount: number;
    unmatchedCsvData: string;
  } | null>(null);

  // Reset state on open/close
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep("input");
      setYtUrl("");
      setCsvFile(null);
      setPastedText("");
      setParsedItems([]);
      setMatchedRows([]);
      setMatchingError(null);
      setImportReport(null);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    }
  }, [isOpen]);

  // Handle CSV file selection & parsing
  const handleFileChange = async (file: File) => {
    setCsvFile(file);
    try {
      const text = await file.text();
      const res = parseCsvString(text);
      setParsedItems(res.items);
      setDetectedColumns(res.detectedColumns);
      // Auto-populate playlist name from filename (strip .csv)
      const baseName = file.name.replace(/\.[^/.]+$/, "").trim();
      if (baseName) {
        setPlaylistName(baseName);
      }
    } catch (err) {
      alert("Failed to parse CSV file: " + String(err));
    }
  };

  // Handle text parsing
  const handlePastedTextChange = (text: string, flip: boolean) => {
    setPastedText(text);
    const items = parsePastedText(text, flip);
    setParsedItems(items);
  };

  // Run Batch Matching against backend POST /api/import/match
  const startMatching = async (itemsToMatch: ParsedTrackItem[]) => {
    if (itemsToMatch.length === 0) return;
    setCurrentStep("matching");
    setIsCancelled(false);
    isCancelledRef.current = false;
    setMatchingError(null);

    const BATCH_SIZE = 25;
    const total = itemsToMatch.length;
    setMatchingProgress({ current: 0, total });

    const collectedRows: MatchedTrackRow[] = [];

    try {
      for (let i = 0; i < total; i += BATCH_SIZE) {
        if (isCancelledRef.current) {
          break;
        }

        const slice = itemsToMatch.slice(i, i + BATCH_SIZE);
        const reqPayload = slice.map((item) => ({
          title: item.title,
          artist: item.artist,
          album: item.album,
          durationSec: item.durationSec,
        }));

        const res = await matchImportBatch(reqPayload);

        for (let j = 0; j < slice.length; j++) {
          const sourceItem = slice[j];
          const resultItem = res.results[j];
          const candidates = resultItem?.candidates || [];
          const best = resultItem?.bestMatch || (candidates.length > 0 ? candidates[0] : null);
          const conf = resultItem?.confidence || (best && best.score >= 50 ? "medium" : "none");

          collectedRows.push({
            rowId: sourceItem.id,
            source: sourceItem,
            candidates,
            selectedMatch: best,
            confidence: conf,
            excluded: conf === "none" || !best,
          });
        }

        setMatchingProgress({ current: Math.min(i + BATCH_SIZE, total), total });
      }

      setMatchedRows(collectedRows);
      setCurrentStep("review");
    } catch (err) {
      setMatchingError("Batch matching error: " + String(err));
    }
  };

  // Direct YouTube playlist import
  const handleDirectYouTubeImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytUrl.trim()) return;
    try {
      const info = await fetchInfo(ytUrl.trim());
      if (info.type === "playlist") {
        const pl = await importYouTubePlaylist(info as PlaylistInfoResponse, ytUrl.trim());
        onImportComplete(pl.id);
        onClose();
      } else {
        alert("The entered link is a single video, not a playlist. Please use a YouTube playlist link.");
      }
    } catch (err) {
      alert("Failed to import YouTube playlist: " + String(err));
    }
  };

  // Preview audio playback
  const handleTogglePreview = (videoId: string, trackTitle: string) => {
    if (previewingVideoId === videoId) {
      if (previewAudioRef.current) previewAudioRef.current.pause();
      setPreviewingVideoId(null);
      return;
    }

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
      previewAudioRef.current.addEventListener("ended", () => setPreviewingVideoId(null));
      previewAudioRef.current.addEventListener("error", () => setPreviewingVideoId(null));
    }

    previewAudioRef.current.src = getStreamUrl(videoId);
    previewAudioRef.current.play().catch(() => {});
    setPreviewingVideoId(videoId);
  };

  // Manual YouTube search for alternative track
  const handleOpenManualSearch = (rowId: string, initialQuery: string) => {
    setManualSearchRowId(rowId);
    setManualSearchQuery(initialQuery);
    setManualSearchResults([]);
    setIsSearchingManual(true);
    searchYouTube(initialQuery, 8)
      .then((res) => {
        setManualSearchResults(
          res.results.map((r) => ({
            videoId: r.video_id,
            title: r.title,
            channel: r.uploader || "YouTube",
            durationSec: r.duration,
            thumbnail: r.thumbnail,
            score: 100,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setIsSearchingManual(false));
  };

  const handleSelectManualCandidate = (candidate: CandidateMatchUI) => {
    if (!manualSearchRowId) return;
    setMatchedRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== manualSearchRowId) return row;
        return {
          ...row,
          selectedMatch: candidate,
          confidence: "high",
          excluded: false,
          userModified: true,
        };
      })
    );
    setManualSearchRowId(null);
  };

  // Final Confirmation & IndexedDB Save
  const handleConfirmImport = async () => {
    const includedRows = matchedRows.filter((r) => !r.excluded && r.selectedMatch);
    if (includedRows.length === 0) {
      alert("No tracks are selected for import.");
      return;
    }

    const trackIds: string[] = [];
    const now = Date.now();

    for (const row of includedRows) {
      const match = row.selectedMatch!;
      trackIds.push(match.videoId);

      const tr: TrackRecord = {
        id: match.videoId,
        title: row.source.title,
        artist: row.source.artist,
        durationSec: match.durationSec || row.source.durationSec || 0,
        thumbnailUrl: match.thumbnail || null,
        source: "youtube",
        addedAt: now,
      };
      await upsertTrack(tr);
    }

    const playlistId = `pl-imp-${now}`;
    const newPlaylist: PlaylistRecord = {
      id: playlistId,
      name: playlistName.trim() || "Imported Playlist",
      kind: "user",
      trackIds,
      songFilenames: trackIds,
      createdAt: now,
      updatedAt: now,
      coverTrackId: trackIds[0],
    };

    await savePlaylist(newPlaylist);

    // Build unmatched CSV export
    const skippedRows = matchedRows.filter((r) => r.excluded || !r.selectedMatch);
    const unmatchedCsvRows = [
      "Title,Artist,Album,Reason",
      ...skippedRows.map(
        (r) =>
          `"${r.source.title.replace(/"/g, '""')}","${r.source.artist.replace(/"/g, '""')}","${(r.source.album || "").replace(/"/g, '""')}","${!r.selectedMatch ? "No match found" : "Excluded by user"}"`
      ),
    ].join("\n");

    setImportReport({
      createdPlaylistId: playlistId,
      matchedCount: includedRows.length,
      skippedCount: skippedRows.length,
      unmatchedCsvData: unmatchedCsvRows,
    });
    setCurrentStep("report");
  };

  // Filtered rows for review
  const displayRows = useMemo(() => {
    if (filterConfidence === "review") {
      return matchedRows.filter((r) => r.confidence === "low" || r.confidence === "none");
    }
    if (filterConfidence === "high") {
      return matchedRows.filter((r) => r.confidence === "high" || r.confidence === "medium");
    }
    return matchedRows;
  }, [matchedRows, filterConfidence]);

  const confidenceStats = useMemo(() => {
    const high = matchedRows.filter((r) => r.confidence === "high").length;
    const med = matchedRows.filter((r) => r.confidence === "medium").length;
    const low = matchedRows.filter((r) => r.confidence === "low").length;
    const none = matchedRows.filter((r) => r.confidence === "none").length;
    return { high, med, low, none, total: matchedRows.length };
  }, [matchedRows]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-2xl max-h-[90vh] rounded-[30px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border ${
          isLight
            ? "bg-white border-[#E2E8F0] shadow-[0_20px_50px_rgba(35,55,110,0.15)] text-slate-800"
            : "bg-[#161C2E] border-white/15 shadow-[0_25px_60px_rgba(0,0,0,0.6)] text-white"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-black/5 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-bold shadow-sm"
              style={{ backgroundColor: `${config.primaryHex}20`, color: config.primaryHex }}
            >
              📥
            </div>
            <div>
              <h2
                className={`text-sm sm:text-base font-black ${isLight ? "text-[#1A1F2C]" : "text-white"}`}
                style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
              >
                {currentStep === "input" && "Import Playlist"}
                {currentStep === "matching" && "Matching Tracks with YouTube..."}
                {currentStep === "review" && "Review Matched Tracks"}
                {currentStep === "report" && "Import Complete"}
              </h2>
              <p className="text-[11px] text-zinc-400">
                {currentStep === "input" && "From CSV file, text list, or YouTube playlist URL"}
                {currentStep === "matching" && "Finding official audio and metadata matches"}
                {currentStep === "review" && "Verify matches, preview audio, or swap candidates"}
                {currentStep === "report" && "Your playlist has been saved to the library"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* ── STEP 1: INPUT MODES ── */}
          {currentStep === "input" && (
            <div className="space-y-5">
              {/* Tabs */}
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/10 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab("csv")}
                  className={`py-2 rounded-xl transition-all ${
                    activeTab === "csv" ? "bg-white/15 text-white shadow-sm" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  📄 CSV File
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("text")}
                  className={`py-2 rounded-xl transition-all ${
                    activeTab === "text" ? "bg-white/15 text-white shadow-sm" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  📝 Paste Text
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("youtube")}
                  className={`py-2 rounded-xl transition-all ${
                    activeTab === "youtube" ? "bg-white/15 text-white shadow-sm" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  ▶ YouTube URL
                </button>
              </div>

              {/* TAB 1: CSV FILE */}
              {activeTab === "csv" && (
                <div className="space-y-4">
                  <div
                    className="border-2 border-dashed border-white/15 hover:border-white/30 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-white/[0.02]"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileChange(file);
                    }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".csv";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleFileChange(file);
                      };
                      input.click();
                    }}
                  >
                    <span className="text-3xl block mb-2">📁</span>
                    <p className="text-xs font-semibold text-white">
                      {csvFile ? csvFile.name : "Click to upload CSV or drag and drop"}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Works with Spotify, Exportify, Soundiiz, TuneMyMusic CSV exports
                    </p>
                  </div>

                  {parsedItems.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-zinc-300 font-semibold">
                        <span>Detected Tracks</span>
                        <span className="text-white font-mono bg-white/10 px-2 py-0.5 rounded-full">
                          {parsedItems.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
                        {detectedColumns.titleCol && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                            Title: {detectedColumns.titleCol}
                          </span>
                        )}
                        {detectedColumns.artistCol && (
                          <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300">
                            Artist: {detectedColumns.artistCol}
                          </span>
                        )}
                        {detectedColumns.durationCol && (
                          <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300">
                            Duration: {detectedColumns.durationCol}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: PASTE TEXT */}
              {activeTab === "text" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-zinc-400">Paste tracks (one per line):</label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !flipOrder;
                        setFlipOrder(next);
                        handlePastedTextChange(pastedText, next);
                      }}
                      className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <span>⇄</span>
                      <span>Format: {flipOrder ? "Title - Artist" : "Artist - Title"}</span>
                    </button>
                  </div>

                  <textarea
                    rows={6}
                    value={pastedText}
                    onChange={(e) => handlePastedTextChange(e.target.value, flipOrder)}
                    placeholder={`The Weeknd - Blinding Lights\nDua Lipa - Levitating\nQueen - Bohemian Rhapsody`}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-zinc-900 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-white/30"
                  />

                  {parsedItems.length > 0 && (
                    <p className="text-xs text-zinc-400">
                      Detected <strong className="text-white">{parsedItems.length}</strong> track(s).
                    </p>
                  )}
                </div>
              )}

              {/* TAB 3: YOUTUBE URL */}
              {activeTab === "youtube" && (
                <form onSubmit={handleDirectYouTubeImport} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400">YouTube or YouTube Music Playlist URL:</label>
                    <input
                      type="url"
                      value={ytUrl}
                      onChange={(e) => setYtUrl(e.target.value)}
                      placeholder="https://www.youtube.com/playlist?list=..."
                      className="w-full px-4 py-2.5 rounded-2xl bg-zinc-900 border border-white/10 text-white text-xs focus:outline-none focus:border-white/30"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!ytUrl.trim()}
                    className={`w-full py-2.5 rounded-xl bg-gradient-to-r ${config.gradient} text-white text-xs font-bold shadow-lg disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all`}
                  >
                    Import Directly from YouTube
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ── STEP 2: MATCHING PROGRESS ── */}
          {currentStep === "matching" && (
            <div className="space-y-6 py-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl mx-auto animate-pulse">
                🔍
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold text-white">
                  Matching Tracks ({matchingProgress.current} / {matchingProgress.total})
                </h3>
                <p className="text-xs text-zinc-400">
                  Querying YouTube audio streams and scoring candidates...
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r transition-all duration-300"
                  style={{
                    width: `${matchingProgress.total > 0 ? (matchingProgress.current / matchingProgress.total) * 100 : 0}%`,
                    backgroundImage: `linear-gradient(to right, ${config.primaryHex}, ${config.secondaryHex})`,
                  }}
                />
              </div>

              {matchingError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                  {matchingError}
                </div>
              )}

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    isCancelledRef.current = true;
                    setIsCancelled(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold"
                >
                  {isCancelled ? "Stopping..." : "Cancel & Review Matched"}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: REVIEW SCREEN ── */}
          {currentStep === "review" && (
            <div className="space-y-4">
              {/* Playlist Name Input */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Playlist Name
                  </label>
                  <input
                    type="text"
                    value={playlistName}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs font-semibold focus:outline-none focus:border-white/30"
                  />
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setMatchedRows((prev) =>
                        prev.map((r) => ({
                          ...r,
                          excluded: r.confidence === "none" || !r.selectedMatch,
                        }))
                      );
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs border border-white/10 font-semibold"
                    title="Check all high and medium confidence matches"
                  >
                    Select All High-Confidence
                  </button>
                </div>
              </div>

              {/* Confidence filter chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterConfidence("all")}
                  className={`px-3 py-1 rounded-full border transition-all ${
                    filterConfidence === "all"
                      ? "bg-white/15 text-white border-white/30 font-bold"
                      : "bg-white/5 text-zinc-400 border-white/10"
                  }`}
                >
                  All ({confidenceStats.total})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterConfidence("review")}
                  className={`px-3 py-1 rounded-full border transition-all ${
                    filterConfidence === "review"
                      ? "bg-amber-400/20 text-amber-300 border-amber-400/40 font-bold"
                      : "bg-white/5 text-zinc-400 border-white/10"
                  }`}
                >
                  ⚠️ Needs Review ({confidenceStats.low + confidenceStats.none})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterConfidence("high")}
                  className={`px-3 py-1 rounded-full border transition-all ${
                    filterConfidence === "high"
                      ? "bg-emerald-400/20 text-emerald-300 border-emerald-400/40 font-bold"
                      : "bg-white/5 text-zinc-400 border-white/10"
                  }`}
                >
                  ✓ High Confidence ({confidenceStats.high + confidenceStats.med})
                </button>
              </div>

              {/* Tracks List */}
              <div className="space-y-2.5 max-h-[48vh] overflow-y-auto pr-1">
                {displayRows.length === 0 ? (
                  <p className="text-center py-8 text-xs text-zinc-500">No tracks match this filter.</p>
                ) : (
                  displayRows.map((row) => {
                    const match = row.selectedMatch;
                    const isPreviewing = match && previewingVideoId === match.videoId;

                    return (
                      <div
                        key={row.rowId}
                        className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                          row.excluded
                            ? "bg-white/[0.02] border-white/5 opacity-50"
                            : row.confidence === "none"
                            ? "bg-red-500/10 border-red-500/20"
                            : row.confidence === "low"
                            ? "bg-amber-500/10 border-amber-500/20"
                            : "bg-white/5 border-white/10"
                        }`}
                      >
                        {/* Checkbox & Source Metadata */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={!row.excluded}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setMatchedRows((prev) =>
                                prev.map((r) => (r.rowId === row.rowId ? { ...r, excluded: !checked } : r))
                              );
                            }}
                            className="rounded accent-emerald-500 w-4 h-4 cursor-pointer shrink-0"
                          />

                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-xs font-bold text-white truncate">
                              {row.source.title}
                            </p>
                            <p className="text-[11px] text-zinc-400 truncate">
                              {row.source.artist}
                              {row.source.album ? ` • ${row.source.album}` : ""}
                            </p>
                          </div>
                        </div>

                        {/* Matched YouTube Result */}
                        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
                          {match ? (
                            <>
                              <div className="w-9 h-9 rounded-lg overflow-hidden bg-zinc-900 border border-white/10 shrink-0">
                                {match.thumbnail ? (
                                  <img
                                    src={resolveMediaUrl(match.thumbnail)}
                                    alt={match.title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs">🎵</div>
                                )}
                              </div>

                              <div className="max-w-[150px] sm:max-w-[180px] text-left space-y-0.5">
                                <p className="text-[11px] font-semibold text-zinc-200 truncate" title={match.title}>
                                  {match.title}
                                </p>
                                <div className="flex items-center gap-1.5 text-[10px]">
                                  <span
                                    className={`px-1.5 py-0.2 rounded font-bold uppercase ${
                                      row.confidence === "high"
                                        ? "bg-emerald-500/20 text-emerald-300"
                                        : row.confidence === "medium"
                                        ? "bg-yellow-500/20 text-yellow-300"
                                        : row.confidence === "low"
                                        ? "bg-amber-500/20 text-amber-300"
                                        : "bg-red-500/20 text-red-300"
                                    }`}
                                  >
                                    {row.confidence}
                                  </span>
                                  <span className="text-zinc-500 truncate">{match.channel}</span>
                                </div>
                              </div>

                              {/* Preview button */}
                              <button
                                type="button"
                                onClick={() => handleTogglePreview(match.videoId, match.title)}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${
                                  isPreviewing
                                    ? "bg-emerald-500 text-black animate-pulse"
                                    : "bg-white/10 hover:bg-white/15 text-white"
                                }`}
                                title="Listen to 10s audio preview"
                              >
                                {isPreviewing ? "⏸" : "▶"}
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-red-400 font-semibold px-2 py-1 rounded bg-red-500/10">
                              No Match Found
                            </span>
                          )}

                          {/* Candidates selector or manual search */}
                          {row.candidates.length > 1 && (
                            <select
                              value={match?.videoId || ""}
                              onChange={(e) => {
                                const picked = row.candidates.find((c) => c.videoId === e.target.value);
                                if (picked) {
                                  setMatchedRows((prev) =>
                                    prev.map((r) =>
                                      r.rowId === row.rowId
                                        ? { ...r, selectedMatch: picked, confidence: "high", excluded: false, userModified: true }
                                        : r
                                    )
                                  );
                                }
                              }}
                              className="text-[11px] bg-zinc-900 border border-white/15 text-zinc-300 rounded-lg px-2 py-1 focus:outline-none"
                              title="Pick alternative YouTube candidate"
                            >
                              {row.candidates.map((c, cIdx) => (
                                <option key={c.videoId} value={c.videoId}>
                                  Option {cIdx + 1} ({c.score}pts) - {c.channel}
                                </option>
                              ))}
                            </select>
                          )}

                          {/* Manual search button */}
                          <button
                            type="button"
                            onClick={() => handleOpenManualSearch(row.rowId, `${row.source.artist} ${row.source.title}`)}
                            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                            title="Search manually on YouTube"
                          >
                            🔍
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ── STEP 4: REPORT SCREEN ── */}
          {currentStep === "report" && importReport && (
            <div className="space-y-6 py-6 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-3xl mx-auto">
                ✓
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white">Playlist Imported Successfully!</h3>
                <p className="text-xs text-zinc-400">
                  Imported <strong className="text-white">{importReport.matchedCount}</strong> tracks into{" "}
                  <strong className="text-white">"{playlistName}"</strong>.
                </p>
                {importReport.skippedCount > 0 && (
                  <p className="text-xs text-amber-400">
                    {importReport.skippedCount} track(s) were skipped or unmatched.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                {importReport.skippedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([importReport.unmatchedCsvData], { type: "text/csv" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `unmatched_${Date.now()}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold"
                  >
                    Download Unmatched Tracks (.csv)
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onImportComplete(importReport.createdPlaylistId);
                    onClose();
                  }}
                  className={`px-6 py-2.5 rounded-xl bg-gradient-to-r ${config.gradient} text-white text-xs font-bold shadow-lg`}
                >
                  View Playlist
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {currentStep !== "report" && currentStep !== "matching" && (
          <div className="p-4 sm:p-5 border-t border-white/10 flex items-center justify-between shrink-0">
            {currentStep === "review" ? (
              <>
                <button
                  type="button"
                  onClick={() => setCurrentStep("input")}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl bg-gradient-to-r ${config.gradient} shadow-lg active:scale-95 transition-all`}
                >
                  Confirm & Save Playlist ({matchedRows.filter((r) => !r.excluded && r.selectedMatch).length})
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={parsedItems.length === 0}
                  onClick={() => startMatching(parsedItems)}
                  className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl bg-gradient-to-r ${config.gradient} shadow-lg disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all`}
                >
                  Start Matching ({parsedItems.length} tracks)
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Manual Search Sub-Modal */}
      {manualSearchRowId && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div
            className="w-full max-w-md bg-zinc-950 border border-white/15 rounded-3xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Manual YouTube Search</h3>
              <button
                type="button"
                onClick={() => setManualSearchRowId(null)}
                className="text-zinc-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={manualSearchQuery}
                onChange={(e) => setManualSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleOpenManualSearch(manualSearchRowId, manualSearchQuery);
                  }
                }}
                className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs focus:outline-none"
                placeholder="Search song title or artist..."
              />
              <button
                type="button"
                onClick={() => handleOpenManualSearch(manualSearchRowId, manualSearchQuery)}
                className="px-3 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold"
              >
                Search
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {isSearchingManual ? (
                <p className="text-center py-4 text-xs text-zinc-400 animate-pulse">Searching YouTube...</p>
              ) : (
                manualSearchResults.map((cand) => (
                  <div
                    key={cand.videoId}
                    onClick={() => handleSelectManualCandidate(cand)}
                    className="p-2.5 rounded-xl glass-card hover:border-white/20 flex items-center justify-between gap-2.5 cursor-pointer transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">{cand.title}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{cand.channel}</p>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded bg-emerald-500/20 text-emerald-300">
                      Select
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
