import { describe, test } from "node:test";
import assert from "node:assert";

import { KeyRotator } from "../../src/utils/key_rotator.js";

describe("KeyRotator", () => {
    // === JSON format tests ===
    test("JSON format: round-robin rotation", () => {
        const input = JSON.stringify([
            { name: "project-a", key: "keyA" },
            { name: "project-b", key: "keyB" },
            { name: "project-c", key: "keyC" },
        ]);
        const rotator = new KeyRotator(input);
        assert.equal(rotator.getNext(), "keyA");
        assert.equal(rotator.getNext(), "keyB");
        assert.equal(rotator.getNext(), "keyC");
        assert.equal(rotator.getNext(), "keyA"); // wraps around
    });

    test("JSON format: getNextEntry returns name and key", () => {
        const input = JSON.stringify([
            { name: "my-account", key: "AIza123" },
            { name: "work-account", key: "AIza456" },
        ]);
        const rotator = new KeyRotator(input);
        const e1 = rotator.getNextEntry();
        assert.equal(e1.name, "my-account");
        assert.equal(e1.key, "AIza123");
        const e2 = rotator.getNextEntry();
        assert.equal(e2.name, "work-account");
        assert.equal(e2.key, "AIza456");
    });

    test("JSON format: getEntries returns all entries", () => {
        const input = JSON.stringify([
            { name: "a", key: "k1" },
            { name: "b", key: "k2" },
        ]);
        const rotator = new KeyRotator(input);
        const entries = rotator.getEntries();
        assert.equal(entries.length, 2);
        assert.equal(entries[0].name, "a");
        assert.equal(entries[1].name, "b");
    });

    test("JSON format: filters out entries with empty key", () => {
        const input = JSON.stringify([
            { name: "good", key: "valid_key" },
            { name: "bad", key: "" },
        ]);
        const rotator = new KeyRotator(input);
        assert.equal(rotator.size, 1);
        assert.equal(rotator.getNext(), "valid_key");
    });

    test("JSON format: throws on invalid JSON", () => {
        assert.throws(() => new KeyRotator("[invalid json"), /invalid JSON format/);
    });

    test("JSON format: throws on empty array", () => {
        assert.throws(() => new KeyRotator("[]"), /no valid keys provided/);
    });

    // === Legacy comma-separated format tests ===
    test("legacy: round-robin rotation with multiple keys", () => {
        const rotator = new KeyRotator("key1,key2,key3");
        assert.equal(rotator.getNext(), "key1");
        assert.equal(rotator.getNext(), "key2");
        assert.equal(rotator.getNext(), "key3");
        assert.equal(rotator.getNext(), "key1"); // wraps around
    });

    test("legacy: auto-generates names", () => {
        const rotator = new KeyRotator("k1,k2,k3");
        const entries = rotator.getEntries();
        assert.equal(entries[0].name, "key_1");
        assert.equal(entries[1].name, "key_2");
        assert.equal(entries[2].name, "key_3");
    });

    test("legacy: single key returns same key every time", () => {
        const rotator = new KeyRotator("only_key");
        assert.equal(rotator.getNext(), "only_key");
        assert.equal(rotator.getNext(), "only_key");
    });

    test("legacy: trims whitespace from keys", () => {
        const rotator = new KeyRotator(" key1 , key2 , key3 ");
        assert.equal(rotator.getNext(), "key1");
        assert.equal(rotator.getNext(), "key2");
        assert.equal(rotator.getNext(), "key3");
    });

    test("legacy: filters out empty keys", () => {
        const rotator = new KeyRotator("key1,,key2,,,key3");
        assert.equal(rotator.size, 3);
    });

    test("legacy: throws on empty string", () => {
        assert.throws(() => new KeyRotator(""), /no valid keys provided/);
    });

    // === Object.defineProperty getter pattern ===
    test("works with Object.defineProperty getter pattern", () => {
        const input = JSON.stringify([
            { name: "a", key: "keyA" },
            { name: "b", key: "keyB" },
            { name: "c", key: "keyC" },
        ]);
        const rotator = new KeyRotator(input);
        const config: Record<string, unknown> = {};
        Object.defineProperty(config, "apiKey", {
            get: () => rotator.getNext(),
            enumerable: true,
            configurable: true,
        });
        assert.equal(config.apiKey, "keyA");
        assert.equal(config.apiKey, "keyB");
        assert.equal(config.apiKey, "keyC");
        assert.equal(config.apiKey, "keyA"); // wraps around
    });
});
