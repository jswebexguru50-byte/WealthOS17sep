import json
import re

with open('src/mcp/registry/canonicalRegistry.json', 'r', encoding='utf-8') as f:
    canon = json.load(f)

if isinstance(canon, dict):
    if 'tools' in canon:
        canon_tools = {t['name']: t for t in canon['tools']}
    else:
        canon_tools = canon
else:
    canon_tools = {t['name']: t for t in canon}

with open('src/mcp/registry/toolRegistry.ts', 'r', encoding='utf-8') as f:
    ts_content = f.read()

ts_tool_matches = re.findall(r"name:\s*'([^']+)'", ts_content)
ts_tool_names = list(dict.fromkeys(ts_tool_matches))

print(f"Canonical registry count: {len(canon_tools)}")
print(f"TypeScript toolRegistry count: {len(ts_tool_names)}")

ts_set = set(ts_tool_names)
canon_set = set(canon_tools.keys())

diff_ts_extra = sorted(list(ts_set - canon_set))
diff_canon_extra = sorted(list(canon_set - ts_set))

print(f"\nIn TS toolRegistry but NOT in canonicalRegistry ({len(diff_ts_extra)}):")
for t in diff_ts_extra:
    print(f"  + {t}")

print(f"\nIn canonicalRegistry but NOT in TS toolRegistry ({len(diff_canon_extra)}):")
for t in diff_canon_extra:
    print(f"  - {t}")
