# Build first with `bun run build`, then render with `vhs docs/demo/setup.tape`.
# The demo uses the committed fixture below, never a real user's home folder.
Require node
Require cp
Require mktemp
Output docs/assets/setup.gif

Set Shell "bash"
Set FontSize 21
Set Width 1280
Set Height 640
Set Theme "Dracula"
Set TypingSpeed 35ms
Set Framerate 15
Set CursorBlink false
Set Margin 24
Set MarginFill "#111318"
Set WindowBar Colorful

Hide
Type "cd docs/demo"
Enter
Type `export NODE_BIN="$(command -v node)"`
Enter
Type `export PATH="/usr/bin:/bin"`
Enter
Type `export HOME="$(mktemp -d)"`
Enter
Type `cp -R home/. "$HOME"`
Enter
Type `dotagents() { "$NODE_BIN" ../../dist/cli.js "$@"; }`
Enter
Type "clear"
Enter
Show

Type "dotagents setup"
Enter
Wait+Screen@15s /Create this library now\? \[y\/N\]/
Type "y"
Enter
Wait+Screen@15s /Connected .* safely\./
Sleep 2s
