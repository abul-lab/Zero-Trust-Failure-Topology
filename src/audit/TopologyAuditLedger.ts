import crypto from "node:crypto";
import type {
  ChainVerificationReport,
  TopologyAuditEntry,
} from "../types/index.js";

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
];

export function redactAuditText(input: string): string {
  let masked = input;
  for (const pattern of SECRET_PATTERNS) {
    masked = masked.replace(pattern, "[REDACTED]");
  }
  return masked;
}

function computeEntryHash(
  payload: Omit<TopologyAuditEntry, "entryHash">,
): string {
  const canonical = JSON.stringify({
    index: payload.index,
    entryId: payload.entryId,
    timestamp: payload.timestamp,
    eventType: payload.eventType,
    topologyId: payload.topologyId,
    summary: payload.summary,
    blastRadiusScore: payload.blastRadiusScore,
    prevHash: payload.prevHash,
  });
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

export interface TopologyAuditLedgerOptions {
  maxEntries?: number;
  onEntry?: (entry: TopologyAuditEntry) => void | Promise<void>;
}

/**
 * Append-only SHA-256 hash-chained audit ledger for topology simulations,
 * structural risk scans, bulkhead updates, and runtime quarantine events.
 */
export class TopologyAuditLedger {
  private readonly entries: TopologyAuditEntry[] = [];
  private readonly maxEntries: number;
  private readonly onEntry?: (entry: TopologyAuditEntry) => void | Promise<void>;

  constructor(options: TopologyAuditLedgerOptions = {}) {
    this.maxEntries = options.maxEntries ?? 5000;
    this.onEntry = options.onEntry;
  }

  public record(input: {
    eventType: TopologyAuditEntry["eventType"];
    topologyId: string;
    summary: string;
    blastRadiusScore: number;
    timestamp?: string;
  }): TopologyAuditEntry {
    const index = this.entries.length;
    const prevHash =
      index === 0 ? "GENESIS" : this.entries[index - 1]!.entryHash;
    const partial: Omit<TopologyAuditEntry, "entryHash"> = {
      index,
      entryId: `aud_${crypto.randomBytes(6).toString("hex")}`,
      timestamp: input.timestamp ?? new Date().toISOString(),
      eventType: input.eventType,
      topologyId: input.topologyId,
      summary: redactAuditText(input.summary),
      blastRadiusScore: input.blastRadiusScore,
      prevHash,
    };

    const entryHash = computeEntryHash(partial);
    const full: TopologyAuditEntry = { ...partial, entryHash };

    if (this.entries.length >= this.maxEntries) {
      // Reset from new genesis snapshot if rolling cap reached
      this.entries.length = 0;
      const rolledPartial: Omit<TopologyAuditEntry, "entryHash"> = {
        ...partial,
        index: 0,
        prevHash: "GENESIS",
      };
      const rolled: TopologyAuditEntry = {
        ...rolledPartial,
        entryHash: computeEntryHash(rolledPartial),
      };
      this.entries.push(rolled);
      this.emitHook(rolled);
      return { ...rolled };
    }

    this.entries.push(full);
    this.emitHook(full);
    return { ...full };
  }

  private emitHook(entry: TopologyAuditEntry): void {
    if (!this.onEntry) return;
    try {
      const maybePromise = this.onEntry({ ...entry });
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.catch(() => {
          // Never allow external SIEM transport errors to crash evaluation
        });
      }
    } catch {
      // Ignore synchronous observer errors
    }
  }

  public getEntries(): readonly TopologyAuditEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  public verifyChain(
    customEntries?: readonly TopologyAuditEntry[],
  ): ChainVerificationReport {
    const list = customEntries ?? this.entries;
    if (list.length === 0) {
      return {
        valid: true,
        checked: 0,
        headHash: "GENESIS",
      };
    }

    let expectedPrev = "GENESIS";
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i]!;
      if (item.index !== i) {
        return {
          valid: false,
          checked: i,
          headHash: list[list.length - 1]!.entryHash,
          brokenAtIndex: i,
          brokenEntryId: item.entryId,
          reason: `Unexpected entry index ${item.index} at position ${i}.`,
        };
      }
      if (item.prevHash !== expectedPrev) {
        return {
          valid: false,
          checked: i,
          headHash: list[list.length - 1]!.entryHash,
          brokenAtIndex: i,
          brokenEntryId: item.entryId,
          reason: `prevHash mismatch at index ${i} (expected ${expectedPrev.slice(0, 12)}..., got ${item.prevHash.slice(0, 12)}...).`,
        };
      }
      const recomputed = computeEntryHash({
        index: item.index,
        entryId: item.entryId,
        timestamp: item.timestamp,
        eventType: item.eventType,
        topologyId: item.topologyId,
        summary: item.summary,
        blastRadiusScore: item.blastRadiusScore,
        prevHash: item.prevHash,
      });
      if (recomputed !== item.entryHash) {
        return {
          valid: false,
          checked: i,
          headHash: list[list.length - 1]!.entryHash,
          brokenAtIndex: i,
          brokenEntryId: item.entryId,
          reason: `SHA-256 hash mismatch at index ${i} (${item.entryId}): payload was altered after signing.`,
        };
      }
      expectedPrev = item.entryHash;
    }

    return {
      valid: true,
      checked: list.length,
      headHash: expectedPrev,
    };
  }

  public exportJsonl(): string {
    return this.entries.map((e) => JSON.stringify(e)).join("\n");
  }

  public static verifyJsonl(jsonl: string): ChainVerificationReport {
    const trimmed = jsonl.trim();
    if (!trimmed) {
      return { valid: true, checked: 0, headHash: "GENESIS" };
    }
    const parsed: TopologyAuditEntry[] = trimmed
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as TopologyAuditEntry);
    const verifier = new TopologyAuditLedger();
    return verifier.verifyChain(parsed);
  }
}

