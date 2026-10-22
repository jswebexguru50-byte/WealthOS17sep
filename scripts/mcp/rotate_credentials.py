import os
import secrets

env_path = '.env'
lines = []
if os.path.exists(env_path):
    with open(env_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

new_keys = {
    'WEALTHOS_PRODUCT_KEY': 'wos_prod_' + secrets.token_hex(32),
    'WEALTHOS_REVIEW_KEY': 'wos_rev_' + secrets.token_hex(32),
    'WEALTHOS_DEV_KEY': 'wos_dev_' + secrets.token_hex(32),
}

updated_keys = set()
new_lines = []

for line in lines:
    replaced = False
    for k, v in new_keys.items():
        if line.strip().startswith(f'{k}='):
            new_lines.append(f'{k}="{v}"\n')
            updated_keys.add(k)
            replaced = True
            break
    if not replaced:
        new_lines.append(line)

for k, v in new_keys.items():
    if k not in updated_keys:
        new_lines.append(f'{k}="{v}"\n')

with open(env_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

# Verify without printing secret values
with open(env_path, 'r', encoding='utf-8') as f:
    content = f.read()

for k in new_keys:
    assert f'{k}="wos_' in content, f"Missing {k}"

print("CREDENTIAL_ROTATION = PASS")
