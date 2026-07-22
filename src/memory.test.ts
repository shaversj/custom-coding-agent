import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type MemoryStore,
  forgetMemory,
  formatMemoriesForDisplay,
  formatMemoriesForPrompt,
  listMemories,
  loadMemory,
  rememberProjectNote,
  saveMemory,
} from "./memory.js";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "custom-coding-agent-memory-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("memory store", () => {
  it("loads an empty store when no memory file exists", async () => {
    const memory = await loadMemory(workspace);

    expect(memory).toMatchObject({
      version: 1,
      profile: {},
      preferences: [],
      facts: [],
      projectNotes: [],
    });
    expect(memory.updatedAt).toEqual(expect.any(String));
  });

  it("creates repo-scoped project notes", async () => {
    const memory = await loadMemory(workspace);
    const record = rememberProjectNote(memory, workspace, "User prefers focused TypeScript changes.");

    expect(record).toMatchObject({
      id: expect.stringMatching(/^mem_[a-f0-9]{8}$/),
      kind: "project_note",
      repoPath: workspace,
      text: "User prefers focused TypeScript changes.",
      source: "manual",
      confidence: 1,
      importance: 3,
      tags: ["manual"],
    });
    expect(memory.projectNotes).toEqual([record]);
  });

  it("round-trips saved memory through the filesystem", async () => {
    const memory = await loadMemory(workspace);
    const record = rememberProjectNote(memory, workspace, "Persist this note.");

    await saveMemory(workspace, memory);

    const reloaded = await loadMemory(workspace);
    expect(reloaded.projectNotes).toEqual([record]);
  });

  it("filters workspace-specific memories while keeping global facts and preferences", () => {
    const memory = createMemoryStore();

    memory.preferences.push({
      id: "mem_global_pref",
      kind: "preference",
      scope: "global",
      text: "User likes concise answers.",
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
      source: "manual",
      confidence: 1,
      importance: 4,
      tags: ["style"],
    });
    memory.projectNotes.push({
      id: "mem_current_project",
      kind: "project_note",
      repoPath: workspace,
      text: "Current project uses pi-ai.",
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
      source: "manual",
      confidence: 1,
      importance: 3,
      tags: ["project"],
    });
    memory.projectNotes.push({
      id: "mem_other_project",
      kind: "project_note",
      repoPath: "/tmp/other-project",
      text: "Other project note.",
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
      source: "manual",
      confidence: 1,
      importance: 3,
      tags: ["project"],
    });
    memory.facts.push({
      id: "mem_fact",
      kind: "fact",
      subject: "MiniMax",
      text: "MiniMax is the configured provider.",
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
      source: "manual",
      confidence: 1,
      importance: 3,
      tags: ["provider"],
    });

    expect(listMemories(memory, workspace).map((record) => record.id)).toEqual([
      "mem_global_pref",
      "mem_fact",
      "mem_current_project",
    ]);
    expect(formatMemoriesForDisplay(memory, workspace)).toContain("mem_current_project (project_note)");
    expect(formatMemoriesForDisplay(memory, workspace)).not.toContain("mem_other_project");
    expect(formatMemoriesForPrompt(memory, workspace)).toContain("Relevant saved memory:");
    expect(formatMemoriesForPrompt(memory, workspace)).toContain("- [mem_fact] MiniMax is the configured provider.");
  });

  it("forgets matching memories by id", () => {
    const memory = createMemoryStore();
    const record = rememberProjectNote(memory, workspace, "Temporary memory.");

    expect(forgetMemory(memory, record.id)).toBe(true);
    expect(memory.projectNotes).toEqual([]);
    expect(forgetMemory(memory, record.id)).toBe(false);
  });

  it("formats empty memory for display and prompt", () => {
    const memory = createMemoryStore();

    expect(formatMemoriesForDisplay(memory, workspace)).toBe("No saved memories for this workspace.");
    expect(formatMemoriesForPrompt(memory, workspace)).toBe("");
  });
});

function createMemoryStore(): MemoryStore {
  return {
    version: 1,
    updatedAt: "2026-07-22T00:00:00.000Z",
    profile: {},
    preferences: [],
    facts: [],
    projectNotes: [],
  };
}
