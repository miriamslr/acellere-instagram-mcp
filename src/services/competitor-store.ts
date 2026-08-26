export interface CompetitorRecord {
  id: string;
  instagram_id: string;
  ig_id?: string | null;
  username: string;
  name?: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
}

export interface CompetitorSnapshotRecord {
  id: string;
  competitor_id: string;
  captured_at: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  biography?: string | null;
  website?: string | null;
  profile_picture_url?: string | null;
}

export interface CompetitorMediaRecord {
  id: string;
  instagram_media_id: string;
  competitor_id: string;
  caption?: string | null;
  media_type: string;
  media_product_type?: string | null;
  permalink?: string | null;
  published_at: string;
  children_count: number;
}

export interface CompetitorMediaSnapshotRecord {
  id: string;
  media_id: string;
  captured_at: string;
  like_count: number | null;
  comments_count: number | null;
  view_count: number | null;
}

export interface CollectionRunRecord {
  id: string;
  started_at: string;
  finished_at?: string | null;
  status: "running" | "completed" | "failed" | "partial";
  accounts_requested: number;
  accounts_successful: number;
  accounts_failed: number;
  api_calls: number;
  errors?: Array<{ username: string; error: string }> | null;
}

export interface CompetitorStore {
  upsertCompetitor(data: {
    instagram_id: string;
    ig_id?: string | null;
    username: string;
    name?: string | null;
    is_active?: boolean;
  }): Promise<CompetitorRecord>;

  getCompetitorByUsername(username: string): Promise<CompetitorRecord | null>;
  getCompetitorByInstagramId(instagramId: string): Promise<CompetitorRecord | null>;
  listActiveCompetitors(): Promise<CompetitorRecord[]>;
  setCompetitorActiveStatus(username: string, isActive: boolean): Promise<boolean>;

  addCompetitorSnapshot(snapshot: Omit<CompetitorSnapshotRecord, "id">): Promise<CompetitorSnapshotRecord>;
  getCompetitorSnapshots(competitorId: string, since?: string, until?: string): Promise<CompetitorSnapshotRecord[]>;

  upsertCompetitorMedia(media: Omit<CompetitorMediaRecord, "id">): Promise<CompetitorMediaRecord>;
  addMediaSnapshot(snapshot: Omit<CompetitorMediaSnapshotRecord, "id">): Promise<CompetitorMediaSnapshotRecord>;
  getMediaWithSnapshots(
    competitorId: string,
    since?: string,
    until?: string
  ): Promise<Array<{
    media: CompetitorMediaRecord;
    snapshots: CompetitorMediaSnapshotRecord[];
  }>>;

  createCollectionRun(run: Omit<CollectionRunRecord, "id">): Promise<CollectionRunRecord>;
  updateCollectionRun(id: string, update: Partial<CollectionRunRecord>): Promise<CollectionRunRecord | null>;
  listCollectionRuns(limit?: number): Promise<CollectionRunRecord[]>;
  clearAll(): Promise<void>;
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class MemoryCompetitorStore implements CompetitorStore {
  private competitors: Map<string, CompetitorRecord> = new Map(); // key = id
  private snapshots: CompetitorSnapshotRecord[] = [];
  private mediaItems: Map<string, CompetitorMediaRecord> = new Map(); // key = id
  private mediaSnapshots: CompetitorMediaSnapshotRecord[] = [];
  private collectionRuns: Map<string, CollectionRunRecord> = new Map();

  async upsertCompetitor(data: {
    instagram_id: string;
    ig_id?: string | null;
    username: string;
    name?: string | null;
    is_active?: boolean;
  }): Promise<CompetitorRecord> {
    const now = new Date().toISOString();
    const cleanUsername = data.username.toLowerCase();

    // Check if exists by instagram_id first (handles username changes)
    let existing = Array.from(this.competitors.values()).find(
      (c) => c.instagram_id === data.instagram_id
    );

    // Fallback: check by username
    if (!existing) {
      existing = Array.from(this.competitors.values()).find(
        (c) => c.username.toLowerCase() === cleanUsername
      );
    }

    if (existing) {
      existing.username = cleanUsername;
      if (data.name !== undefined) existing.name = data.name;
      if (data.ig_id !== undefined) existing.ig_id = data.ig_id;
      if (data.is_active !== undefined) existing.is_active = data.is_active;
      existing.last_seen_at = now;
      this.competitors.set(existing.id, existing);
      return { ...existing };
    }

    const newRecord: CompetitorRecord = {
      id: generateId(),
      instagram_id: data.instagram_id,
      ig_id: data.ig_id ?? null,
      username: cleanUsername,
      name: data.name ?? null,
      first_seen_at: now,
      last_seen_at: now,
      is_active: data.is_active ?? true,
    };

    this.competitors.set(newRecord.id, newRecord);
    return { ...newRecord };
  }

  async getCompetitorByUsername(username: string): Promise<CompetitorRecord | null> {
    const clean = username.toLowerCase();
    const comp = Array.from(this.competitors.values()).find(
      (c) => c.username.toLowerCase() === clean
    );
    return comp ? { ...comp } : null;
  }

  async getCompetitorByInstagramId(instagramId: string): Promise<CompetitorRecord | null> {
    const comp = Array.from(this.competitors.values()).find(
      (c) => c.instagram_id === instagramId
    );
    return comp ? { ...comp } : null;
  }

  async listActiveCompetitors(): Promise<CompetitorRecord[]> {
    return Array.from(this.competitors.values())
      .filter((c) => c.is_active)
      .map((c) => ({ ...c }));
  }

  async setCompetitorActiveStatus(username: string, isActive: boolean): Promise<boolean> {
    const comp = await this.getCompetitorByUsername(username);
    if (!comp) return false;
    comp.is_active = isActive;
    comp.last_seen_at = new Date().toISOString();
    this.competitors.set(comp.id, comp);
    return true;
  }

  async addCompetitorSnapshot(
    snapshot: Omit<CompetitorSnapshotRecord, "id">
  ): Promise<CompetitorSnapshotRecord> {
    const record: CompetitorSnapshotRecord = {
      id: generateId(),
      ...snapshot,
    };
    this.snapshots.push(record);
    return { ...record };
  }

  async getCompetitorSnapshots(
    competitorId: string,
    since?: string,
    until?: string
  ): Promise<CompetitorSnapshotRecord[]> {
    const sinceMs = since ? Date.parse(since) : undefined;
    const untilMs = until ? Date.parse(until) : undefined;

    return this.snapshots
      .filter((s) => {
        if (s.competitor_id !== competitorId) return false;
        const capturedMs = Date.parse(s.captured_at);
        if (Number.isNaN(capturedMs)) return true;
        if (sinceMs !== undefined && capturedMs < sinceMs) return false;
        if (untilMs !== undefined && capturedMs > untilMs) return false;
        return true;
      })
      .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at))
      .map((s) => ({ ...s }));
  }

  async upsertCompetitorMedia(
    media: Omit<CompetitorMediaRecord, "id">
  ): Promise<CompetitorMediaRecord> {
    const existing = Array.from(this.mediaItems.values()).find(
      (m) => m.instagram_media_id === media.instagram_media_id
    );

    if (existing) {
      if (media.caption !== undefined) existing.caption = media.caption;
      if (media.permalink !== undefined) existing.permalink = media.permalink;
      this.mediaItems.set(existing.id, existing);
      return { ...existing };
    }

    const record: CompetitorMediaRecord = {
      id: generateId(),
      ...media,
    };
    this.mediaItems.set(record.id, record);
    return { ...record };
  }

  async addMediaSnapshot(
    snapshot: Omit<CompetitorMediaSnapshotRecord, "id">
  ): Promise<CompetitorMediaSnapshotRecord> {
    const record: CompetitorMediaSnapshotRecord = {
      id: generateId(),
      ...snapshot,
    };
    this.mediaSnapshots.push(record);
    return { ...record };
  }

  async getMediaWithSnapshots(
    competitorId: string,
    since?: string,
    until?: string
  ): Promise<
    Array<{
      media: CompetitorMediaRecord;
      snapshots: CompetitorMediaSnapshotRecord[];
    }>
  > {
    const sinceMs = since ? Date.parse(since) : undefined;
    const untilMs = until ? Date.parse(until) : undefined;

    const mediaList = Array.from(this.mediaItems.values()).filter((m) => {
      if (m.competitor_id !== competitorId) return false;
      const pubMs = Date.parse(m.published_at);
      if (Number.isNaN(pubMs)) return true;
      if (sinceMs !== undefined && pubMs < sinceMs) return false;
      if (untilMs !== undefined && pubMs > untilMs) return false;
      return true;
    });

    return mediaList.map((media) => {
      const snaps = this.mediaSnapshots
        .filter((s) => s.media_id === media.id)
        .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
      return {
        media: { ...media },
        snapshots: snaps.map((s) => ({ ...s })),
      };
    });
  }

  async createCollectionRun(run: Omit<CollectionRunRecord, "id">): Promise<CollectionRunRecord> {
    const record: CollectionRunRecord = {
      id: generateId(),
      ...run,
    };
    this.collectionRuns.set(record.id, record);
    return { ...record };
  }

  async updateCollectionRun(
    id: string,
    update: Partial<CollectionRunRecord>
  ): Promise<CollectionRunRecord | null> {
    const run = this.collectionRuns.get(id);
    if (!run) return null;
    const updated = { ...run, ...update };
    this.collectionRuns.set(id, updated);
    return { ...updated };
  }

  async listCollectionRuns(limit = 20): Promise<CollectionRunRecord[]> {
    return Array.from(this.collectionRuns.values())
      .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async clearAll(): Promise<void> {
    this.competitors.clear();
    this.snapshots = [];
    this.mediaItems.clear();
    this.mediaSnapshots = [];
    this.collectionRuns.clear();
  }
}

// Global Singleton Store Instance
let globalStore: CompetitorStore | null = null;

export function getGlobalCompetitorStore(): CompetitorStore {
  if (!globalStore) {
    globalStore = new MemoryCompetitorStore();
  }
  return globalStore;
}

export function setGlobalCompetitorStore(store: CompetitorStore): void {
  globalStore = store;
}
