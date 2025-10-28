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
    bombsPlaced: [],
  };
  boomJustNow = false;
  ignoreAction = false;
  filename = 'log_game_4.log';
  lastAction = '';
  hasKicked = false;
  // kickAction = false;

  gameController = {
    priority: {
      item: 20,
      enemy: 15,
      brick: 1,
    },
    bombPlacedSpace: 0,
    timeLeftSafe: 155,
    timeLeftSafeMove: 70,
    distanceHandleBomb: 12,
  };

  constructor(playerId) {
    this.playerId = playerId;
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

      this.lastKnownState.bombsPlaced.forEach((placedBomb, index) => {
        // Add to bombs if bombsPlaced have at least 160 ticks left
        if (Date.now() - placedBomb.at < 500) { // about 160 ticks
          // console.log('========>zoday');
          this.lastKnownState.bombs.push(placedBomb);
        }
      })
      // setTimeout(() => {
      //   console.log('========>this.lastKnownState.bombs', this.lastKnownState.bombs);
      // }, 3000);
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
      countdownTicks: payload.c -2.88,
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
        this.lastAction = action || this.lastAction;

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

    // Priority 1: Tìm enemy gần nhất để ám
    const nearestEnemy = this._findNearestEnemy(currentGhostPos, enemies);
    
    // Priority 2: Tìm item gần nhất để nhặt
    const nearestItem = this._findNearestItem(currentGhostPos, items);

    // Logic quyết định:
    // 1. Nếu có enemy gần (trong bán kính 3 ô) → ưu tiên ám enemy
    // 2. Nếu có item và không có enemy gần → nhặt item
    // 3. Nếu hết item → tìm enemy xa nhất để ám
    
    let targetPos = null;

    if (nearestEnemy && nearestEnemy.distance <= 3) {
      // Enemy gần → ưu tiên ám
      targetPos = nearestEnemy.position;
    } else if (nearestItem && nearestItem.distance <= 8) {
      // Có item và enemy không quá gần → nhặt item
      targetPos = nearestItem.position;
    } else if (nearestEnemy) {
      // Hết item hoặc item quá xa → ám enemy
      targetPos = nearestEnemy.position;
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

  _findNearestEnemy(ghostPos, enemies) {
    if (enemies.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    enemies.forEach(enemy => {
      const enemyPos = {
        x: Math.round(enemy.position.x),
        y: Math.round(enemy.position.y)
      };
      
      const distance = Math.abs(ghostPos.x - enemyPos.x) + Math.abs(ghostPos.y - enemyPos.y);
      
      if (distance < minDistance) {
        minDistance = distance;
        nearest = {
          position: enemyPos,
          distance: distance,
          player: enemy
        };
      }
    });

    return nearest;
  }

  _findNearestItem(ghostPos, items) {
    if (items.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    items.forEach(item => {
      const itemPos = item.position;
      const distance = Math.abs(ghostPos.x - itemPos.x) + Math.abs(ghostPos.y - itemPos.y);
      
      if (distance < minDistance) {
        minDistance = distance;
        nearest = {
          position: itemPos,
          distance: distance,
          item: item
        };
      }
    });

    return nearest;
  }

  _findRandomSafePosition(map) {
    // Tìm vị trí random an toàn cho ghost di chuyển
    const safePositions = [];
    
    for (let y = 1; y < map.height - 1; y++) {
      for (let x = 1; x < map.width - 1; x++) {
        if (map.tiles[y][x] === TileType.EMPTY) {
          safePositions.push({ x, y });
        }
      }
    }
    
    if (safePositions.length === 0) {
      return { x: 5, y: 7 }; // Fallback
    }
    
    // Chọn vị trí random
    const randomIndex = Math.floor(Math.random() * safePositions.length);
    return safePositions[randomIndex];
  }

  decideNextAction(serverData, playerNumber) {
    // Save log data
    // setTimeout(() => {
    //   if (!fs.existsSync(this.filename)) {
    //     fs.writeFileSync(this.filename, '');
    //   }
    //   fs.appendFileSync(this.filename, JSON.stringify(serverData) + '\n');
    // }, 3000);

    const players = Array.from(this.lastKnownState.players.values());
    const myPlayer = players.find(p => p.id === this.playerId);

    if (!myPlayer || !this.lastKnownState.map) {
      return 'u'; // Default action if no data
    }

    const currentPos = {
      x: Math.round(myPlayer.position.x),
      y: Math.round(myPlayer.position.y)
    };
    // console.time('decideAction');
    // Analyze current game state
    const gameState = this._analyzeGameState(myPlayer, players);
    // console.timeEnd('decideAction');
    // Decide action based on priority
    const action = this._decideAction(gameState, currentPos, myPlayer);


    return action;
  }

  _analyzeGameState(myPlayer, allPlayers) {
    const enemies = allPlayers.filter(p => p.id !== this.playerId && (myPlayer.teamId !== p.teamId) && p.status === 'alive');
    // console.log('========>allPlayers', allPlayers);
    const bombs = this.lastKnownState.bombs || [];
    const items = this.lastKnownState.items || [];
    const map = this.lastKnownState.map;

    // Calculate danger zones from all bombs
    const {dangerZones, dangerZonesTime} = this._calculateDangerZones(bombs, map, myPlayer);

    // Find safe positions
    const safePositions = this._findSafePositions(map, dangerZones, dangerZonesTime);

    // Find strategic positions (near bricks, items, enemies)
    const strategicPositions = this._findStrategicPositions(map, enemies, items);

    return {
      myPlayer,
      enemies,
      bombs,
      items,
      map,
      dangerZones,
      safePositions,
      strategicPositions,
      dangerZonesTime,
    };
  }

  _calculateDangerZones(bombs, map, myPlayer) {
    const dangerZones = new Set();
    const dangerZonesTime = new Map();

    bombs
    .filter(bomb => {
      // bỏ phân tích bomb có bán kính so với myPlayer < 8
      const bombPos = bomb.position;
      const distance = Math.abs(myPlayer.position.x - bombPos.x) + Math.abs(myPlayer.position.y - bombPos.y);
      return distance < this.gameController.distanceHandleBomb;
    })
    .forEach(bomb => {
      const bombPos = bomb.position;
      const power = bomb.power || 1;
      const timeLeft = bomb.countdownTicks;

      // Add bomb position itself
      dangerZones.add(`${bombPos.x},${bombPos.y}`);

      // Calculate explosion range in 4 directions
      const directions = [
        { dx: 0, dy: -1 }, // up
        { dx: 0, dy: 1 },  // down
        { dx: -1, dy: 0 }, // left
        { dx: 1, dy: 0 }   // right
      ];

      directions.forEach(dir => {
        for (let i = 1; i <= power; i++) {
          const x = bombPos.x + (dir.dx * i);
          const y = bombPos.y + (dir.dy * i);

          if (x < 1 || x >= map.width-1 || y < 1 || y >= map.height-1) break;
          if (map.tiles[y]?.[x] === undefined) break;
          if (map.tiles[y][x] === TileType.WALL) break;
          if (map.tiles[y][x] === TileType.BRICK) break;
          // timeLeft <= 2 ?
          // console.log('========>timeLeft', timeLeft);
          // if (timeLeft > this.gameController.timeLeftSafe) break;

          dangerZones.add(`${x},${y}`);
          dangerZonesTime.set(`${x},${y}`, timeLeft);

          if (map.tiles[y][x] === TileType.BRICK) break;
        }
      });
    });

    return {dangerZones, dangerZonesTime};
  }

  _findSafePositions(map, dangerZones, dangerZonesTime) {
    const safePositions = [];

    for (let y = 1; y < map.height-1; y++) {
      for (let x = 1; x < map.width-1; x++) {
        if (map.tiles[y][x] === TileType.EMPTY && (!dangerZones.has(`${x},${y}`))) { //  || dangerZonesTime.get(`${x},${y}`) > this.gameController.timeLeftSafe
          safePositions.push({ x, y });
        }
      }
    }

    return safePositions;
  }

  _findStrategicPositions(map, enemies, items) {
    const strategic = [];

    // TODO-maybe not: map is only return once when initial_state, the user need to store it and update when brick is destroyed???

    // Positions near bricks (for bombing)
    for (let y = 1; y < map.height-1; y++) {
      for (let x = 1; x < map.width-1; x++) {
        if (map.tiles[y][x] === TileType.EMPTY) {
          let nearBricks = 0;
          const neighbors = [
            { x: x-1, y }, { x: x+1, y },
            { x, y: y-1 }, { x, y: y+1 },
            // { x: x-2, y }, { x: x+2, y },
            // { x, y: y-2 }, { x, y: y+2 }
          ];

          neighbors.forEach(pos => {
            if (pos.x >= 0 && pos.x < map.width && pos.y >= 0 && pos.y < map.height) {
              if (map.tiles[pos.y][pos.x] === TileType.BRICK) nearBricks++;
            }
          });

          if (nearBricks > 0) {
            strategic.push({ x, y, value: nearBricks * this.gameController.priority.brick, type: 'brick' });
          }
        }
      }
    }

    // Positions near items
    items.forEach(item => {
      strategic.push({
        x: item.position.x,
        y: item.position.y,
        value: this.gameController.priority.item || 20,
        type: 'item'
      });
    });

    // Positions that can attack enemies
    enemies.forEach(enemy => {
      const enemyPos = {
        x: Math.round(enemy.position.x),
        y: Math.round(enemy.position.y)
      };
      strategic.push({
        x: enemyPos.x,
        y: enemyPos.y,
        value: this.gameController.priority.enemy || 15,
        type: 'enemy'
      });
    });

    return strategic;
  }

  _decideAction(gameState, currentPos, myPlayer) {
    const { dangerZones, safePositions, strategicPositions, bombs, map, dangerZonesTime } = gameState;

    // Priority 0: Kiểm tra khả năng thoát và kick bomb nếu cần
    // const escapeOrKickAction = this._checkEscapeAndKick(bombs, currentPos, map, dangerZones, dangerZonesTime, myPlayer);
    // if (escapeOrKickAction) {
    //   return escapeOrKickAction;
    // }

    // Add priority 0 here
    // if bot in struck in corner by bomb and no safe position, return 'k' to kick bomb to another place
    const stuckByBomb = this._stuckByBomb(bombs, currentPos, map, dangerZones, dangerZonesTime);
    if (stuckByBomb && !this.hasKicked) {
      this.hasKicked = true;
      return stuckByBomb;
    }
    if (this.hasKicked) {
      this.hasKicked = false;
      return 'k';
    }

    // Priority 1: Escape danger if currently in danger zone
    if (dangerZones.has(`${currentPos.x},${currentPos.y}`)) {
      const escapeAction = this._findEscapeRoute(currentPos, safePositions, map);

      if (escapeAction) return escapeAction;
    }

    // Priority 2: Attack enemies if they are close
    const attackAction = this._tryAttackEnemy(gameState, currentPos, myPlayer);
    if (attackAction) return attackAction;

    // Priority 2.5: Collect items within 2 tiles radius
    const collectItemAction = this._tryCollectNearbyItems(gameState, currentPos, map);
    if (collectItemAction) return collectItemAction;

    // Priority 3: Bomb strategic positions if safe
    if (myPlayer.bombsPlaced < myPlayer.bombLimit) {
      const bombAction = this._tryStrategicBomb(gameState, currentPos, myPlayer, dangerZonesTime);
      if (bombAction) {
        this.lastKnownState.bombsPlaced.push({
          id: `simulated-${Date.now()}`,
          ownerId: myPlayer.id,
          position: { x: currentPos.x, y: currentPos.y },
          countdownTicks: this.gameController.timeLeftSafe - 5, // Simulated countdown
          power: myPlayer.bombPower,
          isExplodingSoon: false,
          isMoving: false,
          kickerId: null,
          moveDirection: null,
          moveDistanceLeft: 0,
          at: Date.now()
        });
        // this.boomJustNow = true;
        // setTimeout(() => {
        //   this.boomJustNow = false;
        // }, 150);

        return bombAction;
      }
    }

    // Priority 4: Move towards strategic positions
    const moveAction = this._findBestMove(gameState, currentPos);
    if (moveAction) {
      // if (this.boomJustNow) {
      //   this.boomJustNow = false;
      //   console.log('========>boomJustNow, moveAction', moveAction);
      // }
      console.log('========>sss:', moveAction);
      return moveAction;
    };

    // Default: Move to safe random position
    // const random = this._findSafeRandomMove(currentPos, map, dangerZones);
    // return random;
    // if (safeRandomAction) return safeRandomAction;

    // // Last resort: try any valid move
    // const directions = ['u', 'd', 'l', 'r'];
    // for (const direction of directions) {
    //   const testPos = this._getPositionAfterMove(currentPos, direction);
    //   if (this._isValidMove(testPos, map)) {
    //     return direction;
    //   }
    // }

    // // If all else fails, return a default action
    // return 'u';
    // console.log('========>vaodayko');
  }

  // _checkEscapeAndKick = (bombs, currentPos, map, dangerZones, dangerZonesTime, myPlayer) => {
  //   // Kiểm tra xem có thể thoát khỏi tình huống hiện tại không
  //   const canEscape = this._canPlayerEscape(currentPos, map, dangerZones, dangerZonesTime, bombs);
    
  //   if (!canEscape) {
  //     // Nếu không thể thoát, tìm bomb gần nhất để kick
  //     const nearestBomb = this._findNearestKickableBomb(bombs, currentPos, map);
      
  //     if (nearestBomb) {
  //       // Di chuyển về phía bomb để kick
  //       const actionToReachBomb = this._getActionToReachBomb(currentPos, nearestBomb.position, map);
        
  //       // Nếu đã ở sát bomb, kick nó
  //       if (this._isAdjacentToBomb(currentPos, nearestBomb.position)) {
  //         return 'k';
  //       }
        
  //       // Nếu chưa, di chuyển về phía bomb
  //       return actionToReachBomb;
  //     }
  //   }
    
  //   return null; // Có thể thoát hoặc không có bomb để kick
  // }

  // _canPlayerEscape = (currentPos, map, dangerZones, dangerZonesTime, bombs) => {
  //   // Sử dụng BFS để kiểm tra xem có đường thoát nào không
  //   const visited = new Set();
  //   const queue = [{ pos: currentPos, moves: 0, time: 0 }];
  //   const maxMoves = 5; // Kiểm tra trong vòng 5 nước đi
    
  //   while (queue.length > 0) {
  //     const { pos, moves, time } = queue.shift();
  //     const posKey = `${pos.x},${pos.y}`;
      
  //     if (visited.has(posKey)) continue;
  //     visited.add(posKey);
      
  //     // Tính thời gian ước tính để đến vị trí này
  //     const estimatedTime = time + this.gameController.timeLeftSafeMove;
      
  //     // Kiểm tra xem vị trí này có an toàn không
  //     const isDangerous = dangerZones.has(posKey);
  //     const dangerTime = dangerZonesTime.get(posKey) || Infinity;
      
  //     // Nếu tìm được vị trí an toàn
  //     if (!isDangerous || dangerTime > estimatedTime + 50) { // Buffer 50 ticks
  //       return true;
  //     }
      
  //     // Tiếp tục tìm kiếm nếu chưa vượt quá giới hạn nước đi
  //     if (moves < maxMoves) {
  //       const directions = [
  //         { dx: 0, dy: -1 }, // up
  //         { dx: 0, dy: 1 },  // down
  //         { dx: -1, dy: 0 }, // left
  //         { dx: 1, dy: 0 }   // right
  //       ];
        
  //       directions.forEach(dir => {
  //         const newPos = {
  //           x: pos.x + dir.dx,
  //           y: pos.y + dir.dy
  //         };
          
  //         if (this._isValidMove(newPos, map)) {
  //           queue.push({ 
  //             pos: newPos, 
  //             moves: moves + 1, 
  //             time: estimatedTime 
  //           });
  //         }
  //       });
  //     }
  //   }
    
  //   return false; // Không tìm được đường thoát
  // }

  // _findNearestKickableBomb = (bombs, currentPos, map) => {
  //   let nearestBomb = null;
  //   let minDistance = Infinity;
    
  //   bombs.forEach(bomb => {
  //     // Chỉ xem xét bomb có thể kick được (trong phạm vi hợp lý)
  //     const distance = Math.abs(currentPos.x - bomb.position.x) + 
  //                     Math.abs(currentPos.y - bomb.position.y);
      
  //     // Bomb phải gần và có đủ thời gian để tiếp cận
  //     if (distance < 5 && bomb.countdownTicks > distance * this.gameController.timeLeftSafeMove) {
  //       if (distance < minDistance) {
  //         minDistance = distance;
  //         nearestBomb = bomb;
  //       }
  //     }
  //   });
    
  //   return nearestBomb;
  // }

  // _getActionToReachBomb = (currentPos, bombPos, map) => {
  //   // Tìm hướng di chuyển tối ưu để đến bomb
  //   const dx = bombPos.x - currentPos.x;
  //   const dy = bombPos.y - currentPos.y;
    
  //   let possibleActions = [];
    
  //   // Ưu tiên di chuyển theo trục có khoảng cách lớn hơn
  //   if (Math.abs(dx) > Math.abs(dy)) {
  //     if (dx > 0) possibleActions.push('r');
  //     else if (dx < 0) possibleActions.push('l');
      
  //     if (dy > 0) possibleActions.push('d');
  //     else if (dy < 0) possibleActions.push('u');
  //   } else {
  //     if (dy > 0) possibleActions.push('d');
  //     else if (dy < 0) possibleActions.push('u');
      
  //     if (dx > 0) possibleActions.push('r');
  //     else if (dx < 0) possibleActions.push('l');
  //   }
    
  //   // Kiểm tra action nào khả thi
  //   for (const action of possibleActions) {
  //     const newPos = this._getPositionAfterMove(currentPos, action);
  //     if (this._isValidMove(newPos, map)) {
  //       return action;
  //     }
  //   }
    
  //   return null;
  // }

  // _isAdjacentToBomb = (playerPos, bombPos) => {
  //   const distance = Math.abs(playerPos.x - bombPos.x) + Math.abs(playerPos.y - bombPos.y);
  //   return distance === 1 || (playerPos.x === bombPos.x && playerPos.y === bombPos.y);
  // }

  _stuckByBomb = (bombs, currentPos, map, dangerZones, dangerZonesTime) => {
      // Check if bot is surrounded by bombs and cannot move to any safe position
      const directions = [
        { dx: 0, dy: -1, d: 'u' },
        { dx: 0, dy: 1, d: 'd' },
        { dx: -1, dy: 0, d: 'l' },
        { dx: 1, dy: 0, d: 'r' }
      ];
      let blocked = 0;
      let bombDirections = [];
      directions.forEach(dir => {
        const newPos = {
          x: currentPos.x + dir.dx,
          y: currentPos.y + dir.dy
        };
        const bomb = bombs.find(bomb =>
            bomb.position.x === newPos.x && bomb.position.y === newPos.y
          )
        bomb && bombDirections.push(dir.d);

        if (
          !this._isValidMove(newPos, map) ||
          // dangerZones.has(`${newPos.x},${newPos.y}`)
          bomb
        ) {
          blocked++;
        }
      });
      // If all directions are blocked and there is a bomb at current position
      // const bombAtCurrent = bombs.some(bomb =>
      //   bomb.position.x === currentPos.x && bomb.position.y === currentPos.y
      // );
      if (blocked === 4) {
        return bombDirections.includes(this.lastAction) ? this.lastAction : bombDirections[0];
      }

      if (blocked === 3) {
        // Find the open direction
        const openDir = directions.find(dir => {
          const newPos = {
            x: currentPos.x + dir.dx,
            y: currentPos.y + dir.dy
          };
          return this._isValidMove(newPos, map) && !bombs.find(bomb =>
            bomb.position.x === newPos.x && bomb.position.y === newPos.y
          );
        });


        if (openDir) {
          let tempBlocked = 0;
          let tempBombDirections = [];
          directions.find(dir => {
            const newPos = {
              x: openDir.x + dir.dx,
              y: openDir.y + dir.dy
            };
            
            // if (!this._isValidMove(newPos, map) && bombs.find(bomb =>
            //   bomb.position.x === newPos.x && bomb.position.y === newPos.y
            // )) {
            //   tempBlocked++;
            // }

            // if (tempBlocked === 3) {
            //   return 
            // }
            const bomb2 = bombs.find(bomb =>
              bomb.position.x === newPos.x && bomb.position.y === newPos.y
            )
            bomb2 && tempBombDirections.push(dir.d);

            if (
              !this._isValidMove(newPos, map) ||
              // dangerZones.has(`${newPos.x},${newPos.y}`)
              bomb2
            ) {
              tempBlocked++;
            }

            if (tempBlocked >= 3) {
              return tempBombDirections.includes(this.lastAction) ? this.lastAction : tempBombDirections[0];
            }
          });
        }
      }

      // If bomb is at current position, keep last action (to kick)
      const bomb = bombs.find(bomb => bomb.position.x === currentPos.x && bomb.position.y === currentPos.y)
      if (bomb && bomb.countdownTicks < this.gameController.timeLeftSafe - this.gameController.timeLeftSafeMove / 4)
      {
        return this.lastAction;
      }

      // If bot is not find a way to escape in 3 moves, kick the bomb
      // const canEscape = this._canReachSafetyIn3Moves(currentPos, map, dangerZones, dangerZonesTime);
      // if (!canEscape) {
      //   return bombDirections[0] || this.lastAction;
      // }


      return false;
  }

  _getPositionAfterMove(currentPos, action) {
    const moves = {
      'u': { dx: 0, dy: -1 },
      'd': { dx: 0, dy: 1 },
      'l': { dx: -1, dy: 0 },
      'r': { dx: 1, dy: 0 }
    };

    const move = moves[action];
    return {
      x: currentPos.x + move.dx,
      y: currentPos.y + move.dy
    };
  }

  _findEscapeRoute(currentPos, safePositions, map) {
    const directions = [
      { action: 'u', dx: 0, dy: -1 },
      { action: 'd', dx: 0, dy: 1 },
      { action: 'l', dx: -1, dy: 0 },
      { action: 'r', dx: 1, dy: 0 }
    ];

    let bestAction = null;
    let bestDistance = Infinity;

    directions.forEach(dir => {
      const newPos = {
        x: currentPos.x + dir.dx,
        y: currentPos.y + dir.dy
      };

      if (this._isValidMove(newPos, map)) {
        const closestSafe = this._findClosestPosition(newPos, safePositions);
        if (closestSafe && closestSafe.distance < bestDistance) {
          bestDistance = closestSafe.distance;
          bestAction = dir.action;
        }
      }
    });

    return bestAction;
  }

  _tryAttackEnemy(gameState, currentPos, myPlayer) {
    const { enemies, dangerZones, map } = gameState;

    if (myPlayer.bombsPlaced >= myPlayer.bombLimit) return null;

    for (const enemy of enemies) {
      const enemyPos = {
        x: Math.round(enemy.position.x),
        y: Math.round(enemy.position.y)
      };

      const distance = Math.abs(currentPos.x - enemyPos.x) + Math.abs(currentPos.y - enemyPos.y);

      // If enemy is within bomb range and we can escape safely
      if (distance <= myPlayer.bombPower + 1) {
        if (this._canPlaceBombSafely(currentPos, myPlayer, map, dangerZones)) {
          return 'b';
        }
      }
    }

    return null;
  }

  _tryStrategicBomb(gameState, currentPos, myPlayer, dangerZonesTime) {
    const { map, dangerZones } = gameState;

    // Check if current position is good for bombing
    let nearBricks = 0;
    const directions = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
    ];

    const countBrick = (currentPos, wallToBreak = false) => {
      // let tempNearBricks = 0;
      const tempNearBricks = new Set();
      directions.forEach(dir => {
        // Before: myPlayer.bombPower
        for (let i = 1; i <= this.gameController.bombPlacedSpace + 1; i++) {
          const checkX = currentPos.x + (dir.dx * i);
          const checkY = currentPos.y + (dir.dy * i);

          if (checkX < 1 || checkX >= map.width-1 || checkY < 1 || checkY >= map.height-1) break;

          if (map.tiles[checkY][checkX] === TileType.WALL && wallToBreak) {
            tempNearBricks.add(`${checkX},${checkY}`);
            // tempNearBricks++;
            break;
          } else if (map.tiles[checkY][checkX] === TileType.WALL) break;

          if (map.tiles[checkY][checkX] === TileType.BRICK) {
            tempNearBricks.add(`${checkX},${checkY}`);
            // tempNearBricks++;
            break;
          }
        }
      });


      return tempNearBricks;
    }

    nearBricks = countBrick(currentPos);


    // directions.forEach(dir => {
    //   const checkX = currentPos.x + dir.dx;
    //   const checkY = currentPos.y + dir.dy;

    //   if (nearBricks !== 3 && countBrick({ x: checkX, y: checkY}, true) === 3) {
    //     // Dont place bomb if next to 3 bricks
    //     nearBricks = 0;
    //   };
    // });

    if (
      nearBricks.size >= 1 &&
      ![...nearBricks].some(brick => dangerZones.has(brick)) &&
      // nearBricks.size !== 2
      // nearBricks.size === 1 && !dangerZones.has(nearBricks.values().next().value)
      // &&

      this._canPlaceBombSafely(currentPos, myPlayer, map, dangerZones, dangerZonesTime)
    ) {
      return 'b';
    }

    return null;
  }

  _canPlaceBombSafely(position, myPlayer, map, dangerZones, dangerZonesTime) {
    // Simulate bomb placement and check if we can escape
    const tempDangerZones = new Set(dangerZones);
    const tempDangerZonesTime = new Map(dangerZonesTime);

    // Add danger zones from the bomb we're about to place
    const directions = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
    ];

    tempDangerZones.add(`${position.x},${position.y}`);
    tempDangerZonesTime.set(`${position.x},${position.y}`, this.gameController.timeLeftSafe);

    directions.forEach(dir => {
      for (let i = 1; i <= myPlayer.bombPower; i++) {
        const x = position.x + (dir.dx * i);
        const y = position.y + (dir.dy * i);

        if (x < 1 || x >= map.width-1 || y < 1 || y >= map.height-1) break;
        if (map.tiles[y][x] === TileType.WALL) break;

        tempDangerZones.add(`${x},${y}`);
        tempDangerZonesTime.set(`${x},${y}`, this.gameController.timeLeftSafe);

        if (map.tiles[y][x] === TileType.BRICK) break;
      }
    });

    // Check if we can reach a safe position within 2-3 moves
    return this._canReachSafetyIn3Moves(position, map, tempDangerZones, tempDangerZonesTime);
  }

  _canReachSafetyIn3Moves(startPos, map, dangerZones, dangerZonesTime) {
    const visited = new Set();
    const queue = [{ pos: startPos, moves: 0 }];

    while (queue.length > 0) {
      const { pos, moves } = queue.shift();
      const posKey = `${pos.x},${pos.y}`;

      if (visited.has(posKey)) continue;
      visited.add(posKey);

      if (
        moves > 0 &&
        // !dangerZones.has(posKey) &&
        map.tiles[pos.y][pos.x] === TileType.EMPTY &&
        (
          !dangerZones.has(posKey)
          // ||
          // dangerZonesTime.get(posKey) > (moves * this.gameController.timeLeftSafeMove)
        )
      ) {
        return true;
      }

      if (moves < 3) {
        const neighbors = [
          { x: pos.x-1, y: pos.y },
          { x: pos.x+1, y: pos.y },
          { x: pos.x, y: pos.y-1 },
          { x: pos.x, y: pos.y+1 }
        ];

        neighbors.forEach(neighbor => {
          if (this._isValidMove(neighbor, map)) {
            queue.push({ pos: neighbor, moves: moves + 1 });
          }
        });
      }
    }

    return false;
  }

  _findBestMove(gameState, currentPos) {
    const { strategicPositions, map, dangerZones } = gameState;

    const directions = [
      { action: 'u', dx: 0, dy: -1 },
      { action: 'd', dx: 0, dy: 1 },
      { action: 'l', dx: -1, dy: 0 },
      { action: 'r', dx: 1, dy: 0 }
    ];

    let bestAction = null;
    let bestScore = -1;

    directions.forEach(dir => {
      const newPos = {
        x: currentPos.x + dir.dx,
        y: currentPos.y + dir.dy
      };

      if (this._isValidMove(newPos, map) && !dangerZones.has(`${newPos.x},${newPos.y}`)) {
        const score = this._calculatePositionScore(newPos, strategicPositions);
        if (score > bestScore) {
          bestScore = score;
          bestAction = dir.action;
        }
      }
    });

    return bestAction;
  }

  _calculatePositionScore(position, strategicPositions) {
    let score = 0;
    const map = this.lastKnownState.map;

    strategicPositions.forEach(strategic => {
      const distance = Math.abs(position.x - strategic.x) + Math.abs(position.y - strategic.y);

      if (distance === 0) {
        score += strategic.value;
      } else {
        // Check if there's a clear path to the strategic position
        const pathDistance = this._findPathDistance(position, strategic, map);
        if (pathDistance !== null && pathDistance < 10) { // Only consider reachable targets within reasonable distance
          score += strategic.value / (pathDistance + 1);
        }
        // If no clear path, don't add to score
      }
    });

    return score;
  }

  _findPathDistance(start, target, map) {
    // Use BFS to find shortest path considering obstacles
    if (!map || !map.tiles) return null;

    const queue = [{ pos: start, distance: 0 }];
    const visited = new Set();

    while (queue.length > 0) {
      const { pos, distance } = queue.shift();
      const posKey = `${pos.x},${pos.y}`;

      if (visited.has(posKey)) continue;
      visited.add(posKey);

      // Found target
      if (pos.x === target.x && pos.y === target.y) {
        return distance;
      }

      // Don't search too far to avoid performance issues
      if (distance >= 8) continue;

      // Check all 4 directions
      const directions = [
        { dx: 0, dy: -1 }, // up
        { dx: 0, dy: 1 },  // down
        { dx: -1, dy: 0 }, // left
        { dx: 1, dy: 0 }   // right
      ];

      directions.forEach(dir => {
        const newPos = {
          x: pos.x + dir.dx,
          y: pos.y + dir.dy
        };

        // Check if this position is valid and reachable
        if (this._isValidMove(newPos, map)) {
          const newPosKey = `${newPos.x},${newPos.y}`;
          if (!visited.has(newPosKey)) {
            queue.push({ pos: newPos, distance: distance + 1 });
          }
        }
      });
    }

    return null; // No path found
  }

  _findSafeRandomMove(currentPos, map, dangerZones) {
    const directions = ['u', 'd', 'l', 'r'];
    const moves = [
      { action: 'u', dx: 0, dy: -1 },
      { action: 'd', dx: 0, dy: 1 },
      { action: 'l', dx: -1, dy: 0 },
      { action: 'r', dx: 1, dy: 0 }
    ];

    const safeMoves = moves.filter(dir => {
      const newPos = {
        x: currentPos.x + dir.dx,
        y: currentPos.y + dir.dy
      };
      return this._isValidMove(newPos, map) && !dangerZones.has(`${newPos.x},${newPos.y}`);
    });

    if (safeMoves.length > 0) {
      return safeMoves[Math.floor(Math.random() * safeMoves.length)].action;
    }

    // // If no safe moves, try any valid move
    // const validMoves = moves.filter(dir => {
    //   const newPos = {
    //     x: currentPos.x + dir.dx,
    //     y: currentPos.y + dir.dy
    //   };
    //   return this._isValidMove(newPos, map);
    // });

    // if (validMoves.length > 0) {
    //   return validMoves[Math.floor(Math.random() * validMoves.length)].action;
    // }

    return null;
  }

  _tryCollectNearbyItems(gameState, currentPos, map) {
    const { items, dangerZones } = gameState;
    
    // Tìm các item trong bán kính 2 ô
    const nearbyItems = items.filter(item => {
      const distance = Math.abs(currentPos.x - item.position.x) + 
                      Math.abs(currentPos.y - item.position.y);
      return distance <= 2;
    });

    if (nearbyItems.length === 0) return null;

    // Sắp xếp item theo khoảng cách (gần nhất trước)
    nearbyItems.sort((a, b) => {
      const distA = Math.abs(currentPos.x - a.position.x) + 
                   Math.abs(currentPos.y - a.position.y);
      const distB = Math.abs(currentPos.x - b.position.x) + 
                   Math.abs(currentPos.y - b.position.y);
      return distA - distB;
    });

    // Thử di chuyển về phía item gần nhất mà an toàn
    for (const item of nearbyItems) {
      const itemPos = item.position;
      
      // Kiểm tra xem có thể tiếp cận item an toàn không
      if (!dangerZones.has(`${itemPos.x},${itemPos.y}`)) {
        const actionToReachItem = this._getActionToReachPosition(currentPos, itemPos, map, dangerZones);
        if (actionToReachItem) {
          return actionToReachItem;
        }
      }
    }

    return null;
  }

  _getActionToReachPosition(currentPos, targetPos, map, dangerZones) {
    // Tính toán hướng di chuyển tối ưu để đến vị trí mục tiêu
    const dx = targetPos.x - currentPos.x;
    const dy = targetPos.y - currentPos.y;
    
    let possibleActions = [];
    
    // Ưu tiên di chuyển theo trục có khoảng cách lớn hơn
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0) possibleActions.push('r');
      else if (dx < 0) possibleActions.push('l');
      
      if (dy > 0) possibleActions.push('d');
      else if (dy < 0) possibleActions.push('u');
    } else {
      if (dy > 0) possibleActions.push('d');
      else if (dy < 0) possibleActions.push('u');
      
      if (dx > 0) possibleActions.push('r');
      else if (dx < 0) possibleActions.push('l');
    }
    
    // Kiểm tra action nào khả thi và an toàn
    for (const action of possibleActions) {
      const newPos = this._getPositionAfterMove(currentPos, action);
      if (this._isValidMove(newPos, map) && !dangerZones.has(`${newPos.x},${newPos.y}`)) {
        return action;
      }
    }
    
    return null;
  }

  _isValidMove(position, map) {
    return position.x >= 1 && position.x < map.width-1 &&
           position.y >= 1 && position.y < map.height-1 &&
           map.tiles[position.y][position.x] === TileType.EMPTY;
  }

  _findClosestPosition(currentPos, positions) {
    if (positions.length === 0) return null;

    let closest = null;
    let minDistance = Infinity;

    positions.forEach(pos => {
      const distance = Math.abs(currentPos.x - pos.x) + Math.abs(currentPos.y - pos.y);
      if (distance < minDistance) {
        minDistance = distance;
        closest = { position: pos, distance };
      }
    });

    return closest;
  }
}

exports.BotController = BotController;
