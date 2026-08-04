# Build first with `bun run build`, then render with `vhs docs/demo/setup.tape`.
# The demo uses the committed fixture below, never a real user's home folder.
Require node
Output docs/assets/setup.gif

Set Shell "bash"
Set FontSize 24
Set Width 1060
Set Height 600
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
Type `export HOME="$PWD/home"`
Enter
Type `dotagents() { node ../../dist/cli.js "$@"; }`
Enter
Type "clear"
Enter
Show

Type "dotagents setup"
Enter
Wait+Screen@15s /Create this library now\? \[y\/N\]/
Type "n"
Enter
Wait+Screen@15s /Nothing changed\./
Sleep 2s
