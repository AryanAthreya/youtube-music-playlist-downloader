/**
 * Unit tests for client-side CSV & text playlist parser.
 * Tests RFC 4180 parsing, BOM removal, semicolon delimiters, duration conversions,
 * column header detection, and text order flipping.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  tokenizeCsv,
  detectDelimiter,
  parseDurationSec,
  parseCsvString,
  parsePastedText,
} from "./csvParser.ts";

describe("csvParser", () => {
  it("handles basic comma-separated cells and quotes", () => {
    const csv = 'Track,Artist,Album\n"Blinding Lights",The Weeknd,"After Hours"\nStarboy,"The Weeknd, Daft Punk",Starboy';
    const rows = tokenizeCsv(csv);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], ["Track", "Artist", "Album"]);
    assert.deepEqual(rows[1], ["Blinding Lights", "The Weeknd", "After Hours"]);
    assert.deepEqual(rows[2], ["Starboy", "The Weeknd, Daft Punk", "Starboy"]);
  });

  it("strips UTF-8 BOM marker properly", () => {
    const bomCsv = '\uFEFFTrack Name,Artist Name\n"Flowers","Miley Cyrus"';
    const rows = tokenizeCsv(bomCsv);
    assert.equal(rows[0][0], "Track Name");
    assert.equal(rows[1][0], "Flowers");
  });

  it("handles semicolon delimiters and detectDelimiter", () => {
    const semiCsv = "Title;Artist;Duration\nSong A;Artist A;180\nSong B;Artist B;240";
    assert.equal(detectDelimiter(semiCsv), ";");
    const result = parseCsvString(semiCsv);
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].title, "Song A");
    assert.equal(result.items[0].artist, "Artist A");
    assert.equal(result.items[0].durationSec, 180);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const csv = 'Title,Artist\n"Rock ""N"" Roll",Led Zeppelin';
    const rows = tokenizeCsv(csv);
    assert.equal(rows[1][0], 'Rock "N" Roll');
  });

  it("auto-detects Spotify / Exportify / Soundiiz header variants", () => {
    const exportifyCsv = `Track Name,Artist Name(s),Album Name,Duration (ms)
"As It Was","Harry Styles","Harry's House",167303
"Heat Waves","Glass Animals","Dreamland",238805`;

    const res = parseCsvString(exportifyCsv);
    assert.equal(res.items.length, 2);
    assert.equal(res.items[0].title, "As It Was");
    assert.equal(res.items[0].artist, "Harry Styles");
    assert.equal(res.items[0].album, "Harry's House");
    assert.equal(res.items[0].durationSec, 167); // 167303 ms -> 167s
    assert.equal(res.items[1].durationSec, 239); // 238805 ms -> 239s
  });

  it("parses duration across formats (ms, seconds, mm:ss, hh:mm:ss)", () => {
    assert.equal(parseDurationSec("180000"), 180); // ms
    assert.equal(parseDurationSec("212"), 212); // seconds
    assert.equal(parseDurationSec("3:30"), 210); // mm:ss
    assert.equal(parseDurationSec("1:02:15"), 3735); // hh:mm:ss
    assert.equal(parseDurationSec("invalid"), undefined);
    assert.equal(parseDurationSec(undefined), undefined);
  });

  it("parses pasted text in Artist - Title and flipped Title - Artist formats", () => {
    const text = `1. The Weeknd - Blinding Lights
2) Dua Lipa - Levitating
Queen - Bohemian Rhapsody
Single Title Only`;

    const standard = parsePastedText(text, false);
    assert.equal(standard.length, 4);
    assert.equal(standard[0].artist, "The Weeknd");
    assert.equal(standard[0].title, "Blinding Lights");
    assert.equal(standard[1].artist, "Dua Lipa");
    assert.equal(standard[1].title, "Levitating");
    assert.equal(standard[2].artist, "Queen");
    assert.equal(standard[2].title, "Bohemian Rhapsody");
    assert.equal(standard[3].title, "Single Title Only");
    assert.equal(standard[3].artist, "Unknown Artist");

    const flippedText = `Blinding Lights - The Weeknd\nLevitating - Dua Lipa`;
    const flipped = parsePastedText(flippedText, true);
    assert.equal(flipped[0].title, "Blinding Lights");
    assert.equal(flipped[0].artist, "The Weeknd");
  });
});
