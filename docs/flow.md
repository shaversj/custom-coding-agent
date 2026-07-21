# Agent Flow

```mermaid
flowchart TD
  A["Start: npm run agent"] --> B["Load .env"]
  B --> C{"MINIMAX_API_KEY set?"}
  C -- No --> D["Show setup error and exit"]
  C -- Yes --> E["Load .agent/memory.json"]

  E --> F["Create Pi built-in model registry"]
  F --> G["Select provider/model<br/>default: minimax / MiniMax-M2.7"]
  G --> H{"Prompt passed as CLI arg?"}

  H -- Yes --> I["One-shot input"]
  H -- No --> J["Interactive REPL<br/>type questions at > prompt"]

  J --> K{"User enters /exit or /quit?"}
  K -- Yes --> L["Close prompt and exit"]
  K -- No --> M["Handle input"]

  I --> M
  M --> N{"Memory command?"}
  N -- "/remember" --> O["Save project note"]
  N -- "/memories" --> P["Print saved memories"]
  N -- "/forget" --> Q["Delete memory by id"]
  O --> AG{"Interactive mode?"}
  P --> AG
  Q --> AG
  AG -- Yes --> J
  AG -- No --> L

  N -- No --> R["Add user message to context"]
  R --> S["Inject relevant saved memories<br/>into system prompt"]
  S --> T["Call MiniMax through pi-ai"]
  T --> U["Print assistant text"]

  U --> V{"Assistant requested tools?"}
  V -- No --> W{"Interactive mode?"}
  W -- Yes --> J
  W -- No --> L

  V -- Yes --> X["Run requested local tool"]
  X --> Y{"Which tool?"}
  Y --> Z["list_files"]
  Y --> AA["read_file"]
  Y --> AB["write_file"]
  Y --> AC["run_shell"]

  Z --> AD["Append tool result to context"]
  AA --> AD
  AB --> AD
  AC --> AD

  AD --> AE{"Reached AGENT_MAX_TURNS?"}
  AE -- No --> T
  AE -- Yes --> AF["Stop and suggest increasing AGENT_MAX_TURNS"]
```

The CLI keeps conversation history in `context.messages`, loads explicit saved
memory from `.agent/memory.json`, sends the current context to MiniMax through
`pi-ai`, executes any requested local tools, feeds those results back into the
context, and repeats until MiniMax returns a final text response.
