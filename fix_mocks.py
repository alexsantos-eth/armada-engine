import re
import glob

files = [
    'src/core/manager/initializer.test.ts',
    'src/core/tools/items.test.ts',
    'src/core/tools/obstacles.test.ts',
    'src/core/tools/ships.test.ts'
]

for fpath in files:
    with open(fpath, 'r') as f:
        content = f.read()
    
    # Remove hits: <number> and hp: <number> from object literals
    content = re.sub(r'hits:\s*\d+,\s*', '', content)
    content = re.sub(r'hp:\s*\d+,\s*', '', content)
    
    with open(fpath, 'w') as f:
        f.write(content)
