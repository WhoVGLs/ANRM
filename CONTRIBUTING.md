# Contributing

Thanks for helping improve ANRM.

## Development setup

1. Install Node.js and npm.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Compile the extension:

   ```bash
   npm run compile
   ```

4. Press `F5` in VS Code to launch the Extension Development Host.

## Pull requests

1. Fork this repository.
2. Create a focused branch for your change.
3. Make the change and run `npm run compile`.
4. Open a Pull Request with a clear description and testing notes.

Please keep changes focused, avoid committing generated `out/` or `.vsix` files, and do not include secrets or personal credentials.

Direct pushes to the default branch are reserved for project maintainers.
