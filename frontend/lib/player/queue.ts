/**
 * Pure, framework-agnostic Queue Engine.
 *
 * Implements Spotify / YouTube Music style queue behaviors:
 * - Fisher-Yates shuffle with pinned current track & originalOrder restoration
 * - History stack for deterministic "previous" track traversal in shuffle mode
 * - 3-state repeat modes (off / all / one)
 * - Play next, add to queue, drag/touch reordering, remove, and boundary edge cases
 */

import type { QueueItem, RepeatMode, PlayerQueueState } from "./types";

/**
 * Generate a lightweight unique ID for a queue item.
 */
export function generateQid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export interface NextResult {
  action: "play" | "stop";
  index: number;
}

export interface PrevResult {
  action: "restart" | "play";
  index: number;
}

export class QueueEngine {
  private items: QueueItem[] = [];
  private currentIndex: number = -1;
  private shuffle: boolean = false;
  private repeat: RepeatMode = "off";
  private originalOrder: QueueItem[] = [];
  private historyStack: number[] = [];

  constructor(initialState?: Partial<PlayerQueueState>) {
    if (initialState) {
      this.restore(initialState);
    }
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  public getItems(): QueueItem[] {
    return [...this.items];
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public getCurrentItem(): QueueItem | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.items.length) {
      return this.items[this.currentIndex];
    }
    return null;
  }

  public isShuffle(): boolean {
    return this.shuffle;
  }

  public getRepeatMode(): RepeatMode {
    return this.repeat;
  }

  public getHistoryStack(): number[] {
    return [...this.historyStack];
  }

  public getOriginalOrder(): QueueItem[] {
    return [...this.originalOrder];
  }

  public getState(): PlayerQueueState {
    return {
      items: [...this.items],
      currentIndex: this.currentIndex,
      shuffle: this.shuffle,
      repeat: this.repeat,
      originalOrder: [...this.originalOrder],
      historyStack: [...this.historyStack],
    };
  }

  // ── Queue Population & Reset ───────────────────────────────────────────────

  /**
   * Replace the entire queue with a new list of tracks (e.g. clicking "Play All" on a playlist).
   */
  public setQueue(
    trackIds: string[],
    startIndex: number = 0,
    enableShuffle: boolean = false,
  ): void {
    if (trackIds.length === 0) {
      this.items = [];
      this.originalOrder = [];
      this.currentIndex = -1;
      this.historyStack = [];
      this.shuffle = false;
      return;
    }

    const items: QueueItem[] = trackIds.map((id) => ({
      qid: generateQid(),
      trackId: id,
    }));

    const validStartIndex = Math.max(0, Math.min(startIndex, items.length - 1));
    this.originalOrder = [...items];

    if (enableShuffle) {
      this.shuffle = true;
      const current = items[validStartIndex];
      const remaining = items.filter((_, idx) => idx !== validStartIndex);
      this.fisherYatesShuffle(remaining);
      this.items = [current, ...remaining];
      this.currentIndex = 0;
      this.historyStack = [0];
    } else {
      this.shuffle = false;
      this.items = items;
      this.currentIndex = validStartIndex;
      this.historyStack = [validStartIndex];
    }
  }

  // ── Queue Mutations ────────────────────────────────────────────────────────

  /**
   * Play track immediately: inserts at currentIndex + 1 and advances to it.
   */
  public playNow(trackId: string): QueueItem {
    const newItem: QueueItem = { qid: generateQid(), trackId };

    if (this.items.length === 0) {
      this.items = [newItem];
      this.originalOrder = [newItem];
      this.currentIndex = 0;
      this.historyStack = [0];
      return newItem;
    }

    const insertAt = this.currentIndex + 1;
    this.items.splice(insertAt, 0, newItem);
    this.originalOrder.push(newItem);

    this.historyStack.push(this.currentIndex);
    this.currentIndex = insertAt;
    return newItem;
  }

  /**
   * Play Next: inserts track immediately after currentIndex so it plays next.
   */
  public playNext(trackId: string): QueueItem {
    const newItem: QueueItem = { qid: generateQid(), trackId };

    if (this.items.length === 0) {
      this.items = [newItem];
      this.originalOrder = [newItem];
      this.currentIndex = 0;
      this.historyStack = [0];
      return newItem;
    }

    const insertAt = this.currentIndex + 1;
    this.items.splice(insertAt, 0, newItem);
    this.originalOrder.push(newItem);
    return newItem;
  }

  /**
   * Add to Queue: appends track to the very end of the queue.
   */
  public addToQueue(trackId: string): QueueItem {
    const newItem: QueueItem = { qid: generateQid(), trackId };

    this.items.push(newItem);
    this.originalOrder.push(newItem);

    if (this.currentIndex === -1) {
      this.currentIndex = 0;
      this.historyStack = [0];
    }
    return newItem;
  }

  /**
   * Remove item by its unique qid.
   */
  public remove(qid: string): boolean {
    const index = this.items.findIndex((item) => item.qid === qid);
    if (index === -1) return false;

    this.items.splice(index, 0); // test remove
    this.items.splice(index, 1);
    this.originalOrder = this.originalOrder.filter((item) => item.qid !== qid);

    if (this.items.length === 0) {
      this.currentIndex = -1;
      this.historyStack = [];
      return true;
    }

    if (index < this.currentIndex) {
      this.currentIndex--;
    } else if (index === this.currentIndex) {
      // Current track was removed; keep index at same position if possible, or clamp
      if (this.currentIndex >= this.items.length) {
        this.currentIndex = this.items.length - 1;
      }
    }

    // Clean up history stack references
    this.historyStack = this.historyStack
      .filter((idx) => idx !== index)
      .map((idx) => (idx > index ? idx - 1 : idx));

    return true;
  }

  /**
   * Clear all upcoming tracks in the queue, keeping only the currently playing track.
   */
  public clearUpcoming(): void {
    if (this.currentIndex >= 0 && this.currentIndex < this.items.length) {
      const current = this.items[this.currentIndex];
      this.items = [current];
      this.originalOrder = [current];
      this.currentIndex = 0;
      this.historyStack = [0];
    } else {
      this.items = [];
      this.originalOrder = [];
      this.currentIndex = -1;
      this.historyStack = [];
    }
  }

  /**
   * Reorder items in the queue (e.g. drag & drop).
   */
  public move(fromIndex: number, toIndex: number): boolean {
    if (
      fromIndex < 0 ||
      fromIndex >= this.items.length ||
      toIndex < 0 ||
      toIndex >= this.items.length ||
      fromIndex === toIndex
    ) {
      return false;
    }

    const [moved] = this.items.splice(fromIndex, 1);
    this.items.splice(toIndex, 0, moved);

    // Adjust currentIndex
    if (this.currentIndex === fromIndex) {
      this.currentIndex = toIndex;
    } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
      this.currentIndex--;
    } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
      this.currentIndex++;
    }

    return true;
  }

  /**
   * Jump directly to a given index.
   */
  public jumpToIndex(index: number): boolean {
    if (index < 0 || index >= this.items.length) {
      return false;
    }
    if (this.currentIndex >= 0) {
      this.historyStack.push(this.currentIndex);
    }
    this.currentIndex = index;
    return true;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  /**
   * Advance to next track.
   *
   * @param isAutoplay Set to true when track ends naturally.
   * If repeat is 'one' and isAutoplay is true, the same track repeats.
   * Manual next always advances regardless of repeat mode.
   */
  public next(isAutoplay: boolean = false): NextResult {
    if (this.items.length === 0) {
      return { action: "stop", index: -1 };
    }

    // Repeat one on natural track completion
    if (this.repeat === "one" && isAutoplay) {
      return { action: "play", index: this.currentIndex };
    }

    const nextIndex = this.currentIndex + 1;

    // Within bounds
    if (nextIndex < this.items.length) {
      if (this.currentIndex >= 0) {
        this.historyStack.push(this.currentIndex);
      }
      this.currentIndex = nextIndex;
      return { action: "play", index: this.currentIndex };
    }

    // At end of queue
    if (this.repeat === "all") {
      if (this.currentIndex >= 0) {
        this.historyStack.push(this.currentIndex);
      }
      this.currentIndex = 0;
      return { action: "play", index: 0 };
    }

    // Repeat off: stop at end, reset to index 0 (paused)
    this.currentIndex = 0;
    return { action: "stop", index: 0 };
  }

  /**
   * Navigate to previous track or restart current track if >3 seconds listened.
   */
  public prev(currentTimeSec: number = 0): PrevResult {
    if (this.items.length === 0) {
      return { action: "restart", index: -1 };
    }

    // If more than 3 seconds in, restart track
    if (currentTimeSec > 3) {
      return { action: "restart", index: this.currentIndex };
    }

    // If in shuffle mode and historyStack has tracks, pop previous step
    if (this.shuffle && this.historyStack.length > 0) {
      const prevIndex = this.historyStack.pop()!;
      if (prevIndex >= 0 && prevIndex < this.items.length) {
        this.currentIndex = prevIndex;
        return { action: "play", index: this.currentIndex };
      }
    }

    // Linear previous
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return { action: "play", index: this.currentIndex };
    }

    // At beginning of queue: wrap if repeat all
    if (this.repeat === "all") {
      this.currentIndex = this.items.length - 1;
      return { action: "play", index: this.currentIndex };
    }

    // Otherwise simply restart track at 0
    return { action: "restart", index: 0 };
  }

  // ── Shuffle & Repeat Toggles ───────────────────────────────────────────────

  /**
   * Toggle shuffle mode.
   * - When ON: current track is pinned at index 0, remaining tracks shuffled.
   * - When OFF: originalOrder is restored, preserving the currently playing track.
   */
  public toggleShuffle(): boolean {
    if (this.items.length <= 1) {
      this.shuffle = !this.shuffle;
      return this.shuffle;
    }

    if (!this.shuffle) {
      // Turn shuffle ON
      this.shuffle = true;
      const current = this.getCurrentItem();
      if (!current) {
        this.originalOrder = [...this.items];
        this.fisherYatesShuffle(this.items);
        this.currentIndex = 0;
        this.historyStack = [0];
        return true;
      }

      this.originalOrder = [...this.items];
      const remaining = this.items.filter((item) => item.qid !== current.qid);
      this.fisherYatesShuffle(remaining);

      this.items = [current, ...remaining];
      this.currentIndex = 0;
      this.historyStack = [0];
    } else {
      // Turn shuffle OFF: restore originalOrder
      this.shuffle = false;
      const current = this.getCurrentItem();
      this.items = [...this.originalOrder];

      if (current) {
        const restoredIndex = this.items.findIndex((item) => item.qid === current.qid);
        this.currentIndex = restoredIndex !== -1 ? restoredIndex : 0;
      } else {
        this.currentIndex = Math.max(0, Math.min(this.currentIndex, this.items.length - 1));
      }
      this.historyStack = [];
    }

    return this.shuffle;
  }

  /**
   * Cycle repeat mode: "off" -> "all" -> "one" -> "off".
   */
  public cycleRepeatMode(): RepeatMode {
    if (this.repeat === "off") {
      this.repeat = "all";
    } else if (this.repeat === "all") {
      this.repeat = "one";
    } else {
      this.repeat = "off";
    }
    return this.repeat;
  }

  public setRepeatMode(mode: RepeatMode): void {
    this.repeat = mode;
  }

  // ── Serialization & Restoration ───────────────────────────────────────────

  public restore(state: Partial<PlayerQueueState>): void {
    if (Array.isArray(state.items)) {
      this.items = [...state.items];
    }
    if (typeof state.currentIndex === "number") {
      this.currentIndex = Math.max(-1, Math.min(state.currentIndex, this.items.length - 1));
    }
    if (typeof state.shuffle === "boolean") {
      this.shuffle = state.shuffle;
    }
    if (state.repeat === "off" || state.repeat === "all" || state.repeat === "one") {
      this.repeat = state.repeat;
    }
    if (Array.isArray(state.originalOrder) && state.originalOrder.length > 0) {
      this.originalOrder = [...state.originalOrder];
    } else {
      this.originalOrder = [...this.items];
    }
    if (Array.isArray(state.historyStack)) {
      this.historyStack = [...state.historyStack];
    }
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  private fisherYatesShuffle(arr: QueueItem[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
  }
}
