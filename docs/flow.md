# Agent Flow

```mermaid
flowchart TD
  A["Start: npm run agent"] --> B["Load .env"]
  B --> C{"MINIMAX_API_KEY set?"}
  C -- No --> D["Show setup error and exit"]
  C -- Yes --> E["Create Pi built-in model registry"]

  E --> F["Select provider/model<br/>default: minimax / MiniMax-M2.7"]
  F --> G{"Prompt passed as CLI arg?"}

  G -- Yes --> H["One-shot prompt"]
  G -- No --> I["Interactive REPL<br/>type questions at > prompt"]

  I --> J{"User enters /exit or /quit?"}
  J -- Yes --> K["Close prompt and exit"]
  J -- No --> L["Add user message to context"]

  H --> L
  L --> M["Call MiniMax through pi-ai"]
  M --> N["Print assistant text"]

  N --> O{"Assistant requested tools?"}
  O -- No --> P{"Interactive mode?"}
  P -- Yes --> I
  P -- No --> K

  O -- Yes --> Q["Run requested local tool"]
  Q --> R{"Which tool?"}
  R --> S["list_files"]
  R --> T["read_file"]
  R --> U["write_file"]
  R --> V["run_shell"]

  S --> W["Append tool result to context"]
  T --> W
  U --> W
  V --> W

  W --> X{"Reached AGENT_MAX_TURNS?"}
  X -- No --> M
  X -- Yes --> Y["Stop and suggest increasing AGENT_MAX_TURNS"]
```

The CLI keeps conversation history in `context.messages`, sends it to MiniMax
through `pi-ai`, executes any requested local tools, feeds those results back
into the context, and repeats until MiniMax returns a final text response.
