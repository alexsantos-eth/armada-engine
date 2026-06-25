import re

# constants.test.ts
with open('src/core/tools/constants.test.ts', 'r') as f:
    content = f.read()
content = content.replace('items as any', 'items as unknown as import("../types/entities").GameEntity[]')
with open('src/core/tools/constants.test.ts', 'w') as f:
    f.write(content)

# item.test.ts
with open('src/core/engine/item.test.ts', 'r') as f:
    content = f.read()
content = content.replace('(ctx as any).item', '(ctx as unknown as Record<string, unknown>).item')
with open('src/core/engine/item.test.ts', 'w') as f:
    f.write(content)

# perspective.test.ts
with open('src/core/engine/perspective.test.ts', 'r') as f:
    content = f.read()
content = content.replace('undefined as any', 'undefined as unknown as import("../types/entities").GameObstacle[]')
with open('src/core/engine/perspective.test.ts', 'w') as f:
    f.write(content)

