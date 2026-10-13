/**
 * Robust Client-Side CSV and Text Parser for Playlist Importing.
 *
 * Zero external dependencies.
 * Handles:
 * - UTF-8 Byte Order Mark (BOM: \uFEFF)
 * - RFC 4180 quotes with embedded commas, newlines, and escaped quotes ("")
 * - Comma and semicolon delimiters
 * - Header auto-detection for Spotify, Exportify, Soundiiz, TuneMyMusic, and standard CSVs
 * - Flexible duration formats (milliseconds, seconds, mm:ss)
 * - Pasted text ("Artist - Title", "Title - Artist", single title per line)
 */

import type { ParsedTrackItem } from "./types";

/**
 * Tokenize a CSV string into a 2D array of cells according to RFC 4180.
 */
export function tokenizeCsv(csvText: string, delimiter: string = ","): string[][] {
  // Strip BOM if present
  let text = csvText.replace(/^\uFEFF/, "").trim();
  if (!text) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentCell += '"';
          i++;
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (char === "\r") {
        if (nextChar === "\n") i++;
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else if (char === "\n") {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
  }

  // Flush remaining cell and row
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows.filter((r) => r.some((cell) => cell.length > 0));
}

/**
 * Detect delimiter by comparing frequencies in the first few lines.
 */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 1000);
  const commaCount = (sample.match(/,/g) || []).length;
  const semicolonCount = (sample.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

/**
 * Parse duration string or number into seconds.
 * Handles milliseconds (e.g. 212000), seconds (e.g. 212), and "mm:ss" / "hh:mm:ss".
 */
export function parseDurationSec(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const clean = raw.trim();
  if (!clean) return undefined;

  // Check mm:ss or hh:mm:ss
  if (clean.includes(":")) {
    const parts = clean.split(":").map((p) => parseFloat(p));
    if (parts.some((p) => isNaN(p))) return undefined;
    if (parts.length === 2) {
      return Math.round(parts[0] * 60 + parts[1]);
    } else if (parts.length === 3) {
      return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
    }
  }

  const num = parseFloat(clean);
  if (isNaN(num) || num <= 0) return undefined;

  // If > 10,000, it's almost certainly milliseconds (e.g. 180,000 ms = 3 minutes)
  if (num > 10000) {
    return Math.round(num / 1000);
  }

  return Math.round(num);
}

const TITLE_HEADERS = [
  "track name",
  "track",
  "title",
  "song",
  "name",
  "track_name",
  "track title",
  "song title",
];

const ARTIST_HEADERS = [
  "artist name(s)",
  "artist name",
  "artist",
  "artists",
  "performer",
  "artist_name",
  "creator",
];

const ALBUM_HEADERS = [
  "album name",
  "album",
  "album_name",
  "collection",
];

const DURATION_HEADERS = [
  "duration (ms)",
  "duration_ms",
  "duration (s)",
  "duration",
  "time",
  "length",
  "track duration",
];

export interface CsvParseResult {
  items: ParsedTrackItem[];
  detectedColumns: {
    titleCol?: string;
    artistCol?: string;
    albumCol?: string;
    durationCol?: string;
  };
  errors: string[];
}

/**
 * Parse CSV text into a normalized list of ParsedTrackItems.
 */
export function parseCsvString(csvText: string): CsvParseResult {
  const delimiter = detectDelimiter(csvText);
  const rows = tokenizeCsv(csvText, delimiter);
  const errors: string[] = [];

  if (rows.length === 0) {
    return { items: [], detectedColumns: {}, errors: ["The provided CSV is empty."] };
  }

  const headerRow = rows[0].map((h) => h.toLowerCase().trim());
  let titleIdx = -1;
  let artistIdx = -1;
  let albumIdx = -1;
  let durationIdx = -1;

  for (let i = 0; i < headerRow.length; i++) {
    const h = headerRow[i];
    if (titleIdx === -1 && TITLE_HEADERS.includes(h)) titleIdx = i;
    if (artistIdx === -1 && ARTIST_HEADERS.includes(h)) artistIdx = i;
    if (albumIdx === -1 && ALBUM_HEADERS.includes(h)) albumIdx = i;
    if (durationIdx === -1 && DURATION_HEADERS.includes(h)) durationIdx = i;
  }

  // Fallbacks if no exact header matched
  if (titleIdx === -1 && rows[0].length >= 1) {
    // Assume column 0 is title, column 1 is artist
    titleIdx = 0;
    if (rows[0].length >= 2) artistIdx = 1;
  }

  const detectedColumns = {
    titleCol: titleIdx !== -1 ? rows[0][titleIdx] : undefined,
    artistCol: artistIdx !== -1 ? rows[0][artistIdx] : undefined,
    albumCol: albumIdx !== -1 ? rows[0][albumIdx] : undefined,
    durationCol: durationIdx !== -1 ? rows[0][durationIdx] : undefined,
  };

  const items: ParsedTrackItem[] = [];

  // Data rows start from row index 1
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rawTitle = titleIdx !== -1 && row[titleIdx] ? row[titleIdx].trim() : "";
    const rawArtist = artistIdx !== -1 && row[artistIdx] ? row[artistIdx].trim() : "Unknown Artist";
    const rawAlbum = albumIdx !== -1 && row[albumIdx] ? row[albumIdx].trim() : undefined;
    const rawDuration = durationIdx !== -1 ? row[durationIdx] : undefined;

    if (!rawTitle) {
      continue; // Skip rows without a title
    }

    items.push({
      id: `csv_row_${r}`,
      title: rawTitle,
      artist: rawArtist || "Unknown Artist",
      album: rawAlbum,
      durationSec: parseDurationSec(rawDuration),
      originalRaw: row.join(delimiter),
    });
  }

  return { items, detectedColumns, errors };
}

/**
 * Parse pasted plain text lines into ParsedTrackItems.
 * Supports:
 * - "Artist - Title" (default)
 * - "Title - Artist" (when flipArtistTitle is true)
 * - "Title" only (sets artist to "Unknown Artist")
 */
export function parsePastedText(text: string, flipArtistTitle: boolean = false): ParsedTrackItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const items: ParsedTrackItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Strip leading track numbers like "1. ", "01 - ", "1) "
    const cleaned = line.replace(/^\d+[\.\)\-\s]+\s*/, "").trim();

    // Check separator " - " or " – " (en-dash) or " — " (em-dash) or " | "
    const separatorMatch = cleaned.match(/\s+[-–—|]\s+/);

    let title = cleaned;
    let artist = "Unknown Artist";

    if (separatorMatch && separatorMatch.index !== undefined) {
      const part1 = cleaned.slice(0, separatorMatch.index).trim();
      const part2 = cleaned.slice(separatorMatch.index + separatorMatch[0].length).trim();

      if (flipArtistTitle) {
        // "Title - Artist"
        title = part1;
        artist = part2 || "Unknown Artist";
      } else {
        // "Artist - Title" (standard)
        artist = part1 || "Unknown Artist";
        title = part2;
      }
    }

    if (title) {
      items.push({
        id: `txt_row_${i + 1}`,
        title,
        artist,
        originalRaw: line,
      });
    }
  }

  return items;
}
