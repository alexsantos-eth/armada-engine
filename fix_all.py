import re
import glob

for f in glob.glob('src/core/**/*.test.ts', recursive=True):
    with open(f, 'r') as file:
        content = file.read()
    
    # Remove hits: [...] or hits: [false, false] or hits: []
    content = re.sub(r'hits:\s*\[.*?\],?\s*', '', content)
    # Remove hp: [number]
    content = re.sub(r'hp:\s*\d+,?\s*', '', content)
    
    with open(f, 'w') as file:
        file.write(content)
