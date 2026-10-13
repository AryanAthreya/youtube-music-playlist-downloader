/**
 * Unit tests for QueueEngine.
 *
 * Verifies queue manipulation, shuffle with originalOrder restoration,
 * repeat modes (off/all/one), historyStack traversal, and edge cases.
 */

import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QueueEngine } from "./queue.ts";

describe("QueueEngine", () => {
  it("initializes empty and handles setQueue", () => {
    const q = new QueueEngine();
    assert.equal(q.getItems().length, 0);
    assert.equal(q.getCurrentIndex(), -1);
    assert.equal(q.getCurrentItem(), null);

    q.setQueue(["track-1", "track-2", "track-3"], 1);
    assert.equal(q.getItems().length, 3);
    assert.equal(q.getCurrentIndex(), 1);
    assert.equal(q.getCurrentItem()?.trackId, "track-2");
  });

  it("playNow inserts after current and advances index", () => {
    const q = new QueueEngine();
    q.setQueue(["track-1", "track-2", "track-3"], 0);

    const inserted = q.playNow("track-instant");
    assert.equal(q.getCurrentIndex(), 1);
    assert.equal(q.getCurrentItem()?.trackId, "track-instant");
    assert.equal(q.getItems()[1].qid, inserted.qid);
    assert.equal(q.getItems().length, 4);
    assert.equal(q.getItems()[2].trackId, "track-2");
  });

  it("playNext inserts immediately after current without advancing", () => {
    const q = new QueueEngine();
    q.setQueue(["track-1", "track-2", "track-3"], 0);

    const nextItem = q.playNext("track-after");
    assert.equal(q.getCurrentIndex(), 0);
    assert.equal(q.getCurrentItem()?.trackId, "track-1");
    assert.equal(q.getItems()[1].trackId, "track-after");
    assert.equal(q.getItems().length, 4);

    const adv = q.next(false);
    assert.equal(adv.action, "play");
    assert.equal(adv.index, 1);
    assert.equal(q.getCurrentItem()?.trackId, "track-after");
  });

  it("addToQueue appends to the end of queue", () => {
    const q = new QueueEngine();
    q.setQueue(["track-1", "track-2"], 0);

    q.addToQueue("track-tail");
    assert.equal(q.getItems().length, 3);
    assert.equal(q.getItems()[2].trackId, "track-tail");
  });

  it("remove item by qid handles index adjustments", () => {
    const q = new QueueEngine();
    q.setQueue(["track-1", "track-2", "track-3", "track-4"], 2); // on track-3
    const items = q.getItems();

    // Remove preceding item track-1
    q.remove(items[0].qid);
    assert.equal(q.getItems().length, 3);
    assert.equal(q.getCurrentIndex(), 1);
    assert.equal(q.getCurrentItem()?.trackId, "track-3");

    // Remove current track
    const currentQid = q.getCurrentItem()!.qid;
    q.remove(currentQid);
    assert.equal(q.getItems().length, 2);
    assert.equal(q.getCurrentIndex(), 1);
    assert.equal(q.getCurrentItem()?.trackId, "track-4");
  });

  it("move reorders items and updates currentIndex properly", () => {
    const q = new QueueEngine();
    q.setQueue(["track-1", "track-2", "track-3", "track-4"], 1); // on track-2

    // Move current track from 1 to 3
    q.move(1, 3);
    assert.equal(q.getCurrentIndex(), 3);
    assert.equal(q.getCurrentItem()?.trackId, "track-2");
    assert.equal(q.getItems()[0].trackId, "track-1");
    assert.equal(q.getItems()[1].trackId, "track-3");
    assert.equal(q.getItems()[2].trackId, "track-4");
    assert.equal(q.getItems()[3].trackId, "track-2");
  });

  it("shuffle pins current track, and turning shuffle off restores originalOrder", () => {
    const q = new QueueEngine();
    const tracks = ["a", "b", "c", "d", "e", "f", "g", "h"];
    q.setQueue(tracks, 3); // on 'd'
    const originalCurrentQid = q.getCurrentItem()!.qid;

    assert.equal(q.isShuffle(), false);
    q.toggleShuffle();
    assert.equal(q.isShuffle(), true);

    // Current item must remain pinned at index 0
    assert.equal(q.getCurrentIndex(), 0);
    assert.equal(q.getCurrentItem()?.trackId, "d");
    assert.equal(q.getCurrentItem()?.qid, originalCurrentQid);
    assert.equal(q.getItems().length, tracks.length);

    // Turn shuffle off -> restores original order and finds 'd' at original index 3
    q.toggleShuffle();
    assert.equal(q.isShuffle(), false);
    assert.equal(q.getCurrentIndex(), 3);
    assert.equal(q.getCurrentItem()?.trackId, "d");
    assert.deepEqual(
      q.getItems().map((i) => i.trackId),
      tracks
    );
  });

  it("shuffle previous walks historyStack instead of random re-selection", () => {
    const q = new QueueEngine();
    q.setQueue(["a", "b", "c", "d"], 0, true); // start shuffled
    const firstQid = q.getCurrentItem()!.qid;

    // Advance twice
    q.next(false);
    const secondQid = q.getCurrentItem()!.qid;
    q.next(false);
    const thirdQid = q.getCurrentItem()!.qid;

    assert.notEqual(secondQid, firstQid);
    assert.notEqual(thirdQid, secondQid);

    // Prev with <= 3 seconds retraces history step
    const prev1 = q.prev(1.5);
    assert.equal(prev1.action, "play");
    assert.equal(q.getCurrentItem()?.qid, secondQid);

    const prev2 = q.prev(0.5);
    assert.equal(prev2.action, "play");
    assert.equal(q.getCurrentItem()?.qid, firstQid);
  });

  it("repeat modes operate correctly on boundary and natural end", () => {
    const q = new QueueEngine();
    q.setQueue(["track-1", "track-2"], 1); // at end of queue

    // 1. Repeat off: stops at end
    q.setRepeatMode("off");
    const resOff = q.next(true);
    assert.equal(resOff.action, "stop");
    assert.equal(resOff.index, 0);

    // 2. Repeat all: wraps from end to beginning
    q.setQueue(["track-1", "track-2"], 1);
    q.setRepeatMode("all");
    const resAll = q.next(true);
    assert.equal(resAll.action, "play");
    assert.equal(resAll.index, 0);

    // 3. Repeat one: replays same track on autoplay
    q.setQueue(["track-1", "track-2"], 0);
    q.setRepeatMode("one");
    const resOneAuto = q.next(true); // natural end
    assert.equal(resOneAuto.action, "play");
    assert.equal(resOneAuto.index, 0);

    // Manual next advances even if repeat one is on
    const resOneManual = q.next(false);
    assert.equal(resOneManual.action, "play");
    assert.equal(resOneManual.index, 1);
  });

  it("prev restarts track if currentTime > 3 seconds", () => {
    const q = new QueueEngine();
    q.setQueue(["track-1", "track-2"], 1);

    // Seek > 3s -> restart current
    const resRestart = q.prev(4.2);
    assert.equal(resRestart.action, "restart");
    assert.equal(resRestart.index, 1);

    // Seek <= 3s -> moves to previous track
    const resPrev = q.prev(1.0);
    assert.equal(resPrev.action, "play");
    assert.equal(resPrev.index, 0);
  });

  it("serializes and restores state accurately", () => {
    const q = new QueueEngine();
    q.setQueue(["t1", "t2", "t3"], 1);
    q.setRepeatMode("all");
    q.toggleShuffle();

    const state = q.getState();
    assert.equal(state.repeat, "all");
    assert.equal(state.shuffle, true);

    const q2 = new QueueEngine();
    q2.restore(state);
    assert.equal(q2.isShuffle(), true);
    assert.equal(q2.getRepeatMode(), "all");
    assert.equal(q2.getItems().length, 3);
    assert.equal(q2.getCurrentIndex(), state.currentIndex);
  });
});
