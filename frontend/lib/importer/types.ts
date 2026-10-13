/**
 * Shared types for Playlist Importer.
 */

export interface ParsedTrackItem {
  id: string; // Internal temporary UI row ID (e.g. row_0)
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
  originalRaw?: string;
}

export interface CandidateMatchUI {
  videoId: string;
  title: string;
  channel: string;
  durationSec?: number | null;
  thumbnail?: string | null;
  score: number;
}

export interface MatchedTrackRow {
  rowId: string;
  source: ParsedTrackItem;
  candidates: CandidateMatchUI[];
  selectedMatch: CandidateMatchUI | null;
  confidence: "high" | "medium" | "low" | "none";
  excluded: boolean;
  userModified?: boolean;
}

export interface MatchBatchRequestItem {
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
}

export interface MatchBatchResponseItem {
  source: MatchBatchRequestItem;
  candidates: CandidateMatchUI[];
  bestMatch: CandidateMatchUI | null;
  confidence: "high" | "medium" | "low" | "none";
}

export interface MatchBatchResponse {
  results: MatchBatchResponseItem[];
}
