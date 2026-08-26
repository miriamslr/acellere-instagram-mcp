import { describe, it, expect, beforeEach } from "vitest";
import { MemoryCompetitorStore } from "./competitor-store.js";

describe("MemoryCompetitorStore", () => {
  let store: MemoryCompetitorStore;

  beforeEach(() => {
    store = new MemoryCompetitorStore();
  });

  it("upserts a new competitor record", async () => {
    const comp = await store.upsertCompetitor({
      instagram_id: "1784140001",
      ig_id: "998877",
      username: "AlphaFitness",
      name: "Alpha Fitness Co",
    });

    expect(comp.id).toBeDefined();
    expect(comp.username).toBe("alphafitness");
    expect(comp.is_active).toBe(true);

    const fetched = await store.getCompetitorByUsername("alphafitness");
    expect(fetched?.instagram_id).toBe("1784140001");
  });

  it("updates existing competitor preserving same internal id when username changes", async () => {
    const original = await store.upsertCompetitor({
      instagram_id: "1784140002",
      username: "old_handle",
      name: "Brand Old",
    });

    const updated = await store.upsertCompetitor({
      instagram_id: "1784140002",
      username: "new_handle",
      name: "Brand New",
    });

    expect(updated.id).toBe(original.id);
    expect(updated.username).toBe("new_handle");

    const fetchedByNew = await store.getCompetitorByUsername("new_handle");
    expect(fetchedByNew?.id).toBe(original.id);
  });

  it("stores and retrieves snapshots with chronological sorting and date filtering", async () => {
    const comp = await store.upsertCompetitor({
      instagram_id: "1784140003",
      username: "snapshots_user",
    });

    await store.addCompetitorSnapshot({
      competitor_id: comp.id,
      captured_at: "2026-05-01T12:00:00Z",
      followers_count: 10000,
      follows_count: 200,
      media_count: 50,
    });

    await store.addCompetitorSnapshot({
      competitor_id: comp.id,
      captured_at: "2026-05-15T12:00:00Z",
      followers_count: 11000,
      follows_count: 210,
      media_count: 55,
    });

    await store.addCompetitorSnapshot({
      competitor_id: comp.id,
      captured_at: "2026-05-30T12:00:00Z",
      followers_count: 12500,
      follows_count: 220,
      media_count: 60,
    });

    const allSnaps = await store.getCompetitorSnapshots(comp.id);
    expect(allSnaps).toHaveLength(3);
    expect(allSnaps[0].followers_count).toBe(10000);
    expect(allSnaps[2].followers_count).toBe(12500);

    const filteredSnaps = await store.getCompetitorSnapshots(
      comp.id,
      "2026-05-10T00:00:00Z",
      "2026-05-20T00:00:00Z"
    );
    expect(filteredSnaps).toHaveLength(1);
    expect(filteredSnaps[0].followers_count).toBe(11000);
  });

  it("deduplicates media and tracks metric snapshots per media item", async () => {
    const comp = await store.upsertCompetitor({
      instagram_id: "1784140004",
      username: "media_user",
    });

    const m1 = await store.upsertCompetitorMedia({
      instagram_media_id: "post_123",
      competitor_id: comp.id,
      caption: "Caption 1",
      media_type: "IMAGE",
      media_product_type: null,
      permalink: "https://instagram.com/p/123",
      published_at: "2026-05-01T10:00:00Z",
      children_count: 0,
    });

    const m1Repeat = await store.upsertCompetitorMedia({
      instagram_media_id: "post_123",
      competitor_id: comp.id,
      caption: "Updated caption 1",
      media_type: "IMAGE",
      media_product_type: null,
      permalink: "https://instagram.com/p/123",
      published_at: "2026-05-01T10:00:00Z",
      children_count: 0,
    });

    expect(m1Repeat.id).toBe(m1.id);
    expect(m1Repeat.caption).toBe("Updated caption 1");

    await store.addMediaSnapshot({
      media_id: m1.id,
      captured_at: "2026-05-01T12:00:00Z",
      like_count: 100,
      comments_count: 10,
      view_count: null,
    });

    await store.addMediaSnapshot({
      media_id: m1.id,
      captured_at: "2026-05-05T12:00:00Z",
      like_count: 350,
      comments_count: 25,
      view_count: null,
    });

    const mediaWithSnaps = await store.getMediaWithSnapshots(comp.id);
    expect(mediaWithSnaps).toHaveLength(1);
    expect(mediaWithSnaps[0].snapshots).toHaveLength(2);
    expect(mediaWithSnaps[0].snapshots[0].like_count).toBe(100);
    expect(mediaWithSnaps[0].snapshots[1].like_count).toBe(350);
  });

  it("handles active/inactive state and collection runs", async () => {
    await store.upsertCompetitor({
      instagram_id: "1784140005",
      username: "user_a",
      is_active: true,
    });
    await store.upsertCompetitor({
      instagram_id: "1784140006",
      username: "user_b",
      is_active: false,
    });

    const activeList = await store.listActiveCompetitors();
    expect(activeList).toHaveLength(1);
    expect(activeList[0].username).toBe("user_a");

    const run = await store.createCollectionRun({
      started_at: "2026-05-01T00:00:00Z",
      status: "running",
      accounts_requested: 1,
      accounts_successful: 0,
      accounts_failed: 0,
      api_calls: 0,
    });

    const updated = await store.updateCollectionRun(run.id, {
      finished_at: "2026-05-01T00:05:00Z",
      status: "completed",
      accounts_successful: 1,
      api_calls: 2,
    });

    expect(updated?.status).toBe("completed");
    expect(updated?.accounts_successful).toBe(1);
  });
});
