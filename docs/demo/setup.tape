# Build first with `bun run build`, then render with `vhs docs/demo/setup.tape`.
# The command runs against the fixture above, never a real user's home folder.
Output docs/assets/setup.gif

Set FontSize 22
Set Width 1060
Set Height 600
Set Theme "Dracula"
Set TypingSpeed 35ms
Set CursorBlink false
Set Margin 24
Set MarginFill "#111318"
Set WindowBar Colorful

Hide
Type "cd docs/demo"
Enter
Type `dotagents() { node ../../dist/cli.js "$@"; }`
Enter
Type "clear"
Enter
Show

Type "dotagents setup home/.agents --home home --dry-run"
Enter
Sleep 4s
