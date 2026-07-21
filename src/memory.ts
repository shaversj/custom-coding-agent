import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type MemoryStore = {
  version: 1;
  updatedAt: string;
  profile: UserProfile;
  preferences: PreferenceMemory[];
  facts: FactMemory[];
  projectNotes: ProjectMemory[];
};

export type UserProfile = {
  name?: string;
  timezone?: string;
};

type BaseMemory = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  source: "user" | "assistant" | "tool" | "manual";
  confidence: number;
  importance: 1 | 2 | 3 | 4 | 5;
  lastUsedAt?: string;
  tags: string[];
};

export type PreferenceMemory = BaseMemory & {
  kind: "preference";
  scope: "global" | "repo" | "session";
  repoPath?: string;
};

export type FactMemory = BaseMemory & {
  kind: "fact";
  subject?: string;
};

export type ProjectMemory = BaseMemory & {
  kind: "project_note";
  repoPath: string;
  files?: string[];
};

export type MemoryRecord = PreferenceMemory | FactMemory | ProjectMemory;

const memoryPath = ".agent/memory.json";

export async function loadMemory(workspace: string): Promise<MemoryStore> {
  try {
    const raw = await readFile(getMemoryPath(workspace), "utf8");
    const parsed = JSON.parse(raw) as MemoryStore;
    return {
      ...createEmptyMemoryStore(),
      ...parsed,
      profile: parsed.profile ?? {},
      preferences: parsed.preferences ?? [],
      facts: parsed.facts ?? [],
      projectNotes: parsed.projectNotes ?? [],
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return createEmptyMemoryStore();
    }

    throw error;
  }
}

export async function saveMemory(workspace: string, memory: MemoryStore) {
  const filePath = getMemoryPath(workspace);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
}

export function rememberProjectNote(memory: MemoryStore, workspace: string, text: string): ProjectMemory {
  const now = new Date().toISOString();
  const record: ProjectMemory = {
    id: `mem_${randomUUID().slice(0, 8)}`,
    kind: "project_note",
    repoPath: workspace,
    text,
    createdAt: now,
    updatedAt: now,
    source: "manual",
    confidence: 1,
    importance: 3,
    tags: ["manual"],
  };

  memory.projectNotes.push(record);
  memory.updatedAt = now;
  return record;
}

export function forgetMemory(memory: MemoryStore, id: string) {
  const before = countMemories(memory);
  memory.preferences = memory.preferences.filter((record) => record.id !== id);
  memory.facts = memory.facts.filter((record) => record.id !== id);
  memory.projectNotes = memory.projectNotes.filter((record) => record.id !== id);

  const removed = before !== countMemories(memory);
  if (removed) {
    memory.updatedAt = new Date().toISOString();
  }

  return removed;
}

export function listMemories(memory: MemoryStore, workspace: string) {
  return getAllMemories(memory).filter((record) => isRelevantMemory(record, workspace));
}

export function formatMemoriesForPrompt(memory: MemoryStore, workspace: string) {
  const records = listMemories(memory, workspace);
  if (records.length === 0) {
    return "";
  }

  const lines = records.map((record) => {
    return `- [${record.id}] ${record.text}`;
  });

  return ["Relevant saved memory:", ...lines].join("\n");
}

export function formatMemoriesForDisplay(memory: MemoryStore, workspace: string) {
  const records = listMemories(memory, workspace);
  if (records.length === 0) {
    return "No saved memories for this workspace.";
  }

  return records.map((record) => `${record.id} (${record.kind}): ${record.text}`).join("\n");
}

function createEmptyMemoryStore(): MemoryStore {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    profile: {},
    preferences: [],
    facts: [],
    projectNotes: [],
  };
}

function getMemoryPath(workspace: string) {
  return path.join(workspace, memoryPath);
}

function getAllMemories(memory: MemoryStore): MemoryRecord[] {
  return [...memory.preferences, ...memory.facts, ...memory.projectNotes];
}

function isRelevantMemory(record: MemoryRecord, workspace: string) {
  if (record.kind === "project_note") {
    return record.repoPath === workspace;
  }

  if (record.kind === "preference" && record.scope === "repo") {
    return record.repoPath === workspace;
  }

  return true;
}

function countMemories(memory: MemoryStore) {
  return memory.preferences.length + memory.facts.length + memory.projectNotes.length;
}
