/**
 * Browser-friendly packages only.
 * (No Node.js built-ins like fs, path, dotenv, etc.)
 * Works in both Node.js and modern browsers.
 */

export interface ApiKeyEntry {
  name: string;
  key: string;
}

/**
 * Round-robin API key rotator.
 *
 * Supports two formats:
 *  1. JSON array: [{"name":"account1","key":"AIza..."},{"name":"account2","key":"AIza..."}]
 *  2. Comma-separated (legacy): "AIza...,AIza...,AIza..."
 */
export class KeyRotator {
  private readonly entries: ApiKeyEntry[];
  private index: number = 0;

  constructor(keysInput: string) {
    const trimmed = keysInput.trim();

    if (trimmed.startsWith("[")) {
      // JSON format
      try {
        const parsed = JSON.parse(trimmed) as ApiKeyEntry[];
        this.entries = parsed.filter((e) => e.key && e.key.trim().length > 0);
      } catch {
        throw new Error("KeyRotator: invalid JSON format");
      }
    } else {
      // Legacy comma-separated format
      this.entries = trimmed
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
        .map((k, i) => ({ name: `key_${i + 1}`, key: k }));
    }

    if (this.entries.length === 0) {
      throw new Error("KeyRotator: no valid keys provided");
    }
  }

  getNext(): string {
    const entry = this.entries[this.index];
    this.index = (this.index + 1) % this.entries.length;
    return entry.key;
  }

  getNextEntry(): ApiKeyEntry {
    const entry = this.entries[this.index];
    this.index = (this.index + 1) % this.entries.length;
    return entry;
  }

  get size(): number {
    return this.entries.length;
  }

  getEntries(): ReadonlyArray<ApiKeyEntry> {
    return this.entries;
  }
}
