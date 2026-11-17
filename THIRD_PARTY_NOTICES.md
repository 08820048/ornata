# Third-party notices

Ornata is released under the MIT License (see `LICENSE`). It began as a fork of
[markd](https://github.com/starc007/markd) by Saurabh, also MIT; his copyright
notice is kept in `LICENSE`.

Besides the packages listed in `package.json` and `src-tauri/Cargo.toml`, which
keep their own licenses, the following works are included in or adapted into
this repository.

## Code

### quiet-md — library view geometry and motion

The library tab's card geometry, shadows and spring parameters
(`src/lib/library.ts`, `src/components/library/`) are ported from quiet-md's
home grid (`src/home.rs`, `src/home_folder.rs`).

Source: https://github.com/s1dashu/quiet-md

```
MIT License

Copyright (c) 2026 s1dashu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### vscode-neovide-cursor — animated caret

The caret's spring, corner ranking and per-corner timing
(`src/components/editor/cursorMotion.ts`) follow vscode-neovide-cursor.

Source: https://github.com/LengineerC/vscode-neovide-cursor

```
MIT License

Copyright (c) 2025 LengineerC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Lobe Icons — agent logos

The agent logos in `src/components/projects/agentLogoData.ts` are copied from
`@lobehub/icons-static-svg` 1.101.0. The logos themselves are trademarks of
their owners and are used only to identify those agents.

Source: https://github.com/lobehub/lobe-icons

```
MIT License

Copyright (c) 2023 LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Fonts

All three are licensed under the SIL Open Font License 1.1.

| Font | Copyright | License text |
| --- | --- | --- |
| Cascadia Code | Microsoft Corporation | `src/assets/fonts/CascadiaCode-OFL.txt` |
| Fira Code | The Fira Code Project Authors | `src/assets/fonts/FiraCode-OFL.txt` |
| Inter | The Inter Project Authors | shipped in `@fontsource-variable/inter` |

## Name and icon

The MIT License covers the code. The Ornata name, the app icon and the mascot
artwork are not covered by it; see `TRADEMARKS.md`.
