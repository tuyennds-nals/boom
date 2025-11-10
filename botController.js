const { time } = require('console');
const fs = require('fs');

lastActionA = null;
isPreKickA = false;

const TileType = {
  EMPTY: 0,
  BRICK: 2,
  WALL: 1,
};

class BotController {
  playerId = '';
  lastKnownState = {
    map: null,
    players: new Map(),
    bombs: [],
    items: [],
  };

  constructor(playerId) {
    this.playerId = playerId;
    this.lastBombTime = Date.now();
    this.lastPositions = [];
    this.maxPositionHistory = 5;
    this.huntModeTimeout = 10000; // 10 seconds
    const { time } = require('console');
    const fs = require('fs');

    const TileType = {
      EMPTY: 0,
      BRICK: 2,
      WALL: 1,
    };

    class BotController {
      playerId = '';
      lastKnownState = {
        map: null,
        players: new Map(),
        bombs: [],
        items: [],
      };

      constructor(playerId) {
        this.playerId = playerId;
        this.lastBombTime = Date.now();
        this.lastPositions = [];
        this.maxPositionHistory = 5;
        this.huntModeTimeout = 10000; // 10 seconds
        // this.lastAction = null;
        // this.isPreKick = false;
      }

      _handleInitialState(data) {
        this.lastKnownState.map = data.map;

        this.lastKnownState.players.clear();
        if (data.players && Array.isArray(data.players)) {
          data.players.forEach(player => {
            this.lastKnownState.players.set(player.id, player);
          });
        }

        this.lastKnownState.bombs = data.bombs || [];
        this.lastKnownState.items = data.items || [];
      }

      _handleTickDelta(delta) {
        if (delta.destroyedBricks && Array.isArray(delta.destroyedBricks)) {
          delta.destroyedBricks.forEach(brick => {
            if (this.lastKnownState.map && this.lastKnownState.map.tiles) {
              this.lastKnownState.map.tiles[brick.y][brick.x] = TileType.EMPTY;
            }
          });
        }

        if (delta.players && Array.isArray(delta.players)) {
          delta.players.forEach(playerPayload => {
            const existingPlayer = this.lastKnownState.players.get(playerPayload.id);
            if (existingPlayer) {
              const updatedPlayer = this._hydratePlayer(playerPayload, existingPlayer);
              this.lastKnownState.players.set(playerPayload.id, updatedPlayer);
            } else {
              const newPlayer = this._hydratePlayer(playerPayload, {});
              this.lastKnownState.players.set(playerPayload.id, newPlayer);
            }
          });
        }

        if (delta.bombs && Array.isArray(delta.bombs)) {
          this.lastKnownState.bombs = delta.bombs.map(bombPayload => this._hydrateBomb(bombPayload));
        }

        if (delta.items && Array.isArray(delta.items)) {
          this.lastKnownState.items = delta.items.map(itemPayload => this._hydrateItem(itemPayload));
        }
      }

      _hydratePlayer(payload, baseObj) {
        const player = { ...baseObj };

        if (payload.id !== undefined) player.id = payload.id;
        if (payload.n !== undefined) player.name = payload.n;
        if (payload.d !== undefined) player.direction = payload.d;
        if (payload.p !== undefined) {
          player.position = {
            x: payload.p.x / 100.0,
            y: payload.p.y / 100.0,
          };
        }
        if (payload.s !== undefined) player.status = payload.s;
        if (payload.iv !== undefined) player.isInvincible = payload.iv;
        if (payload.ivt !== undefined) player.invincibilityTicksLeft = payload.ivt;
        if (payload.sp !== undefined) player.speed = payload.sp;
        if (payload.bl !== undefined) player.bombLimit = payload.bl;
        if (payload.bp !== undefined) player.bombsPlaced = payload.bp;
        if (payload.pow !== undefined) player.bombPower = payload.pow;
        if (payload.sc !== undefined) player.score = payload.sc;
        if (payload.tid !== undefined) player.teamId = payload.tid;

        return player;
      }

      _hydrateBomb(payload) {
        return {
          id: payload.id,
          ownerId: payload.o,
          position: { x: payload.p.x, y: payload.p.y },
          countdownTicks: payload.c - 2.88,
          power: payload.pow,
          isExplodingSoon: payload.es,
          isMoving: payload.imv,
          kickerId: payload.kid,
          moveDirection: payload.md,
          moveDistanceLeft: payload.mdl,
        };
      }

      _hydrateItem(payload) {
        return {
          id: payload.id,
          type: payload.t,
          position: { x: payload.p.x, y: payload.p.y },
        };
      }

      processGameState(serverData, playerNumber) {
        if (!serverData || !serverData.type) return null;

        try {
          if (serverData.type === 'initial_state') {
            this._handleInitialState(serverData);
          } else if (serverData.type === 'tick_delta') {
            this._handleTickDelta(serverData);
          }

          const players = Array.from(this.lastKnownState.players.values());
          const botState = players.find(p => p.id === this.playerId);

          if (botState.status === 'dead') {
            return this.decideGhostAction();
          } else {
            // console.log('========>serverData', serverData);
            const action = this.decideNextAction(serverData, playerNumber);

            return { type: 'control', data: action };
          }
        } catch (e) {
          console.error(`Error processing server data`, e);
          return null;
        }
      }

      decideGhostAction() {
        // Phân tích game state cho ghost
        const players = Array.from(this.lastKnownState.players.values());
        const myPlayer = players.find(p => p.id === this.playerId);
        const enemies = players.filter(p => p.id !== this.playerId && (myPlayer.teamId !== p.teamId) && p.status === 'alive');
        const items = this.lastKnownState.items || [];
        const map = this.lastKnownState.map;

        if (!map) {
          // Fallback nếu không có map data
          return {
            type: 'control_ghost',
            data: {
              x: 5,
              y: 7,
            },
          };
        }

        // Tìm vị trí ghost hiện tại (có thể cần estimate nếu không có thông tin chính xác)
        const myGhost = players.find(p => p.id === this.playerId);
        let currentGhostPos = { x: 5, y: 7 }; // Default position

        if (myGhost && myGhost.position) {
          currentGhostPos = {
            x: Math.round(myGhost.position.x),
            y: Math.round(myGhost.position.y)
          };
        }

        // Teammates info
        const teammates = players.filter(p => p.id !== this.playerId && p.teamId === myPlayer.teamId);
        const aliveTeammates = teammates.filter(t => t.status === 'alive');
        const dyingTeammates = teammates.filter(t => t.status === 'dying');

        const nearestAliveMate = aliveTeammates.length
          ? aliveTeammates
            .map(t => ({
              ref: t,
              pos: { x: Math.round(t.position.x), y: Math.round(t.position.y) },
              dist: Math.abs(currentGhostPos.x - Math.round(t.position.x)) + Math.abs(currentGhostPos.y - Math.round(t.position.y)),
            }))
            .sort((a, b) => a.dist - b.dist)[0]
          : null;

        const nearestDyingMate = dyingTeammates.length
          ? dyingTeammates
            .map(t => ({
              ref: t,
              pos: { x: Math.round(t.position.x), y: Math.round(t.position.y) },
              dist: Math.abs(currentGhostPos.x - Math.round(t.position.x)) + Math.abs(currentGhostPos.y - Math.round(t.position.y)),
            }))
            .sort((a, b) => a.dist - b.dist)[0]
          : null;

        // Priority 1: Cứu đồng đội đang dying (tiến đến ngay lập tức)
        if (nearestDyingMate) {
          return {
            type: 'control_ghost',
            data: {
              x: nearestDyingMate.pos.x,
              y: nearestDyingMate.pos.y,
            },
          };
        }

        // Priority 2: Tìm enemy gần nhất để ám
        const nearestEnemy = this._findNearestEnemy(currentGhostPos, enemies);

        // Priority 3: Tìm item gần nhất để nhặt
        const nearestItem = this._findNearestItem(currentGhostPos, items);

        // Ràng buộc: Hồn ma không nên cách đồng đội sống > 6 ô (trừ khi đang cứu)
        if (nearestAliveMate && nearestAliveMate.dist > 6) {
          return {
            type: 'control_ghost',
            data: {
              x: nearestAliveMate.pos.x,
              y: nearestAliveMate.pos.y,
            },
          };
        }

        let targetPos = null;

        // 1. Nếu có enemy gần (<=3 ô) → ưu tiên ám enemy
        if (nearestEnemy && nearestEnemy.distance <= 3) {
          // Enemy gần → ưu tiên ám
          targetPos = nearestEnemy.position;
        } else if (nearestItem && nearestItem.distance <= 8 && (!nearestEnemy || nearestEnemy.distance > 4)) {
          // 2. Nếu có item và enemy không quá gần → nhặt item
          targetPos = nearestItem.position;
        } else if (nearestEnemy) {
          // 3. Nếu hết item hoặc item quá xa → ám enemy
          targetPos = nearestEnemy.position;
        } else if (nearestAliveMate) {
          // 4. Không có mục tiêu rõ → di chuyển giữ đội hình với đồng đội
          targetPos = nearestAliveMate.pos;
        } else {
          // Không có mục tiêu → di chuyển random trong khu vực an toàn
          targetPos = this._findRandomSafePosition(map);
        }

        return {
          type: 'control_ghost',
          data: {
            x: targetPos.x,
            y: targetPos.y,
          },
        };
      }

      decideNextAction(serverData, playerNumber) {
        const players = Array.from(this.lastKnownState.players.values());
        const myPlayer = players.find(p => p.id === this.playerId);

        if (!myPlayer || !this.lastKnownState.map) {
          return 'u'; // Default action
        }

        // Initialize AI components
        const gameMap = new GameMap(this.lastKnownState);
        const aiPlayer = new AIPlayer(myPlayer, gameMap, this.playerId);

        // Get decision from AI
        const decision = aiPlayer.update();
        // this.lastAction = decision;
        lastActionA = decision;
        // hồn ma nên đi không quá 6 ô so với đồng đội
        // ưu tiên cứu -> dying
        // ưu tiên ám
        // ưu tiên nhặt

        // nngười -> ưu tiên cứu nếu an toàn
        return decision;
      }

      _findNearestEnemy(currentPos, enemies) {
        if (!enemies || enemies.length === 0) return null;

        let nearest = null;
        let minDistance = Infinity;

        enemies.forEach(enemy => {
          const enemyPos = {
            x: Math.round(enemy.position.x),
            y: Math.round(enemy.position.y)
          };
          const distance = Math.abs(currentPos.x - enemyPos.x) + Math.abs(currentPos.y - enemyPos.y);

          if (distance < minDistance) {
            minDistance = distance;
            nearest = {
              position: enemyPos,
              distance: distance
            };
          }
        });

        return nearest;
      }

      _findNearestItem(currentPos, items) {
        if (!items || items.length === 0) return null;

        let nearest = null;
        let minDistance = Infinity;

        items.forEach(item => {
          const itemPos = {
            x: Math.round(item.position.x),
            y: Math.round(item.position.y)
          };
          const distance = Math.abs(currentPos.x - itemPos.x) + Math.abs(currentPos.y - itemPos.y);

          if (distance < minDistance) {
            minDistance = distance;
            nearest = {
              position: itemPos,
              distance: distance
            };
          }
        });

        return nearest;
      }

      _findRandomSafePosition(map) {
        // Return a random position in the map
        const width = map.width || 28;
        const height = map.height || 18;

        return {
          x: Math.floor(Math.random() * (width - 2)) + 1,
          y: Math.floor(Math.random() * (height - 2)) + 1
        };
      }

      cleanup() {
        this.lastKnownState = {
          map: null,
          players: new Map(),
          bombs: [],
          items: [],
        };
      }
    }

    /**
     * =============================================================================
     * 🎮 BOMBERMAN AI AGENT IMPLEMENTATION
     * =============================================================================
     */

    /**
     * GameMap Class
     * Manages the game grid, bombs, items, and danger map calculation
     */
    class GameMap {
      constructor(gameState) {
        this.width = gameState.map?.width || 28;
        this.height = gameState.map?.height || 18;
        this.tiles = gameState.map?.tiles || [];
        this.bombs = gameState.bombs || [];
        this.items = gameState.items || [];
        this.players = Array.from(gameState.players.values());

        // Initialize danger map
        this.dangerMap = this._createEmptyDangerMap();
        this._updateDangerMap();
      }

      /**
       * Create an empty danger map (all zeros)
       */
      _createEmptyDangerMap() {
        const dangerMap = [];
        for (let y = 0; y < this.height; y++) {
          dangerMap[y] = [];
          for (let x = 0; x < this.width; x++) {
            dangerMap[y][x] = 0;
          }
        }
        return dangerMap;
      }

      /**
       * Update danger map based on all active bombs
       * Danger level is higher when:
       * - Bomb timer is lower (about to explode)
       * - Cell is closer to bomb center
       */
      _updateDangerMap() {
        // Reset danger map
        this.dangerMap = this._createEmptyDangerMap();

        // Calculate danger from each bomb
        this.bombs.forEach(bomb => {
          const bombX = Math.round(bomb.position.x);
          const bombY = Math.round(bomb.position.y);
          const power = bomb.power || 1;
          const timer = bomb.countdownTicks || 0;

          // Base danger multiplier (higher when timer is low)
          // Timer ranges from 180 (just placed) to 0 (exploding)
          // const timerFactor = Math.max(0, 1 - (timer / 180));
          const timerFactor = Math.max(0, (180 - timer) / 180);
          const baseDanger = 50 + (timerFactor * 150); // Range: 50-200

          // Mark bomb center as very dangerous
          if (this._isValidCell(bombX, bombY)) {
            this.dangerMap[bombY][bombX] = Math.max(this.dangerMap[bombY][bombX], baseDanger * 2);
          }

          // Mark explosion range in 4 directions
          const directions = [
            { dx: 0, dy: -1 }, // UP
            { dx: 0, dy: 1 },  // DOWN
            { dx: -1, dy: 0 }, // LEFT
            { dx: 1, dy: 0 }   // RIGHT
          ];

          directions.forEach(dir => {
            for (let i = 1; i <= power; i++) {
              const x = bombX + (dir.dx * i);
              const y = bombY + (dir.dy * i);

              if (!this._isValidCell(x, y)) break;

              // Stop at walls
              if (this.tiles[y][x] === TileType.WALL) break;

              // Danger decreases with distance from bomb
              // const distanceFactor = 1 - (i / (power + 1));
              const distanceFactor = 1;
              const danger = baseDanger * distanceFactor;

              this.dangerMap[y][x] = Math.max(this.dangerMap[y][x], danger);

              // Stop at bricks (explosion doesn't go through)
              if (this.tiles[y][x] === TileType.BRICK) break;
            }
          });
        });
      }

      /**
       * Check if a cell is valid (within bounds)
       */
      _isValidCell(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
      }

      /**
       * Check if a cell is walkable
       */
      isWalkable(x, y) {
        if (!this._isValidCell(x, y)) return false;

        const tile = this.tiles[y][x];
        if (tile === TileType.WALL || tile === TileType.BRICK) return false;

        // Check if there's a bomb at this position
        const hasBomb = this.bombs.some(bomb =>
          Math.round(bomb.position.x) === x && Math.round(bomb.position.y) === y
        );

        return !hasBomb;
      }

      /**
       * Get danger level at a specific cell
       */
      getDanger(x, y) {
        if (!this._isValidCell(x, y)) return 999;
        return this.dangerMap[y][x];
      }

      /**
       * Check if a cell is safe (low danger)
       */
      isSafe(x, y, threshold = 30) {
        return this.getDanger(x, y) < threshold;
      }

      /**
       * Get all items on the map
       */
      getItems() {
        return this.items;
      }

      /**
       * Get all enemies (players not matching the bot's team)
       */
      getEnemies(botTeamId) {
        return this.players.filter(p =>
          p.teamId !== botTeamId && p.status === 'alive'
        );
      }

      /**
       * Get tile type at position
       */
      getTile(x, y) {
        if (!this._isValidCell(x, y)) return TileType.WALL;
        return this.tiles[y][x];
      }
    }

    /**
     * Pathfinder Class
     * A* algorithm implementation for finding optimal paths
     */
    class Pathfinder {
      constructor(gameMap) {
        this.gameMap = gameMap;
      }

      /**
       * Find path from start to goal using A* algorithm
       * Returns array of {x, y} positions or null if no path found
       */
      findPath(start, goal, avoidDanger = true, isFindBrick = false) {
        const startNode = { x: Math.round(start.x), y: Math.round(start.y) };
        const goalNode = { x: Math.round(goal.x), y: Math.round(goal.y) };

        // Check if goal is reachable
        if (!this.gameMap.isWalkable(goalNode.x, goalNode.y) && !isFindBrick) {
          return null;
        }
        // console.log('========>pass 1');
        const openSet = [startNode];
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const nodeKey = (node) => `${node.x},${node.y}`;

        gScore.set(nodeKey(startNode), 0);
        fScore.set(nodeKey(startNode), this._heuristic(startNode, goalNode));

        while (openSet.length > 0) {
          // Get node with lowest fScore
          let current = openSet[0];
          let currentIdx = 0;

          for (let i = 1; i < openSet.length; i++) {
            if (fScore.get(nodeKey(openSet[i])) < fScore.get(nodeKey(current))) {
              current = openSet[i];
              currentIdx = i;
            }
          }
          // Reached goal
          // isFindBrick && console.log('========>pass 2', current, goalNode);
          if (current.x === goalNode.x && current.y === goalNode.y) {
            return this._reconstructPath(cameFrom, current);
          }

          openSet.splice(currentIdx, 1);
          closedSet.add(nodeKey(current));

          // Check neighbors
          const neighbors = this._getNeighbors(current, isFindBrick ? goalNode : null);

          for (const neighbor of neighbors) {
            const neighborKey = nodeKey(neighbor);

            if (closedSet.has(neighborKey)) continue;

            // Calculate tentative gScore
            let dangerCost = avoidDanger ? this.gameMap.getDanger(neighbor.x, neighbor.y) : 0;
            dangerCost = isFindBrick && dangerCost === 999 ? 0 : dangerCost;
            const moveCost = 1 + (dangerCost * 0.5); // Danger increases cost
            const tentativeGScore = gScore.get(nodeKey(current)) + moveCost;

            if (!openSet.some(n => n.x === neighbor.x && n.y === neighbor.y)) {
              openSet.push(neighbor);
            } else if (tentativeGScore >= (gScore.get(neighborKey) || Infinity)) {
              continue;
            }

            // This path is the best so far
            cameFrom.set(neighborKey, current);
            gScore.set(neighborKey, tentativeGScore);
            fScore.set(neighborKey, tentativeGScore + this._heuristic(neighbor, goalNode));
          }
        }

        return null; // No path found
      }

      /**
       * Get valid neighbors of a node
       */
      _getNeighbors(node, exceptNode = null) {
        const neighbors = [];
        const directions = [
          { dx: 0, dy: -1 }, // UP
          { dx: 0, dy: 1 },  // DOWN
          { dx: -1, dy: 0 }, // LEFT
          { dx: 1, dy: 0 }   // RIGHT
        ];

        for (const dir of directions) {
          const x = node.x + dir.dx;
          const y = node.y + dir.dy;

          if (this.gameMap.isWalkable(x, y) || (exceptNode && x === exceptNode.x && y === exceptNode.y)) {
            neighbors.push({ x, y });
          }
        }

        return neighbors;
      }

      /**
       * Manhattan distance heuristic
       */
      _heuristic(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      }

      /**
       * Reconstruct path from cameFrom map
       */
      _reconstructPath(cameFrom, current) {
        const path = [current];
        const nodeKey = (node) => `${node.x},${node.y}`;

        while (cameFrom.has(nodeKey(current))) {
          current = cameFrom.get(nodeKey(current));
          path.unshift(current);
        }

        return path;
      }

      /**
       * Find nearest safe cell from current position
       */
      findNearestSafeCell(start, maxDistance = 10) {
        const startNode = { x: Math.round(start.x), y: Math.round(start.y) };
        const visited = new Set();
        const queue = [{ node: startNode, distance: 0 }];

        while (queue.length > 0) {
          const { node, distance } = queue.shift();
          const nodeKey = `${node.x},${node.y}`;

          if (visited.has(nodeKey)) continue;
          visited.add(nodeKey);

          // Check if this cell is safe
          if (this.gameMap.isSafe(node.x, node.y, 20) && this.gameMap.isWalkable(node.x, node.y)) {
            return node;
          }

          if (distance >= maxDistance) continue;

          // Add neighbors to queue
          const neighbors = this._getNeighbors(node);
          for (const neighbor of neighbors) {
            queue.push({ node: neighbor, distance: distance + 1 });
          }
        }

        return null;
      }
    }

    /**
     * AIPlayer Class
     * Main decision-making AI for the Bomberman bot
     */
    class AIPlayer {
      constructor(player, gameMap, playerId) {
        this.player = player;
        this.gameMap = gameMap;
        this.playerId = playerId;
        this.pathfinder = new Pathfinder(gameMap);
        this.lastBombTime = 0;
        this.currentPath = null;
        this.currentTarget = null;
        // this.isPreKick = false;
      }

      /**
       * Main update method - decides next action
       * Returns: 'u', 'd', 'l', 'r', 'b', or 'k'
       */
      update() {
        const myPos = {
          x: Math.round(this.player.position.x),
          y: Math.round(this.player.position.y)
        };

        // Priority 0: Emergency kick bomb if completely trapped
        const kickAction = this._tryEmergencyKick(myPos);
        if (kickAction) {
          // console.log('========>priority 0 (emergency kick)', kickAction);
          return kickAction;
        }

        // Priority 1: Escape danger if in dangerous area
        const currentDanger = this.gameMap.getDanger(myPos.x, myPos.y);
        if (currentDanger > 30) {
          const a = this._escapeDanger(myPos)
          // console.log('========>priority 1', currentDanger, a);
          return a;
        }

        // Priority 1.5: Move to rescue dying teammate if safe
        {
          const dyingMates = this.gameMap.players.filter(p =>
            p.teamId === this.player.teamId &&
            p.id !== this.playerId &&
            p.status === 'dying'
          );
          if (dyingMates.length > 0) {
            const scored = dyingMates
              .map(t => {
                const pos = { x: Math.round(t.position.x), y: Math.round(t.position.y) };
                return { pos, dist: Math.abs(myPos.x - pos.x) + Math.abs(myPos.y - pos.y) };
              })
              .sort((a, b) => a.dist - b.dist)[0];
            if (scored) {
              const path = this.pathfinder.findPath(myPos, scored.pos, true);
              if (path && path.length > 1) {
                const next = path[1];
                if (this.gameMap.isWalkable(next.x, next.y) && this.gameMap.isSafe(next.x, next.y, 40)) {
                  console.log('========>????');
                  return this._getDirectionToMove(myPos, next);
                }
              }
            }
          }
        }

        // Priority 2: Attack nearby enemy if safe to do so
        const attackAction = this._tryAttackEnemy(myPos);
        if (attackAction) {
          // console.log('========>priority 2', attackAction);
          return attackAction;
        }

        // Priority 3: Collect nearby items if safe
        const itemAction = this._tryCollectItem(myPos);
        if (itemAction) {
          // console.log('========>priority 3', itemAction);
          return itemAction;
        }

        // Priority 4: Destroy breakable blocks (only if safe in radius 4)
        const destroyAction = this._tryDestroyBrick(myPos);
        if (destroyAction) {
          // console.log('========>priority 4', destroyAction);
          return destroyAction;
        }


        // Priority 5: Move toward enemy through breakable blocks
        const huntAction = this._tryHuntEnemy(myPos);
        if (huntAction) {
          return huntAction;
        }
        let s = this._moveToSafePosition(myPos);
        console.log('========>Priority 6', s);
        // Priority 6: Move to random safe position (exploration)
        return s;
      }

      /**
       * Priority 1: Escape from dangerous area
       */
      _escapeDanger(myPos) {
        const safeCell = this.pathfinder.findNearestSafeCell(myPos, 8);

        if (safeCell) {
          const path = this.pathfinder.findPath(myPos, safeCell, true);
          if (path && path.length > 1) {
            return this._getDirectionToMove(myPos, path[1]);
          }
        }

        // If no safe path, move to least dangerous neighbor
        return this._moveToLeastDangerousNeighbor(myPos);
      }

      /**
       * Priority 2: Attack enemy if nearby and escape route exists
       */
      _tryAttackEnemy(myPos) {
        const enemies = this.gameMap.getEnemies(this.player.teamId);
        if (enemies.length === 0) return null;

        // Check if we can place a bomb
        if (!this._canPlaceBomb()) return null;

        // Find nearest enemy
        let nearestEnemy = null;
        let minDistance = Infinity;

        enemies.forEach(enemy => {
          const enemyPos = {
            x: Math.round(enemy.position.x),
            y: Math.round(enemy.position.y)
          };
          const distance = this._manhattanDistance(myPos, enemyPos);

          if (distance < minDistance) {
            minDistance = distance;
            nearestEnemy = enemyPos;
          }
        });

        // If enemy is within bomb range
        if (nearestEnemy && minDistance <= this.player.bombPower + 1) {
          // Check if enemy is in line with us (same row or column)
          const inLine = (myPos.x === nearestEnemy.x) || (myPos.y === nearestEnemy.y);

          if (inLine) {
            // Check if we have an escape route after placing bomb
            const escapeRoute = this._hasEscapeRoute(myPos);

            if (escapeRoute) {
              return 'b'; // Place bomb
            }
          }
        }

        return null;
      }

      /**
       * Priority 3: Collect nearby items
       */
      _tryCollectItem(myPos) {
        const items = this.gameMap.getItems();
        if (items.length === 0) return null;

        // Find nearest item
        let nearestItem = null;
        let minDistance = Infinity;

        items.forEach(item => {
          const itemPos = {
            x: Math.round(item.position.x),
            y: Math.round(item.position.y)
          };
          const distance = this._manhattanDistance(myPos, itemPos);

          // Only consider items within reasonable distance
          if (distance < minDistance && distance <= 10) {
            // Check if path to item is safe
            if (this.gameMap.isSafe(itemPos.x, itemPos.y, 50)) {
              minDistance = distance;
              nearestItem = itemPos;
            }
          }
        });

        if (nearestItem) {
          const path = this.pathfinder.findPath(myPos, nearestItem, true);
          if (path && path.length > 1 && this.gameMap.isSafe(path[1].x, path[1].y, 50)) {
            return this._getDirectionToMove(myPos, path[1]);
          }
        }

        return null;
      }

      /**
       * Priority 4: Destroy nearby breakable blocks
       */
      _tryDestroyBrick(myPos) {
        // if (!this._canPlaceBomb()) return null;

        // Check adjacent cells for bricks
        const directions = [
          { dx: 0, dy: -1 }, // UP
          { dx: 0, dy: 1 },  // DOWN
          { dx: -1, dy: 0 }, // LEFT
          { dx: 1, dy: 0 }   // RIGHT
        ];

        let hasBrickNearby = false;

        for (const dir of directions) {
          const x = myPos.x + dir.dx;
          const y = myPos.y + dir.dy;

          if (this.gameMap.getTile(x, y) === TileType.BRICK) {
            hasBrickNearby = true;
            break;
          }
        }

        // If brick nearby and we have escape route, place bomb
        if (hasBrickNearby && this._hasEscapeRoute(myPos)) {
          return 'b';
        }

        if (!this._isSafeInRadius(myPos, 6)) return null;

        // Otherwise, find nearest brick and move toward it
        const nearestBrick = this._findNearestBrick(myPos);
        // console.log('========>sssssssss inner break');
        if (nearestBrick && this._manhattanDistance(myPos, nearestBrick) <= 12) {
          // console.log('========>aaaaaaaaaaa inner inner break');
          const path = this.pathfinder.findPath(myPos, nearestBrick, true, true);
          if (path && path.length > 1) {
            // console.log('========>ccccccccccc inner inner inner break');
            return this._getDirectionToMove(myPos, path[1]);
          }
        }

        return null;
      }

      /**
       * Priority 5: Hunt enemy through breakable blocks
       */
      _tryHuntEnemy(myPos) {
        const enemies = this.gameMap.getEnemies(this.player.teamId);
        if (enemies.length === 0) return null;

        // Find nearest enemy
        let nearestEnemy = null;
        let minDistance = Infinity;

        enemies.forEach(enemy => {
          const enemyPos = {
            x: Math.round(enemy.position.x),
            y: Math.round(enemy.position.y)
          };
          const distance = this._manhattanDistance(myPos, enemyPos);

          if (distance < minDistance) {
            minDistance = distance;
            nearestEnemy = enemyPos;
          }
        });

        if (nearestEnemy) {
          // Find brick that blocks path to enemy
          const blockingBrick = this._findBlockingBrick(myPos, nearestEnemy);

          if (blockingBrick) {
            const path = this.pathfinder.findPath(myPos, blockingBrick, true);
            if (path && path.length > 1) {
              return this._getDirectionToMove(myPos, path[1]);
            }
          }
        }

        return null;
      }

      /**
       * Priority 6: Move to random safe position (exploration)
       */
      _moveToSafePosition(myPos) {
        // Try to move in a random safe direction
        const directions = [
          { dx: 0, dy: -1, action: 'u' },
          { dx: 0, dy: 1, action: 'd' },
          { dx: -1, dy: 0, action: 'l' },
          { dx: 1, dy: 0, action: 'r' }
        ];

        // Shuffle directions for randomness
        for (let i = directions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [directions[i], directions[j]] = [directions[j], directions[i]];
        }

        for (const dir of directions) {
          const x = myPos.x + dir.dx;
          const y = myPos.y + dir.dy;

          if (this.gameMap.isWalkable(x, y) && this.gameMap.isSafe(x, y, 50)) {
            return dir.action;
          }
        }



        // If no safe direction, just move anywhere walkable
        // for (const dir of directions) {
        //   const x = myPos.x + dir.dx;
        //   const y = myPos.y + dir.dy;

        //   if (this.gameMap.isWalkable(x, y)) {
        //     return dir.action;
        //   }
        // }

        // return 'u'; // Default
      }

      /**
       * Helper: Check if we can place a bomb
       */
      _canPlaceBomb() {
        return this.player.bombsPlaced < this.player.bombLimit;
      }

      /**
       * Helper: Check if there's an escape route after placing bomb
       */
      _hasEscapeRoute(bombPos) {
        // Simulate bomb placement
        const simulatedBomb = {
          position: { x: bombPos.x, y: bombPos.y },
          countdownTicks: 180,
          power: this.player.bombPower
        };

        // Temporarily add bomb to game state
        this.gameMap.bombs.push(simulatedBomb);
        this.gameMap._updateDangerMap();

        // Find safe cell
        const safeCell = this.pathfinder.findNearestSafeCell(bombPos, 8);

        // Remove simulated bomb
        this.gameMap.bombs.pop();
        this.gameMap._updateDangerMap();

        return safeCell !== null;
      }

      /**
       * Helper: Get direction to move from current to next position
       */
      _getDirectionToMove(current, next) {
        const dx = next.x - current.x;
        const dy = next.y - current.y;

        if (dy < 0) return 'u';
        if (dy > 0) return 'd';
        if (dx < 0) return 'l';
        if (dx > 0) return 'r';

        return 'u'; // Default
      }

      /**
       * Helper: Move to least dangerous neighbor
       */
      _moveToLeastDangerousNeighbor(myPos) {
        const directions = [
          { dx: 0, dy: -1, action: 'u' },
          { dx: 0, dy: 1, action: 'd' },
          { dx: -1, dy: 0, action: 'l' },
          { dx: 1, dy: 0, action: 'r' }
        ];

        let bestDir = null;
        let minDanger = Infinity;

        for (const dir of directions) {
          const x = myPos.x + dir.dx;
          const y = myPos.y + dir.dy;

          if (this.gameMap.isWalkable(x, y)) {
            const danger = this.gameMap.getDanger(x, y);
            if (danger < minDanger) {
              minDanger = danger;
              bestDir = dir.action;
            }
          }
        }

        // bestDir = Math.min(minDanger, this.gameMap.getDanger(myPos.x, myPos.y))
        return this.gameMap.getDanger(myPos.x, myPos.y) > minDanger ? bestDir : null;
        // return bestDir || 'u';
      }

      /**
       * Helper: Manhattan distance
       */
      _manhattanDistance(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      }

      /**
       * Helper: Find nearest brick
       */
      _findNearestBrick(myPos) {
        let nearestBrick = null;
        let minDistance = Infinity;

        for (let y = 0; y < this.gameMap.height; y++) {
          for (let x = 0; x < this.gameMap.width; x++) {
            if (this.gameMap.getTile(x, y) === TileType.BRICK) {
              const distance = this._manhattanDistance(myPos, { x, y });
              if (distance < minDistance) {
                minDistance = distance;
                nearestBrick = { x, y };
              }
            }
          }
        }

        return nearestBrick;
      }

      /**
       * Helper: Find brick blocking path to target
       */
      _findBlockingBrick(from, to) {
        // Simple approach: find brick closest to line between from and to
        let bestBrick = null;
        let minScore = Infinity;

        for (let y = 0; y < this.gameMap.height; y++) {
          for (let x = 0; x < this.gameMap.width; x++) {
            if (this.gameMap.getTile(x, y) === TileType.BRICK) {
              const distToFrom = this._manhattanDistance(from, { x, y });
              const distToTarget = this._manhattanDistance({ x, y }, to);
              const score = distToFrom + distToTarget;

              if (score < minScore && distToFrom <= 10) {
                minScore = score;
                bestBrick = { x, y };
              }
            }
          }
        }

        return bestBrick;
      }

      /**
       * Priority 0: Emergency kick bomb if completely trapped
       * Check if all adjacent cells are blocked by bombs, bricks, or walls
       */
      _tryEmergencyKick(myPos) {
        const directions = [
          { dx: 0, dy: -1, action: 'u' }, // UP
          { dx: 0, dy: 1, action: 'd' },  // DOWN
          { dx: -1, dy: 0, action: 'l' }, // LEFT
          { dx: 1, dy: 0, action: 'r' }   // RIGHT
        ];

        let blockedCount = 0;
        let bombAdjacentCount = 0;
        let adjacentBombs = [];

        // Check each adjacent cell
        for (const dir of directions) {
          const x = myPos.x + dir.dx;
          const y = myPos.y + dir.dy;

          // Check if cell is blocked
          if (this._isCellBlocked(x, y)) {
            blockedCount++;

            // Check if blocked by a bomb
            if (this._hasBombAt(x, y)) {
              bombAdjacentCount++;
              adjacentBombs.push({
                position: { x, y },
                direction: dir
              });
            }
          }
        }

        // If all 4 directions are blocked and at least one is a bomb
        if (blockedCount >= 4 && bombAdjacentCount > 0) {
          console.log('========>voday2so', blockedCount, bombAdjacentCount);
          // Check if we can kick any adjacent bomb directly
          // for (const bombInfo of adjacentBombs) {
          //   if (this._canKickBombInDirection(myPos, bombInfo.position, bombInfo.direction)) {
          //     return 'k'; // Can kick this bomb directly
          //   }
          // }
          if (isPreKickA) {
            isPreKickA = false;
            return 'k';
          }

          // If we can't kick directly, move to align with a bomb first
          // const moveAction = this._getMoveToAlignWithBomb(myPos, adjacentBombs);
          isPreKickA = true;
          const adjacentBombsDirection = adjacentBombs.map(bombInfo => bombInfo.direction.action);
          return adjacentBombsDirection.includes(lastActionA) ? lastActionA : adjacentBombsDirection[0].action;

          // if (moveAction) {
          //   return moveAction;
          // }
        }

        return null;
      }

      /**
       * Check if we can kick a bomb in the given direction
       */
      _canKickBombInDirection(myPos, bombPos, direction) {
        // Check if player and bomb are aligned in the kick direction
        if (direction.dx !== 0) {
          // Horizontal kick - must be same row
          return myPos.y === bombPos.y;
        } else {
          // Vertical kick - must be same column
          return myPos.x === bombPos.x;
        }
      }

      // /**
      //  * Get move action to align with a kickable bomb
      //  */
      // _getMoveToAlignWithBomb(myPos, adjacentBombs) {
      //   // Look for nearby positions where we can align with a bomb
      //   const directions = [
      //     { dx: 0, dy: -1, action: 'u' }, // UP
      //     { dx: 0, dy: 1, action: 'd' },  // DOWN
      //     { dx: -1, dy: 0, action: 'l' }, // LEFT
      //     { dx: 1, dy: 0, action: 'r' }   // RIGHT
      //   ];

      //   for (const dir of directions) {
      //     const newX = myPos.x + dir.dx;
      //     const newY = myPos.y + dir.dy;

      //     // Check if this new position is walkable
      //     if (this.gameMap.isWalkable(newX, newY)) {
      //       // Check if from this new position we can kick any adjacent bomb
      //       for (const bombInfo of adjacentBombs) {
      //         const bombX = bombInfo.position.x;
      //         const bombY = bombInfo.position.y;

      //         // Check if new position aligns with bomb for kicking
      //         const wouldAlign = (newX === bombX) || (newY === bombY);
      //         const isAdjacent = Math.abs(newX - bombX) + Math.abs(newY - bombY) === 1;

      //         if (wouldAlign && isAdjacent) {
      //           return dir.action; // Move to this position to align for kick
      //         }
      //       }
      //     }
      //   }

      //   return null;
      // }

      /**
       * Check if a cell is blocked by bomb, brick, or wall
       */
      _isCellBlocked(x, y) {
        // Out of bounds = blocked
        if (!this.gameMap._isValidCell(x, y)) {
          return true;
        }

        // Wall or brick = blocked
        const tile = this.gameMap.getTile(x, y);
        if (tile === TileType.WALL || tile === TileType.BRICK) {
          return true;
        }

        // Bomb = blocked
        if (this._hasBombAt(x, y)) {
          return true;
        }

        return false;
      }

      /**
       * Check if there's a bomb at specific position
       */
      _hasBombAt(x, y) {
        return this.gameMap.bombs.some(bomb =>
          Math.round(bomb.position.x) === x && Math.round(bomb.position.y) === y
        );
      }

      /**
       * Check if area within radius is safe from danger
       */
      _isSafeInRadius(centerPos, radius) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const x = centerPos.x + dx;
            const y = centerPos.y + dy;

            // Skip if out of bounds
            if (!this.gameMap._isValidCell(x, y)) continue;

            // Check if this cell has significant danger
            const danger = this.gameMap.getDanger(x, y);
            if (danger > 0) { // Same threshold as priority 1
              return false; // Found danger in radius
            }
          }
        }
        return true; // No danger found in radius
      }
    }

    exports.BotController = BotController;
    // this.lastAction = null;
    lastActionA = null;
    // this.isPreKick = false;
  }

  _handleInitialState(data) {
    this.lastKnownState.map = data.map;

    this.lastKnownState.players.clear();
    if (data.players && Array.isArray(data.players)) {
      data.players.forEach(player => {
        this.lastKnownState.players.set(player.id, player);
      });
    }

    this.lastKnownState.bombs = data.bombs || [];
    this.lastKnownState.items = data.items || [];
  }

  _handleTickDelta(delta) {
    if (delta.destroyedBricks && Array.isArray(delta.destroyedBricks)) {
      delta.destroyedBricks.forEach(brick => {
        if (this.lastKnownState.map && this.lastKnownState.map.tiles) {
          this.lastKnownState.map.tiles[brick.y][brick.x] = TileType.EMPTY;
        }
      });
    }

    if (delta.players && Array.isArray(delta.players)) {
      delta.players.forEach(playerPayload => {
        const existingPlayer = this.lastKnownState.players.get(playerPayload.id);
        if (existingPlayer) {
          const updatedPlayer = this._hydratePlayer(playerPayload, existingPlayer);
          this.lastKnownState.players.set(playerPayload.id, updatedPlayer);
        } else {
          const newPlayer = this._hydratePlayer(playerPayload, {});
          this.lastKnownState.players.set(playerPayload.id, newPlayer);
        }
      });
    }

    if (delta.bombs && Array.isArray(delta.bombs)) {
      this.lastKnownState.bombs = delta.bombs.map(bombPayload => this._hydrateBomb(bombPayload));
    }

    if (delta.items && Array.isArray(delta.items)) {
      this.lastKnownState.items = delta.items.map(itemPayload => this._hydrateItem(itemPayload));
    }
  }

  _hydratePlayer(payload, baseObj) {
    const player = { ...baseObj };

    if (payload.id !== undefined) player.id = payload.id;
    if (payload.n !== undefined) player.name = payload.n;
    if (payload.d !== undefined) player.direction = payload.d;
    if (payload.p !== undefined) {
      player.position = {
        x: payload.p.x / 100.0,
        y: payload.p.y / 100.0,
      };
    }
    if (payload.s !== undefined) player.status = payload.s;
    if (payload.iv !== undefined) player.isInvincible = payload.iv;
    if (payload.ivt !== undefined) player.invincibilityTicksLeft = payload.ivt;
    if (payload.sp !== undefined) player.speed = payload.sp;
    if (payload.bl !== undefined) player.bombLimit = payload.bl;
    if (payload.bp !== undefined) player.bombsPlaced = payload.bp;
    if (payload.pow !== undefined) player.bombPower = payload.pow;
    if (payload.sc !== undefined) player.score = payload.sc;
    if (payload.tid !== undefined) player.teamId = payload.tid;

    return player;
  }

  _hydrateBomb(payload) {
    return {
      id: payload.id,
      ownerId: payload.o,
      position: { x: payload.p.x, y: payload.p.y },
      countdownTicks: payload.c - 2.88,
      power: payload.pow,
      isExplodingSoon: payload.es,
      isMoving: payload.imv,
      kickerId: payload.kid,
      moveDirection: payload.md,
      moveDistanceLeft: payload.mdl,
    };
  }

  _hydrateItem(payload) {
    return {
      id: payload.id,
      type: payload.t,
      position: { x: payload.p.x, y: payload.p.y },
    };
  }

  processGameState(serverData, playerNumber) {
    if (!serverData || !serverData.type) return null;

    try {
      if (serverData.type === 'initial_state') {
        this._handleInitialState(serverData);
      } else if (serverData.type === 'tick_delta') {
        this._handleTickDelta(serverData);
      }

      const players = Array.from(this.lastKnownState.players.values());
      const botState = players.find(p => p.id === this.playerId);

      if (botState.status === 'dead') {
        return this.decideGhostAction();
      } else {
        // console.log('========>serverData', serverData);
        const action = this.decideNextAction(serverData, playerNumber);

        return { type: 'control', data: action };
      }
    } catch (e) {
      console.error(`Error processing server data`, e);
      return null;
    }
  }

  decideGhostAction() {
    // Phân tích game state cho ghost
    const players = Array.from(this.lastKnownState.players.values());
    const myPlayer = players.find(p => p.id === this.playerId);
    const enemies = players.filter(p => p.id !== this.playerId && (myPlayer.teamId !== p.teamId) && p.status === 'alive');
    const items = this.lastKnownState.items || [];
    const map = this.lastKnownState.map;

    if (!map) {
      // Fallback nếu không có map data
      return {
        type: 'control_ghost',
        data: {
          x: 5,
          y: 7,
        },
      };
    }

    // Tìm vị trí ghost hiện tại (có thể cần estimate nếu không có thông tin chính xác)
    const myGhost = players.find(p => p.id === this.playerId);
    let currentGhostPos = { x: 5, y: 7 }; // Default position

    if (myGhost && myGhost.position) {
      currentGhostPos = {
        x: Math.round(myGhost.position.x),
        y: Math.round(myGhost.position.y)
      };
    }

    // Teammates info
    const teammates = players.filter(p => p.id !== this.playerId && p.teamId === myPlayer.teamId);
    const aliveTeammates = teammates.filter(t => t.status === 'alive');
    const dyingTeammates = teammates.filter(t => t.status === 'dying');

    const nearestAliveMate = aliveTeammates.length
      ? aliveTeammates
        .map(t => ({
          ref: t,
          pos: { x: Math.round(t.position.x), y: Math.round(t.position.y) },
          dist: Math.abs(currentGhostPos.x - Math.round(t.position.x)) + Math.abs(currentGhostPos.y - Math.round(t.position.y)),
        }))
        .sort((a, b) => a.dist - b.dist)[0]
      : null;

    const nearestDyingMate = dyingTeammates.length
      ? dyingTeammates
        .map(t => ({
          ref: t,
          pos: { x: Math.round(t.position.x), y: Math.round(t.position.y) },
          dist: Math.abs(currentGhostPos.x - Math.round(t.position.x)) + Math.abs(currentGhostPos.y - Math.round(t.position.y)),
        }))
        .sort((a, b) => a.dist - b.dist)[0]
      : null;

    // Priority 1: Cứu đồng đội đang dying
    if (nearestDyingMate) {
      return {
        type: 'control_ghost',
        data: {
          x: nearestDyingMate.pos.x,
          y: nearestDyingMate.pos.y,
        },
      };
    }

    // Priority 2: Tìm enemy gần nhất để ám
    const nearestEnemy = this._findNearestEnemy(currentGhostPos, enemies);

    // Priority 3: Tìm item gần nhất để nhặt
    const nearestItem = this._findNearestItem(currentGhostPos, items);

    // Ràng buộc khoảng cách: giữ trong 6 ô so với đồng đội
    if (nearestAliveMate && nearestAliveMate.dist > 6) {
      return {
        type: 'control_ghost',
        data: {
          x: nearestAliveMate.pos.x,
          y: nearestAliveMate.pos.y,
        },
      };
    }

    let targetPos = null;

    // 1. Enemy gần (<=3) → ám
    if (nearestEnemy && nearestEnemy.distance <= 3) {
      // Enemy gần → ưu tiên ám
      targetPos = nearestEnemy.position;
    } else if (nearestItem && nearestItem.distance <= 8 && (!nearestEnemy || nearestEnemy.distance > 4)) {
      // 2. Item nếu enemy không quá gần → nhặt
      targetPos = nearestItem.position;
    } else if (nearestEnemy) {
      // 3. Không item phù hợp → ám enemy
      targetPos = nearestEnemy.position;
    } else if (nearestAliveMate) {
      // 4. Giữ đội hình với đồng đội
      targetPos = nearestAliveMate.pos;
    } else {
      // Không có mục tiêu → di chuyển random trong khu vực an toàn
      targetPos = this._findRandomSafePosition(map);
    }

    return {
      type: 'control_ghost',
      data: {
        x: targetPos.x,
        y: targetPos.y,
      },
    };
  }

  decideNextAction(serverData, playerNumber) {
    const players = Array.from(this.lastKnownState.players.values());
    const myPlayer = players.find(p => p.id === this.playerId);

    if (!myPlayer || !this.lastKnownState.map) {
      return 'u'; // Default action
    }

    // Initialize AI components
    const gameMap = new GameMap(this.lastKnownState);
    const aiPlayer = new AIPlayer(myPlayer, gameMap, this.playerId);

    // Get decision from AI
    const decision = aiPlayer.update();
    // this.lastAction = decision;
    lastActionA = decision;
    return decision;
  }

  _findNearestEnemy(currentPos, enemies) {
    if (!enemies || enemies.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    enemies.forEach(enemy => {
      const enemyPos = {
        x: Math.round(enemy.position.x),
        y: Math.round(enemy.position.y)
      };
      const distance = Math.abs(currentPos.x - enemyPos.x) + Math.abs(currentPos.y - enemyPos.y);

      if (distance < minDistance) {
        minDistance = distance;
        nearest = {
          position: enemyPos,
          distance: distance
        };
      }
    });

    return nearest;
  }

  _findNearestItem(currentPos, items) {
    if (!items || items.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    items.forEach(item => {
      const itemPos = {
        x: Math.round(item.position.x),
        y: Math.round(item.position.y)
      };
      const distance = Math.abs(currentPos.x - itemPos.x) + Math.abs(currentPos.y - itemPos.y);

      if (distance < minDistance) {
        minDistance = distance;
        nearest = {
          position: itemPos,
          distance: distance
        };
      }
    });

    return nearest;
  }

  _findRandomSafePosition(map) {
    // Return a random position in the map
    const width = map.width || 28;
    const height = map.height || 18;

    return {
      x: Math.floor(Math.random() * (width - 2)) + 1,
      y: Math.floor(Math.random() * (height - 2)) + 1
    };
  }

  cleanup() {
    this.lastKnownState = {
      map: null,
      players: new Map(),
      bombs: [],
      items: [],
    };
  }
}

/**
 * =============================================================================
 * 🎮 BOMBERMAN AI AGENT IMPLEMENTATION
 * =============================================================================
 */

/**
 * GameMap Class
 * Manages the game grid, bombs, items, and danger map calculation
 */
class GameMap {
  constructor(gameState) {
    this.width = gameState.map?.width || 28;
    this.height = gameState.map?.height || 18;
    this.tiles = gameState.map?.tiles || [];
    this.bombs = gameState.bombs || [];
    this.items = gameState.items || [];
    this.players = Array.from(gameState.players.values());

    // Initialize danger map
    this.dangerMap = this._createEmptyDangerMap();
    this._updateDangerMap();
  }

  /**
   * Create an empty danger map (all zeros)
   */
  _createEmptyDangerMap() {
    const dangerMap = [];
    for (let y = 0; y < this.height; y++) {
      dangerMap[y] = [];
      for (let x = 0; x < this.width; x++) {
        dangerMap[y][x] = 0;
      }
    }
    return dangerMap;
  }

  /**
   * Update danger map based on all active bombs
   * Danger level is higher when:
   * - Bomb timer is lower (about to explode)
   * - Cell is closer to bomb center
   */
  _updateDangerMap() {
    // Reset danger map
    this.dangerMap = this._createEmptyDangerMap();

    // Calculate danger from each bomb
    this.bombs.forEach(bomb => {
      const bombX = Math.round(bomb.position.x);
      const bombY = Math.round(bomb.position.y);
      const power = bomb.power || 1;
      const timer = bomb.countdownTicks || 0;

      // Base danger multiplier (higher when timer is low)
      // Timer ranges from 180 (just placed) to 0 (exploding)
      // const timerFactor = Math.max(0, 1 - (timer / 180));
      const timerFactor = Math.max(0, (180 - timer) / 180);
      const baseDanger = 50 + (timerFactor * 150); // Range: 50-200

      // Mark bomb center as very dangerous
      if (this._isValidCell(bombX, bombY)) {
        this.dangerMap[bombY][bombX] = Math.max(this.dangerMap[bombY][bombX], baseDanger * 2);
      }

      // Mark explosion range in 4 directions
      const directions = [
        { dx: 0, dy: -1 }, // UP
        { dx: 0, dy: 1 },  // DOWN
        { dx: -1, dy: 0 }, // LEFT
        { dx: 1, dy: 0 }   // RIGHT
      ];

      directions.forEach(dir => {
        for (let i = 1; i <= power; i++) {
          const x = bombX + (dir.dx * i);
          const y = bombY + (dir.dy * i);

          if (!this._isValidCell(x, y)) break;

          // Stop at walls
          if (this.tiles[y][x] === TileType.WALL) break;

          // Danger decreases with distance from bomb
          // const distanceFactor = 1 - (i / (power + 1));
          const distanceFactor = 1;
          const danger = baseDanger * distanceFactor;

          this.dangerMap[y][x] = Math.max(this.dangerMap[y][x], danger);

          // Stop at bricks (explosion doesn't go through)
          if (this.tiles[y][x] === TileType.BRICK) break;
        }
      });
    });
  }

  /**
   * Check if a cell is valid (within bounds)
   */
  _isValidCell(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /**
   * Check if a cell is walkable
   */
  isWalkable(x, y) {
    if (!this._isValidCell(x, y)) return false;

    const tile = this.tiles[y][x];
    if (tile === TileType.WALL || tile === TileType.BRICK) return false;

    // Check if there's a bomb at this position
    const hasBomb = this.bombs.some(bomb =>
      Math.round(bomb.position.x) === x && Math.round(bomb.position.y) === y
    );

    return !hasBomb;
  }

  /**
   * Get danger level at a specific cell
   */
  getDanger(x, y) {
    if (!this._isValidCell(x, y)) return 999;
    return this.dangerMap[y][x];
  }

  /**
   * Check if a cell is safe (low danger)
   */
  isSafe(x, y, threshold = 30) {
    return this.getDanger(x, y) < threshold;
  }

  /**
   * Get all items on the map
   */
  getItems() {
    return this.items;
  }

  /**
   * Get all enemies (players not matching the bot's team)
   */
  getEnemies(botTeamId) {
    return this.players.filter(p =>
      p.teamId !== botTeamId && p.status === 'alive'
    );
  }

  /**
   * Get tile type at position
   */
  getTile(x, y) {
    if (!this._isValidCell(x, y)) return TileType.WALL;
    return this.tiles[y][x];
  }
}

/**
 * Pathfinder Class
 * A* algorithm implementation for finding optimal paths
 */
class Pathfinder {
  constructor(gameMap) {
    this.gameMap = gameMap;
  }

  /**
   * Find path from start to goal using A* algorithm
   * Returns array of {x, y} positions or null if no path found
   */
  findPath(start, goal, avoidDanger = true, isFindBrick = false) {
    const startNode = { x: Math.round(start.x), y: Math.round(start.y) };
    const goalNode = { x: Math.round(goal.x), y: Math.round(goal.y) };

    // Check if goal is reachable
    if (!this.gameMap.isWalkable(goalNode.x, goalNode.y) && !isFindBrick) {
      return null;
    }
    // console.log('========>pass 1');
    const openSet = [startNode];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const nodeKey = (node) => `${node.x},${node.y}`;

    gScore.set(nodeKey(startNode), 0);
    fScore.set(nodeKey(startNode), this._heuristic(startNode, goalNode));

    while (openSet.length > 0) {
      // Get node with lowest fScore
      let current = openSet[0];
      let currentIdx = 0;

      for (let i = 1; i < openSet.length; i++) {
        if (fScore.get(nodeKey(openSet[i])) < fScore.get(nodeKey(current))) {
          current = openSet[i];
          currentIdx = i;
        }
      }
      // Reached goal
      // isFindBrick && console.log('========>pass 2', current, goalNode);
      if (current.x === goalNode.x && current.y === goalNode.y) {
        return this._reconstructPath(cameFrom, current);
      }

      openSet.splice(currentIdx, 1);
      closedSet.add(nodeKey(current));

      // Check neighbors
      const neighbors = this._getNeighbors(current, isFindBrick ? goalNode : null);

      for (const neighbor of neighbors) {
        const neighborKey = nodeKey(neighbor);

        if (closedSet.has(neighborKey)) continue;

        // Calculate tentative gScore
        let dangerCost = avoidDanger ? this.gameMap.getDanger(neighbor.x, neighbor.y) : 0;
        dangerCost = isFindBrick && dangerCost === 999 ? 0 : dangerCost;
        const moveCost = 1 + (dangerCost * 0.5); // Danger increases cost
        const tentativeGScore = gScore.get(nodeKey(current)) + moveCost;

        if (!openSet.some(n => n.x === neighbor.x && n.y === neighbor.y)) {
          openSet.push(neighbor);
        } else if (tentativeGScore >= (gScore.get(neighborKey) || Infinity)) {
          continue;
        }

        // This path is the best so far
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeGScore);
        fScore.set(neighborKey, tentativeGScore + this._heuristic(neighbor, goalNode));
      }
    }

    return null; // No path found
  }

  /**
   * Get valid neighbors of a node
   */
  _getNeighbors(node, exceptNode = null) {
    const neighbors = [];
    const directions = [
      { dx: 0, dy: -1 }, // UP
      { dx: 0, dy: 1 },  // DOWN
      { dx: -1, dy: 0 }, // LEFT
      { dx: 1, dy: 0 }   // RIGHT
    ];

    for (const dir of directions) {
      const x = node.x + dir.dx;
      const y = node.y + dir.dy;

      if (this.gameMap.isWalkable(x, y) || (exceptNode && x === exceptNode.x && y === exceptNode.y)) {
        neighbors.push({ x, y });
      }
    }

    return neighbors;
  }

  /**
   * Manhattan distance heuristic
   */
  _heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  /**
   * Reconstruct path from cameFrom map
   */
  _reconstructPath(cameFrom, current) {
    const path = [current];
    const nodeKey = (node) => `${node.x},${node.y}`;

    while (cameFrom.has(nodeKey(current))) {
      current = cameFrom.get(nodeKey(current));
      path.unshift(current);
    }

    return path;
  }

  /**
   * Find nearest safe cell from current position
   */
  findNearestSafeCell(start, maxDistance = 10) {
    const startNode = { x: Math.round(start.x), y: Math.round(start.y) };
    const visited = new Set();
    const queue = [{ node: startNode, distance: 0 }];

    while (queue.length > 0) {
      const { node, distance } = queue.shift();
      const nodeKey = `${node.x},${node.y}`;

      if (visited.has(nodeKey)) continue;
      visited.add(nodeKey);

      // Check if this cell is safe
      if (this.gameMap.isSafe(node.x, node.y, 20) && this.gameMap.isWalkable(node.x, node.y)) {
        return node;
      }

      if (distance >= maxDistance) continue;

      // Add neighbors to queue
      const neighbors = this._getNeighbors(node);
      for (const neighbor of neighbors) {
        queue.push({ node: neighbor, distance: distance + 1 });
      }
    }

    return null;
  }
}

/**
 * AIPlayer Class
 * Main decision-making AI for the Bomberman bot
 */
class AIPlayer {
  constructor(player, gameMap, playerId) {
    this.player = player;
    this.gameMap = gameMap;
    this.playerId = playerId;
    this.pathfinder = new Pathfinder(gameMap);
    this.lastBombTime = 0;
    this.currentPath = null;
    this.currentTarget = null;
    // this.isPreKick = false;
  }

  /**
   * Main update method - decides next action
   * Returns: 'u', 'd', 'l', 'r', 'b', or 'k'
   */
  update() {
    const myPos = {
      x: Math.round(this.player.position.x),
      y: Math.round(this.player.position.y)
    };

    // Priority 0: Emergency kick bomb if completely trapped
    const kickAction = this._tryEmergencyKick(myPos);
    if (kickAction) {
      // console.log('========>priority 0 (emergency kick)', kickAction);
      return kickAction;
    }

    // Priority 1: Escape danger if in dangerous area
    const currentDanger = this.gameMap.getDanger(myPos.x, myPos.y);
    if (currentDanger > 30) {
      const a = this._escapeDanger(myPos)
      // console.log('========>priority 1', currentDanger, a);
      return a;
    }

     // Priority 1.5: Move to rescue dying teammate if safe
     {
      const dyingMates = this.gameMap.players.filter(p =>
        p.teamId === this.player.teamId &&
        p.id !== this.playerId &&
        p.status === 'dying'
      );
      if (dyingMates.length > 0) {
        const scored = dyingMates
          .map(t => {
            const pos = { x: Math.round(t.position.x), y: Math.round(t.position.y) };
            return { pos, dist: Math.abs(myPos.x - pos.x) + Math.abs(myPos.y - pos.y) };
          })
          .sort((a, b) => a.dist - b.dist)[0];
        if (scored) {
          const path = this.pathfinder.findPath(myPos, scored.pos, true);
          if (path && path.length > 1) {
            const next = path[1];
            if (this.gameMap.isWalkable(next.x, next.y) && this.gameMap.isSafe(next.x, next.y, 40)) {
              console.log('========>????');
              return this._getDirectionToMove(myPos, next);
            }
          }
        }
      }
    }

    // Priority 2: Attack nearby enemy if safe to do so
    const attackAction = this._tryAttackEnemy(myPos);
    if (attackAction) {
      // console.log('========>priority 2', attackAction);
      return attackAction;
    }

    // Priority 3: Collect nearby items if safe
    const itemAction = this._tryCollectItem(myPos);
    if (itemAction) {
      // console.log('========>priority 3', itemAction);
      return itemAction;
    }

    // Priority 4: Destroy breakable blocks (only if safe in radius 4)
    const destroyAction = this._tryDestroyBrick(myPos);
    if (destroyAction) {
      // console.log('========>priority 4', destroyAction);
      return destroyAction;
    }


    // Priority 5: Move toward enemy through breakable blocks
    const huntAction = this._tryHuntEnemy(myPos);
    if (huntAction) {
      return huntAction;
    }

    // console.log('========>Priority 6', s);
    // Priority 6: Move to random safe position (exploration)
    let s = this._moveToSafePosition(myPos);
    return s;
  }

  /**
   * Priority 1: Escape from dangerous area
   */
  _escapeDanger(myPos) {
    const safeCell = this.pathfinder.findNearestSafeCell(myPos, 8);

    if (safeCell) {
      const path = this.pathfinder.findPath(myPos, safeCell, true);
      if (path && path.length > 1) {
        return this._getDirectionToMove(myPos, path[1]);
      }
    }

    // If no safe path, move to least dangerous neighbor
    return this._moveToLeastDangerousNeighbor(myPos);
  }

  /**
   * Priority 2: Attack enemy if nearby and escape route exists
   */
  _tryAttackEnemy(myPos) {
    const enemies = this.gameMap.getEnemies(this.player.teamId);
    if (enemies.length === 0) return null;

    // Check if we can place a bomb
    if (!this._canPlaceBomb()) return null;

    // Find nearest enemy
    let nearestEnemy = null;
    let minDistance = Infinity;

    enemies.forEach(enemy => {
      const enemyPos = {
        x: Math.round(enemy.position.x),
        y: Math.round(enemy.position.y)
      };
      const distance = this._manhattanDistance(myPos, enemyPos);

      if (distance < minDistance) {
        minDistance = distance;
        nearestEnemy = enemyPos;
      }
    });

    // If enemy is within bomb range
    if (nearestEnemy && minDistance <= this.player.bombPower + 1) {
      // Check if enemy is in line with us (same row or column)
      const inLine = (myPos.x === nearestEnemy.x) || (myPos.y === nearestEnemy.y);

      if (inLine) {
        // Check if we have an escape route after placing bomb
        const escapeRoute = this._hasEscapeRoute(myPos);

        if (escapeRoute) {
          return 'b'; // Place bomb
        }
      }
    }

    return null;
  }

  /**
   * Priority 3: Collect nearby items
   */
  _tryCollectItem(myPos) {
    const items = this.gameMap.getItems();
    if (items.length === 0) return null;

    // Find nearest item
    let nearestItem = null;
    let minDistance = Infinity;

    items.forEach(item => {
      const itemPos = {
        x: Math.round(item.position.x),
        y: Math.round(item.position.y)
      };
      const distance = this._manhattanDistance(myPos, itemPos);

      // Only consider items within reasonable distance
      if (distance < minDistance && distance <= 10) {
        // Check if path to item is safe
        if (this.gameMap.isSafe(itemPos.x, itemPos.y, 50)) {
          minDistance = distance;
          nearestItem = itemPos;
        }
      }
    });

    if (nearestItem) {
      const path = this.pathfinder.findPath(myPos, nearestItem, true);
      if (path && path.length > 1 && this.gameMap.isSafe(path[1].x, path[1].y, 50)) {
        return this._getDirectionToMove(myPos, path[1]);
      }
    }

    return null;
  }

  /**
   * Priority 4: Destroy nearby breakable blocks
   */
  _tryDestroyBrick(myPos) {
    // if (!this._canPlaceBomb()) return null;

    // Check adjacent cells for bricks
    const directions = [
      { dx: 0, dy: -1 }, // UP
      { dx: 0, dy: 1 },  // DOWN
      { dx: -1, dy: 0 }, // LEFT
      { dx: 1, dy: 0 }   // RIGHT
    ];

    let hasBrickNearby = false;

    for (const dir of directions) {
      const x = myPos.x + dir.dx;
      const y = myPos.y + dir.dy;

      if (this.gameMap.getTile(x, y) === TileType.BRICK) {
        hasBrickNearby = true;
        break;
      }
    }

    // If brick nearby and we have escape route, place bomb
    if (hasBrickNearby && this._hasEscapeRoute(myPos)) {
      return 'b';
    }

    if (!this._isSafeInRadius(myPos, 6)) return null;

    // Otherwise, find nearest brick and move toward it
    const nearestBrick = this._findNearestBrick(myPos);
    // console.log('========>sssssssss inner break');
    if (nearestBrick && this._manhattanDistance(myPos, nearestBrick) <= 12) {
      // console.log('========>aaaaaaaaaaa inner inner break');
      const path = this.pathfinder.findPath(myPos, nearestBrick, true, true);
      if (path && path.length > 1) {
        // console.log('========>ccccccccccc inner inner inner break');
        return this._getDirectionToMove(myPos, path[1]);
      }
    }

    return null;
  }

  /**
   * Priority 5: Hunt enemy through breakable blocks
   */
  _tryHuntEnemy(myPos) {
    const enemies = this.gameMap.getEnemies(this.player.teamId);
    if (enemies.length === 0) return null;

    // Find nearest enemy
    let nearestEnemy = null;
    let minDistance = Infinity;

    enemies.forEach(enemy => {
      const enemyPos = {
        x: Math.round(enemy.position.x),
        y: Math.round(enemy.position.y)
      };
      const distance = this._manhattanDistance(myPos, enemyPos);

      if (distance < minDistance) {
        minDistance = distance;
        nearestEnemy = enemyPos;
      }
    });

    if (nearestEnemy) {
      // Find brick that blocks path to enemy
      const blockingBrick = this._findBlockingBrick(myPos, nearestEnemy);

      if (blockingBrick) {
        const path = this.pathfinder.findPath(myPos, blockingBrick, true);
        if (path && path.length > 1) {
          return this._getDirectionToMove(myPos, path[1]);
        }
      }
    }

    return null;
  }

  /**
   * Priority 6: Move to random safe position (exploration)
   */
  _moveToSafePosition(myPos) {
    // Try to move in a random safe direction
    const directions = [
      { dx: 0, dy: -1, action: 'u' },
      { dx: 0, dy: 1, action: 'd' },
      { dx: -1, dy: 0, action: 'l' },
      { dx: 1, dy: 0, action: 'r' }
    ];

    // Shuffle directions for randomness
    for (let i = directions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }

    for (const dir of directions) {
      const x = myPos.x + dir.dx;
      const y = myPos.y + dir.dy;

      if (this.gameMap.isWalkable(x, y) && this.gameMap.isSafe(x, y, 50)) {
        return dir.action;
      }
    }



    // If no safe direction, just move anywhere walkable
    // for (const dir of directions) {
    //   const x = myPos.x + dir.dx;
    //   const y = myPos.y + dir.dy;

    //   if (this.gameMap.isWalkable(x, y)) {
    //     return dir.action;
    //   }
    // }

    // return 'u'; // Default
  }

  /**
   * Helper: Check if we can place a bomb
   */
  _canPlaceBomb() {
    return this.player.bombsPlaced < this.player.bombLimit;
  }

  /**
   * Helper: Check if there's an escape route after placing bomb
   */
  _hasEscapeRoute(bombPos) {
    // Simulate bomb placement
    const simulatedBomb = {
      position: { x: bombPos.x, y: bombPos.y },
      countdownTicks: 180,
      power: this.player.bombPower
    };

    // Temporarily add bomb to game state
    this.gameMap.bombs.push(simulatedBomb);
    this.gameMap._updateDangerMap();

    // Find safe cell
    const safeCell = this.pathfinder.findNearestSafeCell(bombPos, 8);

    // Remove simulated bomb
    this.gameMap.bombs.pop();
    this.gameMap._updateDangerMap();

    return safeCell !== null;
  }

  /**
   * Helper: Get direction to move from current to next position
   */
  _getDirectionToMove(current, next) {
    const dx = next.x - current.x;
    const dy = next.y - current.y;

    if (dy < 0) return 'u';
    if (dy > 0) return 'd';
    if (dx < 0) return 'l';
    if (dx > 0) return 'r';

    return 'u'; // Default
  }

  /**
   * Helper: Move to least dangerous neighbor
   */
  _moveToLeastDangerousNeighbor(myPos) {
    const directions = [
      { dx: 0, dy: -1, action: 'u' },
      { dx: 0, dy: 1, action: 'd' },
      { dx: -1, dy: 0, action: 'l' },
      { dx: 1, dy: 0, action: 'r' }
    ];

    let bestDir = null;
    let minDanger = Infinity;

    for (const dir of directions) {
      const x = myPos.x + dir.dx;
      const y = myPos.y + dir.dy;

      if (this.gameMap.isWalkable(x, y)) {
        const danger = this.gameMap.getDanger(x, y);
        if (danger < minDanger) {
          minDanger = danger;
          bestDir = dir.action;
        }
      }
    }

    // bestDir = Math.min(minDanger, this.gameMap.getDanger(myPos.x, myPos.y))
    return this.gameMap.getDanger(myPos.x, myPos.y) > minDanger ? bestDir : null;
    // return bestDir || 'u';
  }

  /**
   * Helper: Manhattan distance
   */
  _manhattanDistance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  /**
   * Helper: Find nearest brick
   */
  _findNearestBrick(myPos) {
    let nearestBrick = null;
    let minDistance = Infinity;

    for (let y = 0; y < this.gameMap.height; y++) {
      for (let x = 0; x < this.gameMap.width; x++) {
        if (this.gameMap.getTile(x, y) === TileType.BRICK) {
          const distance = this._manhattanDistance(myPos, { x, y });
          if (distance < minDistance) {
            minDistance = distance;
            nearestBrick = { x, y };
          }
        }
      }
    }

    return nearestBrick;
  }

  /**
   * Helper: Find brick blocking path to target
   */
  _findBlockingBrick(from, to) {
    // Simple approach: find brick closest to line between from and to
    let bestBrick = null;
    let minScore = Infinity;

    for (let y = 0; y < this.gameMap.height; y++) {
      for (let x = 0; x < this.gameMap.width; x++) {
        if (this.gameMap.getTile(x, y) === TileType.BRICK) {
          const distToFrom = this._manhattanDistance(from, { x, y });
          const distToTarget = this._manhattanDistance({ x, y }, to);
          const score = distToFrom + distToTarget;

          if (score < minScore && distToFrom <= 10) {
            minScore = score;
            bestBrick = { x, y };
          }
        }
      }
    }

    return bestBrick;
  }

  /**
   * Priority 0: Emergency kick bomb if completely trapped
   * Check if all adjacent cells are blocked by bombs, bricks, or walls
   */
  _tryEmergencyKick(myPos) {
    const directions = [
      { dx: 0, dy: -1, action: 'u' }, // UP
      { dx: 0, dy: 1, action: 'd' },  // DOWN
      { dx: -1, dy: 0, action: 'l' }, // LEFT
      { dx: 1, dy: 0, action: 'r' }   // RIGHT
    ];

    let blockedCount = 0;
    let bombAdjacentCount = 0;
    let adjacentBombs = [];

    // Check each adjacent cell
    for (const dir of directions) {
      const x = myPos.x + dir.dx;
      const y = myPos.y + dir.dy;

      // Check if cell is blocked
      if (this._isCellBlocked(x, y)) {
        blockedCount++;

        // Check if blocked by a bomb
        if (this._hasBombAt(x, y)) {
          bombAdjacentCount++;
          adjacentBombs.push({
            position: { x, y },
            direction: dir
          });
        }
      }
    }

    // If all 4 directions are blocked and at least one is a bomb
    if (blockedCount >= 4 && bombAdjacentCount > 0) {
      console.log('========>vodayko', blockedCount, bombAdjacentCount);
      // Check if we can kick any adjacent bomb directly
      // for (const bombInfo of adjacentBombs) {
      //   if (this._canKickBombInDirection(myPos, bombInfo.position, bombInfo.direction)) {
      //     return 'k'; // Can kick this bomb directly
      //   }
      // }
      if (isPreKickA) {
        isPreKickA = false;
        return 'k';
      }

      // If we can't kick directly, move to align with a bomb first
      // const moveAction = this._getMoveToAlignWithBomb(myPos, adjacentBombs);
      isPreKickA = true;
      const adjacentBombsDirection = adjacentBombs.map(bombInfo => bombInfo.direction.action);
      return adjacentBombsDirection.includes(lastActionA) ? lastActionA : adjacentBombsDirection[0];

      // if (moveAction) {
      //   return moveAction;
      // }
    }

    return null;
  }

  /**
   * Check if we can kick a bomb in the given direction
   */
  _canKickBombInDirection(myPos, bombPos, direction) {
    // Check if player and bomb are aligned in the kick direction
    if (direction.dx !== 0) {
      // Horizontal kick - must be same row
      return myPos.y === bombPos.y;
    } else {
      // Vertical kick - must be same column
      return myPos.x === bombPos.x;
    }
  }

  // /**
  //  * Get move action to align with a kickable bomb
  //  */
  // _getMoveToAlignWithBomb(myPos, adjacentBombs) {
  //   // Look for nearby positions where we can align with a bomb
  //   const directions = [
  //     { dx: 0, dy: -1, action: 'u' }, // UP
  //     { dx: 0, dy: 1, action: 'd' },  // DOWN
  //     { dx: -1, dy: 0, action: 'l' }, // LEFT
  //     { dx: 1, dy: 0, action: 'r' }   // RIGHT
  //   ];

  //   for (const dir of directions) {
  //     const newX = myPos.x + dir.dx;
  //     const newY = myPos.y + dir.dy;

  //     // Check if this new position is walkable
  //     if (this.gameMap.isWalkable(newX, newY)) {
  //       // Check if from this new position we can kick any adjacent bomb
  //       for (const bombInfo of adjacentBombs) {
  //         const bombX = bombInfo.position.x;
  //         const bombY = bombInfo.position.y;

  //         // Check if new position aligns with bomb for kicking
  //         const wouldAlign = (newX === bombX) || (newY === bombY);
  //         const isAdjacent = Math.abs(newX - bombX) + Math.abs(newY - bombY) === 1;

  //         if (wouldAlign && isAdjacent) {
  //           return dir.action; // Move to this position to align for kick
  //         }
  //       }
  //     }
  //   }

  //   return null;
  // }

  /**
   * Check if a cell is blocked by bomb, brick, or wall
   */
  _isCellBlocked(x, y) {
    // Out of bounds = blocked
    if (!this.gameMap._isValidCell(x, y)) {
      return true;
    }

    // Wall or brick = blocked
    const tile = this.gameMap.getTile(x, y);
    if (tile === TileType.WALL || tile === TileType.BRICK) {
      return true;
    }

    // Bomb = blocked
    if (this._hasBombAt(x, y)) {
      return true;
    }

    return false;
  }

  /**
   * Check if there's a bomb at specific position
   */
  _hasBombAt(x, y) {
    return this.gameMap.bombs.some(bomb =>
      Math.round(bomb.position.x) === x && Math.round(bomb.position.y) === y
    );
  }

  /**
   * Check if area within radius is safe from danger
   */
  _isSafeInRadius(centerPos, radius) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = centerPos.x + dx;
        const y = centerPos.y + dy;

        // Skip if out of bounds
        if (!this.gameMap._isValidCell(x, y)) continue;

        // Check if this cell has significant danger
        const danger = this.gameMap.getDanger(x, y);
        if (danger > 0) { // Same threshold as priority 1
          return false; // Found danger in radius
        }
      }
    }
    return true; // No danger found in radius
  }
}

exports.BotController = BotController;
