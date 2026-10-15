# Repository structure

This directory is the development workspace and Git repository root for the X
Pinned Lists Sidebar extension. Keep files organized by purpose:

```text
extension/    Browser extension code
build/        Build scripts and packaged output, compressed or unpacked
screenshots/  Screenshots captured during development
tests/        Development tests and their fixtures
```

## Directory responsibilities

- **`extension/`** is reserved for the extension itself: `manifest.json`, runtime
  JavaScript, CSS, popup files, and assets required by the installed extension.
  Keep it directly loadable as an unpacked browser extension. Do not put build
  scripts, release archives, development screenshots, or tests here.
- **`build/`** contains all build-related material: packaging/build scripts,
  compressed distributions such as ZIP files, and unpacked distribution folders.
  Generated release packages belong here, not in the repository root or
  `extension/`.
- **`screenshots/`** contains screenshots of development, visual checks, and test
  previews. Tests and other screenshot-producing tools must save images here.
  Runtime images needed by the extension still belong in `extension/`.
- **`tests/`** contains the tests used to check the extension during development,
  along with fixtures and test helpers. Keep generated screenshots in
  `screenshots/` and packaged test/build artifacts in `build/`. Use temporary
  directories for disposable browser profiles.

Repository documentation, including this file and `INSTALL.md`, may remain at
the root. Resolve paths relative to the repository or script location rather
than assuming the caller's current working directory.

## Maintaining this layout

Follow these directory roles when adding, moving, or generating files. When
moving a script or artifact, update its references, test output paths, packaging
inputs, and documented commands together.

## Building future versions

The packaging entrypoint is **`build/package.py`**. From the repository root, run:

```sh
python3 build/package.py
```

It packages the current `extension/` files, root `INSTALL.md`, and preview images
from `screenshots/` into **`build/x-pinned-sidebar.zip`**. It validates referenced
manifest files and checks ZIP integrity. It has no external Python dependencies
and also works from another working directory when invoked by its full path.

After future extension changes, run the relevant development checks, refresh
affected previews in `screenshots/`, and rerun this packaging command before
delivering a new ZIP. Keep the extension version in `extension/manifest.json`
consistent with the release being delivered. Do not recreate a root-level
packaging script or ZIP; the installed development extension remains in
`extension/`.
