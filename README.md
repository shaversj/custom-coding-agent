# Custom Coding Agent

A tiny coding-agent CLI built on `@earendil-works/pi-ai` and MiniMax.

See [docs/flow.md](docs/flow.md) for a diagram of the agent loop.

## Setup

```bash
npm install
cp .env.example .env
```

Add your MiniMax key to `.env`:

```bash
MINIMAX_API_KEY=your-key
```

## Run

Start an interactive chat:

```bash
npm run agent
```

Then type questions or coding tasks at the prompt. Use `/exit` to quit.

You can still run a single prompt:

```bash
npm run agent -- "List the files in this repo"
```

By default the agent uses Pi's built-in `minimax` provider and `MiniMax-M2.7`.
Override either with:

```bash
MINIMAX_PROVIDER=minimax-cn MINIMAX_MODEL=MiniMax-M2.7 npm run agent -- "Inspect package.json"
```

## Tools

The agent exposes a deliberately small coding surface:

- `list_files` lists files under the current workspace.
- `read_file` reads a workspace file.
- `write_file` writes a workspace file.
- `run_shell` runs a command in the workspace.

The workspace is locked to the directory where you run the CLI.
