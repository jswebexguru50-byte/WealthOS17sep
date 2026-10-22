import json
import re

with open('src/mcp/registry/canonicalRegistry.json', 'r', encoding='utf-8') as f:
    canon_list = json.load(f)

canon_dict = {t['name']: t for t in canon_list}

with open('src/mcp/registry/toolRegistry.ts', 'r', encoding='utf-8') as f:
    ts_content = f.read()

# Parse toolRegistry.ts objects
pattern = r"name:\s*'([^']+)',\s*plane:\s*'([^']+)',\s*description:\s*'([^']*)'"
matches = re.findall(pattern, ts_content)

print(f"Total in canonical: {len(canon_list)}")
print(f"Total parsed in TS: {len(matches)}")

# Let's group canonical by plane
canon_by_plane = {}
for t in canon_list:
    p = t.get('plane')
    canon_by_plane.setdefault(p, []).append(t['name'])

for p, names in canon_by_plane.items():
    print(f"Canonical Plane {p} count: {len(names)}")

ts_by_plane = {}
for name, plane, desc in matches:
    ts_by_plane.setdefault(plane, []).append(name)

for p, names in ts_by_plane.items():
    print(f"TS Plane {p} count: {len(names)}")
