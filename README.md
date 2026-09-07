# ANRM

**ANRM Not Runtime Monitor** is a compact Unix VS Code monitor for a running C++ process, with CPU, memory, NVIDIA GPU, VRAM, trend charts, and diagnostics.

### Changes in 1.0 Release 
- Slimmer metric cards and charts.
- A dark grid chart inspired by Task Manager, but more modern.
- Monitor appears in its own `ANRM` Activity Bar tab.
- Added `ANRM: Focus Sidebar View`.
- Added Marketplace packaging metadata and `.vscodeignore` for cleaner VSIX packages.

The monitor is a Webview view in the `ANRM` Activity Bar container, not an editor tab or Bottom Panel.

Run:
```bash
npm install
npm run compile
```
Then press F5 in the extension project.

Use `Ctrl+Shift+P` -> `ANRM: Start Monitoring`.

Unix-like systems with `/proc` are required because process metrics are read from that filesystem. NVIDIA GPU and VRAM metrics are available when `nvidia-smi` is installed and accessible.

## Contributing

This project is open source. Anyone can fork it, improve the code, and submit a Pull Request. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development and review workflow.

I hope you like it and useful