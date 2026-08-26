import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InstagramWebhookDeduplicatorDO,
  type DurableObjectStateLike,
  type DurableObjectStorageLike,
} from "./webhook-deduplicator-do.js";

function createMockStorage(): DurableObjectStorageLike {
  const store = new Map<string, unknown>();
  let alarmAt: number | null = null;

  return {
    get: vi.fn(async <T>(key: string) => store.get(key) as T | undefined),
    put: vi.fn(async <T>(key: string, value: T) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => store.delete(key)),
    list: vi.fn(async <T>(options?: { prefix?: string }) => {
      const result = new Map<string, T>();
      for (const [key, value] of store.entries()) {
        if (!options?.prefix || key.startsWith(options.prefix)) {
          result.set(key, value as T);
        }
      }
      return result;
    }),
    getAlarm: vi.fn(async () => alarmAt),
    setAlarm: vi.fn(async (scheduledTimeMs: number) => {
      alarmAt = scheduledTimeMs;
    }),
    deleteAlarm: vi.fn(async () => {
      alarmAt = null;
    }),
    deleteAll: vi.fn(async () => {
      store.clear();
      alarmAt = null;
    }),
  };
}

function createMockDOState(storage: DurableObjectStorageLike): DurableObjectStateLike {
  return {
    storage,
    id: { toString: () => "mock-do-id", name: "global" },
  };
}

describe("InstagramWebhookDeduplicatorDO", () => {
  let storage: DurableObjectStorageLike;
  let doState: DurableObjectStateLike;
  let deduplicator: InstagramWebhookDeduplicatorDO;

  beforeEach(() => {
    storage = createMockStorage();
    doState = createMockDOState(storage);
    deduplicator = new InstagramWebhookDeduplicatorDO(doState);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("accepts a first event ID with isNew: true and status 'new'", async () => {
    const res = await deduplicator.checkAndSet("evt_001", 3600);
    expect(res.isNew).toBe(true);
    expect(res.status).toBe("new");
    expect(storage.put).toHaveBeenCalledWith(
      "event:evt_001",
      expect.objectContaining({ status: "pending" })
    );
    expect(storage.setAlarm).toHaveBeenCalled();
  });

  it("marks a subsequent call for the same event as duplicate once delivered", async () => {
    await deduplicator.checkAndSet("evt_002", 3600);
    await deduplicator.markDelivered("evt_002", 3600);

    const check2 = await deduplicator.checkAndSet("evt_002", 3600);
    expect(check2.isNew).toBe(false);
    expect(check2.status).toBe("duplicate");
  });

  it("treats concurrent pending requests within lease window as in_progress duplicate", async () => {
    const res1 = await deduplicator.checkAndSet("evt_concurrent", 3600, 30000);
    expect(res1.isNew).toBe(true);

    const res2 = await deduplicator.checkAndSet("evt_concurrent", 3600, 30000);
    expect(res2.isNew).toBe(false);
    expect(res2.status).toBe("pending_in_progress");
  });

  it("accepts different event IDs independently", async () => {
    const resA = await deduplicator.checkAndSet("evt_A");
    const resB = await deduplicator.checkAndSet("evt_B");
    expect(resA.isNew).toBe(true);
    expect(resB.isNew).toBe(true);
  });

  it("releases pending state on failure so retry can be accepted immediately", async () => {
    const res1 = await deduplicator.checkAndSet("evt_fail_retry");
    expect(res1.isNew).toBe(true);

    await deduplicator.releasePending("evt_fail_retry");

    const resRetry = await deduplicator.checkAndSet("evt_fail_retry");
    expect(resRetry.isNew).toBe(true);
    expect(resRetry.status).toBe("new");
  });

  it("accepts a delivered event again after its logical TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T00:00:00.000Z"));

    await deduplicator.checkAndSet("evt_ttl", 1);
    await deduplicator.markDelivered("evt_ttl", 1);
    expect((await deduplicator.checkAndSet("evt_ttl", 1)).isNew).toBe(false);

    vi.setSystemTime(new Date("2026-08-26T00:00:01.001Z"));
    const afterExpiry = await deduplicator.checkAndSet("evt_ttl", 1);
    expect(afterExpiry.isNew).toBe(true);
    expect(afterExpiry.status).toBe("new");
  });

  it("alarm removes expired records and reschedules the next live expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T00:00:00.000Z"));

    await deduplicator.checkAndSet("evt_short", 1);
    await deduplicator.checkAndSet("evt_long", 10);

    vi.setSystemTime(new Date("2026-08-26T00:00:02.000Z"));
    await deduplicator.alarm();

    expect(await storage.get("event:evt_short")).toBeUndefined();
    expect(await storage.get("event:evt_long")).toBeDefined();
    expect(storage.setAlarm).toHaveBeenLastCalledWith(
      new Date("2026-08-26T00:00:10.000Z").getTime()
    );
  });

  it("handles HTTP fetch RPC endpoints for /check-and-set, /mark-delivered, /release-pending, and /is-duplicate", async () => {
    const req1 = new Request("https://do/check-and-set", {
      method: "POST",
      body: JSON.stringify({ eventId: "http_evt_1", ttlSeconds: 1800 }),
    });
    const res1 = await deduplicator.fetch(req1);
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { isNew: boolean; status: string };
    expect(body1.isNew).toBe(true);

    const reqDup = new Request("https://do/is-duplicate", {
      method: "POST",
      body: JSON.stringify({ eventId: "http_evt_1" }),
    });
    const resDup = await deduplicator.fetch(reqDup);
    const bodyDup = (await resDup.json()) as { isDuplicate: boolean };
    expect(bodyDup.isDuplicate).toBe(true);

    const reqDelivered = new Request("https://do/mark-delivered", {
      method: "POST",
      body: JSON.stringify({ eventId: "http_evt_1" }),
    });
    const resDelivered = await deduplicator.fetch(reqDelivered);
    expect(resDelivered.status).toBe(200);

    const reqRelease = new Request("https://do/release-pending", {
      method: "POST",
      body: JSON.stringify({ eventId: "http_evt_1" }),
    });
    const resRelease = await deduplicator.fetch(reqRelease);
    expect(resRelease.status).toBe(200);
  });
});
