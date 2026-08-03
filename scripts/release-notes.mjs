function headingVersion(line) {
  if (/^##\s+Unreleased\s*$/i.test(line)) return "unreleased";
  const match = /^##\s+.*?\[?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]?/.exec(line);
  return match?.[1] ?? null;
}

export function extractReleaseNotes(changelog, version, options = {}) {
  const lines = changelog.replaceAll("\r\n", "\n").split("\n");
  const requested = options.allowUnreleased ? "unreleased" : version;
  const start = lines.findIndex((line) => headingVersion(line) === requested);
  if (start < 0) {
    const label = requested === "unreleased" ? "Unreleased" : version;
    throw new Error(`CHANGELOG.md has no release section for ${label}`);
  }
  const endOffset = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  const section = lines.slice(start, end).join("\n").trim();
  if (!section.includes("\n")) throw new Error(`Release section for ${requested} is empty`);
  return `${section}\n`;
}
