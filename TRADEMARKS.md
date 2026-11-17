# Name and icon

The Ornata source code is MIT-licensed: use it, change it, ship it, sell it.
The **name "Ornata"**, the **app icon** and the **mascot artwork** (the files
in `src-tauri/icons/`, `public/ornata-icon.png` and the icons and images under
`site/app/` and `site/public/`) are not part of that license.

You may:

- build and run Ornata from source for yourself, unchanged or modified;
- say that your project is based on, forked from or compatible with Ornata;
- link to ornata.app and use the name to refer to this project.

Please don't, without asking first:

- publish or sell a build, modified or not, under the name Ornata or with its
  icon or mascot, or under a name or icon that could be mistaken for them;
- suggest that your fork or service is official or endorsed by the project.

If you ship a fork, give it its own name and icon (`productName` and
`identifier` in `src-tauri/tauri.conf.json`, the files in `src-tauri/icons/`)
and point its updater at your own server (`plugins.updater` in the same file):
builds that keep the stock settings would try to install official updates.

Questions: open an issue on the repository.
