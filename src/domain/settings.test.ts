import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, deserializeSettings, joinSettingsTags, serializeSettings, splitSettingsTags } from "./settings";

describe("settings", () => {
  it("round-trips versioned settings", () => {
    expect(deserializeSettings(serializeSettings(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back for malformed or unknown schemas", () => {
    expect(deserializeSettings("bad json")).toEqual(DEFAULT_SETTINGS);
    expect(deserializeSettings('{"schemaVersion":2}')).toEqual(DEFAULT_SETTINGS);
  });

  it("splits and rejoins settings across bounded PowerPoint tags", () => {
    const tags = splitSettingsTags(DEFAULT_SETTINGS);
    expect(tags.length).toBeGreaterThan(1);
    expect(tags.every((tag) => tag.value.length <= 220)).toBe(true);
    expect(joinSettingsTags(tags.reverse())).toEqual(DEFAULT_SETTINGS);
  });
});
