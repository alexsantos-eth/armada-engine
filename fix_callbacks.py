import re

with open('src/core/engine/machines/callbacks.test.ts', 'r') as f:
    content = f.read()

content = content.replace('import type { GameItem, GameShip } from "../../types/entities";', 'import type { GameItem } from "../../types/entities";')
content = content.replace('result: {\n          success: true,\n          shots: [{ x: 0, y: 0, hit: false, collected: true, itemFullyCollected: true, itemId: 0, executed: true }],\n        },', 'result: {\n          success: true,\n          shots: [{ x: 0, y: 0, hit: false, collected: true, itemFullyCollected: true, itemId: 0, executed: true }],\n        } as unknown as ShotPatternResult,')
content = content.replace('result: { success: true, shots: [] },', 'result: { success: true, shots: [] } as unknown as ShotPatternResult,')
content = content.replace('result: {\n          success: true,\n          shots: [\n            { x: 5, y: 5, hit: true, executed: true, patternId: 2, shipId: 1 },\n            { x: 6, y: 5, hit: false, executed: true, patternId: 2 },\n          ],\n        },', 'result: {\n          success: true,\n          shots: [\n            { x: 5, y: 5, hit: true, executed: true, patternId: 2, shipId: 1 },\n            { x: 6, y: 5, hit: false, executed: true, patternId: 2 },\n          ],\n        } as unknown as ShotPatternResult,')
content = content.replace('winner: "PLAYER",', 'winner: "player",')
content = content.replace('winner: "ENEMY",', 'winner: "enemy",')
content = re.sub(r'(currentTurn: "PLAYER_TURN",\n\s+};)', r'\1 as unknown as ItemUseCyclePayload;', content)
content = re.sub(r'(shipId: 3,\n\s+};)', r'\1 as unknown as ItemUseCyclePayload;', content)
content = re.sub(r'(currentTurn: "ENEMY_TURN",\n\s+\});', r'\1 as unknown as ItemUseCyclePayload);', content)
content = re.sub(r'(turnToggled: true,\n\s+\});', r'\1 as unknown as ItemUseCyclePayload);', content)
content = re.sub(r'(winner: "enemy",\n\s+\});', r'\1 as unknown as ItemUseCyclePayload);', content)

with open('src/core/engine/machines/callbacks.test.ts', 'w') as f:
    f.write(content)
