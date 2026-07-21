import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import process from "node:process";

import "dotenv/config";
import { Type, type Context, type Message, type Tool } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

import {
  forgetMemory,
  formatMemoriesForDisplay,
  formatMemoriesForPrompt,
  loadMemory,
  rememberProjectNote,
  saveMemory,
} from "./memory.js";

type TextToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type ToolCallBlock = Extract<Message["content"][number], { type: "toolCall" }>;

const workspace = process.cwd();
const provider = process.env.MINIMAX_PROVIDER ?? "minimax";
const modelId = process.env.MINIMAX_MODEL ?? "MiniMax-M2.7";
const maxTurns = Number(process.env.AGENT_MAX_TURNS ?? 8);

const initialPrompt = process.argv.slice(2).join(" ").trim();
const memory = await loadMemory(workspace);

if (!process.env.MINIMAX_API_KEY) {
  console.error("Missing MINIMAX_API_KEY. Copy .env.example to .env and add your MiniMax key.");
  process.exit(1);
}

const tools: Tool[] = [
  {
    name: "list_files",
    description: "List files and directories below a relative workspace path.",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Relative path inside the workspace. Defaults to ." })),
    }),
  },
  {
    name: "read_file",
    description: "Read a UTF-8 text file from the workspace.",
    parameters: Type.Object({
      path: Type.String({ description: "Relative file path inside the workspace." }),
    }),
  },
  {
    name: "write_file",
    description: "Write a UTF-8 text file inside the workspace, creating parent directories when needed.",
    parameters: Type.Object({
      path: Type.String({ description: "Relative file path inside the workspace." }),
      content: Type.String({ description: "The complete file content to write." }),
    }),
  },
  {
    name: "run_shell",
    description: "Run a non-interactive shell command in the workspace.",
    parameters: Type.Object({
      command: Type.String({ description: "Command to run." }),
    }),
  },
];

const context: Context = {
  systemPrompt: buildSystemPrompt(),
  messages: [],
  tools,
};

const models = builtinModels();
const model = models.getModel(provider, modelId);

if (!model) {
  console.error(`Could not find Pi model ${provider}/${modelId}.`);
  process.exit(1);
}

const selectedModel = model;

if (initialPrompt) {
  await handleInput(initialPrompt);
} else {
  await startRepl();
}

async function startRepl() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`MiniMax coding agent ready (${provider}/${modelId}).`);
  console.log("Type a question or task. Use /remember, /memories, /forget, or /exit.\n");
  const showPrompt = Boolean(process.stdin.isTTY);
  if (showPrompt) {
    rl.setPrompt("> ");
    rl.prompt();
  }

  try {
    for await (const line of rl) {
      const question = line.trim();

      if (question === "/exit" || question === "/quit") {
        break;
      }

      if (!question) {
        continue;
      }

      await handleInput(question);
      console.log("");
      if (showPrompt) {
        rl.prompt();
      }
    }
  } finally {
    rl.close();
  }
}

async function handleInput(input: string) {
  if (await handleMemoryCommand(input)) {
    return;
  }

  await askAgent(input);
}

async function handleMemoryCommand(input: string) {
  if (input === "/memories") {
    console.log(formatMemoriesForDisplay(memory, workspace));
    return true;
  }

  if (input.startsWith("/remember ")) {
    const text = input.slice("/remember ".length).trim();
    if (!text) {
      console.log('Usage: /remember User prefers small, focused changes.');
      return true;
    }

    const record = rememberProjectNote(memory, workspace, text);
    await saveMemory(workspace, memory);
    updateSystemPrompt();
    console.log(`Saved memory ${record.id}.`);
    return true;
  }

  if (input.startsWith("/forget ")) {
    const id = input.slice("/forget ".length).trim();
    if (!id) {
      console.log("Usage: /forget mem_12345678");
      return true;
    }

    const removed = forgetMemory(memory, id);
    if (removed) {
      await saveMemory(workspace, memory);
      updateSystemPrompt();
      console.log(`Forgot memory ${id}.`);
    } else {
      console.log(`No memory found for ${id}.`);
    }

    return true;
  }

  return false;
}

async function askAgent(prompt: string) {
  context.messages.push({
    role: "user",
    content: prompt,
    timestamp: Date.now(),
  });

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const response = await models.complete(selectedModel, context);
    context.messages.push(response);
    printAssistantText(response);

    const toolCalls = response.content.filter(isToolCallBlock);
    if (toolCalls.length === 0) {
      return;
    }

    for (const toolCall of toolCalls) {
      console.log(`\n[tool] ${toolCall.name} ${JSON.stringify(toolCall.arguments)}`);
      const result = await runTool(toolCall);

      if (result.isError) {
        console.error(result.content[0]?.text ?? "Tool failed.");
      } else {
        console.log(result.content[0]?.text ?? "");
      }

      context.messages.push({
        role: "toolResult",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: result.content,
        isError: result.isError ?? false,
        timestamp: Date.now(),
      });
    }
  }

  console.error(`Stopped after ${maxTurns} tool turns. Increase AGENT_MAX_TURNS if needed.`);
}

function updateSystemPrompt() {
  context.systemPrompt = buildSystemPrompt();
}

function buildSystemPrompt() {
  return [
    "You are a very small coding agent.",
    `Workspace: ${workspace}`,
    "Use tools to inspect files before changing them.",
    "Keep changes minimal, explain what you changed, and mention any commands you ran.",
    "Use saved memory as durable user-approved context, but prefer the current user request if it conflicts.",
    formatMemoriesForPrompt(memory, workspace),
  ]
    .filter(Boolean)
    .join("\n");
}

function isToolCallBlock(block: Message["content"][number]): block is ToolCallBlock {
  return typeof block !== "string" && block.type === "toolCall";
}

function printAssistantText(message: Message) {
  for (const block of message.content) {
    if (typeof block === "string") {
      process.stdout.write(block);
      if (!block.endsWith("\n")) {
        process.stdout.write("\n");
      }
    } else if (block.type === "text") {
      process.stdout.write(block.text);
      if (!block.text.endsWith("\n")) {
        process.stdout.write("\n");
      }
    }
  }
}

async function runTool(toolCall: ToolCallBlock): Promise<TextToolResult> {
  try {
    switch (toolCall.name) {
      case "list_files": {
        const input = toolCall.arguments as { path?: string };
        const directory = resolveWorkspacePath(input.path ?? ".");
        const entries = await readdir(directory, { withFileTypes: true });
        const lines = entries
          .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`)
          .sort((a, b) => a.localeCompare(b));

        return text(lines.join("\n") || "(empty)");
      }

      case "read_file": {
        const input = toolCall.arguments as { path: string };
        return text(await readFile(resolveWorkspacePath(input.path), "utf8"));
      }

      case "write_file": {
        const input = toolCall.arguments as { path: string; content: string };
        const filePath = resolveWorkspacePath(input.path);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, input.content, "utf8");
        return text(`Wrote ${path.relative(workspace, filePath)}`);
      }

      case "run_shell": {
        const input = toolCall.arguments as { command: string };
        return text(await runShell(input.command));
      }

      default:
        return text(`Unknown tool: ${toolCall.name}`, true);
    }
  } catch (error) {
    return text(error instanceof Error ? error.message : String(error), true);
  }
}

function resolveWorkspacePath(relativePath: string) {
  const fullPath = path.resolve(workspace, relativePath);
  const relative = path.relative(workspace, fullPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }

  return fullPath;
}

async function runShell(command: string) {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, {
      cwd: workspace,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");

      if (code === 0) {
        resolvePromise(output || "(command completed)");
      } else {
        reject(new Error(output || `Command failed with exit code ${code}`));
      }
    });
  });
}

function text(textValue: string, isError = false): TextToolResult {
  return {
    content: [{ type: "text", text: textValue }],
    isError,
  };
}
