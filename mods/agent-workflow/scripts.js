// The shell side of the panel. No Herdr imports, so tests and the smoke check
// run these exact strings.
//
// Each script runs through the person's login shell (`$SHELL -lic`), so every
// machine finds engram, codegraph and context-mode on its own PATH (Homebrew,
// linuxbrew, mise, fnm, ...) and nothing here names a path. Each section of
// output starts with an `@@name` line; what the shell prints before the first
// one (a greeting, a warning) is ignored.

// argv for exec("/bin/sh", argv): /bin/sh hands the script and its arguments
// to the login shell as positional parameters, so nothing is quoted by hand.
export function shellArgs(script, ...args) {
  const params = args.map((_, i) => `"$${i + 2}"`).join(" ");
  return ["-c", `exec "\${SHELL:-/bin/sh}" -lic "$1" workflow ${params} </dev/null`, "sh", script, ...args];
}

// $1: the pane's folder. The engram calls run one after another: in parallel
// they contend for its SQLite lock, and doctor then reports that contention.
export const STATUS_SCRIPT = `cd "$1" 2>/dev/null || { echo '@@error'; echo "No folder $1"; exit 0; }
R=$(git rev-parse --show-toplevel 2>/dev/null || pwd); P=$(basename "$R"); cd "$R"
echo '@@root'; echo "$R"
echo '@@stats'; engram stats --project "$P" 2>&1
echo '@@context'; engram context "$P" 2>&1
echo '@@doctor'; engram doctor --json --project "$P" 2>&1
echo '@@ctx'; context-mode statusline </dev/null 2>/dev/null; echo
echo '@@graph'; codegraph status --json . 2>&1
echo '@@end'`;

// $1: folder, $2: engram project, $3: exact title. `engram context` prints no
// ids, so the id is found by searching for the exact title (newest first),
// then the full text comes from engram's MCP server over stdio.
export const OBSERVATION_SCRIPT = `cd "$1" 2>/dev/null || cd
ID=$(engram search "$3" --project "$2" --limit 10 2>/dev/null | awk -v t="$3" '
  /^\\[[0-9]+\\] #[0-9]+ \\(/ {
    line = $0; sub(/^\\[[0-9]+\\] #/, "", line)
    id = line; sub(/ .*/, "", id)
    title = line; sub(/^[0-9]+ \\([^)]*\\) — /, "", title)
    if (title == t) { print id; exit }
  }')
[ -n "$ID" ] || { echo '@@error'; echo "No observation titled this in $2."; exit 0; }
echo '@@id'; echo "$ID"
echo '@@body'
printf '%s\\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"herdr-workflow","version":"1"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' "{\\"jsonrpc\\":\\"2.0\\",\\"id\\":2,\\"method\\":\\"tools/call\\",\\"params\\":{\\"name\\":\\"mem_get_observation\\",\\"arguments\\":{\\"id\\":$ID}}}" | engram mcp --tools=agent 2>/dev/null | tail -1
echo '@@end'`;
