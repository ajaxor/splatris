window.patchSplatrisSource = function patchSplatrisSource(source, selectedRole) {
  const role = selectedRole === 'tetris' ? 'tetris' : 'platformer';
  const replaceOnce = (from, to, label) => {
    if (!source.includes(from)) throw new Error(`Splatris role patch could not find ${label}.`);
    source = source.replace(from, to);
  };

  replaceOnce(
`  #jumpBtn{
    flex:1;
    color:var(--o-yellow);
    font-size:12px;
  }
`,
`  #jumpBtn, #rotateBtn, #newPieceBtn{
    flex:1;
    font-size:12px;
  }
  #jumpBtn{ color:var(--o-yellow); }
  #rotateBtn{ color:var(--i-cyan); }
  #newPieceBtn{ color:var(--s-green); font-size:18px; }
  .tetris-actions{ display:flex; gap:8px; flex:2; }
  .role-hidden{ display:none !important; }
`,
'control styles');

  replaceOnce(
`    <div class="tbtn" id="jumpBtn">JUMP</div>
  </div>
  <div class="hint">arrow keys / A D to move, or drag the circle · space or up to jump</div>`,
`    <div class="tbtn" id="jumpBtn">JUMP</div>
    <div class="tetris-actions role-hidden" id="tetrisActions">
      <div class="tbtn" id="rotateBtn">ROTATE</div>
      <div class="tbtn" id="newPieceBtn" aria-label="Start new Tetris piece">↓</div>
    </div>
  </div>
  <div class="hint" id="controlHint">arrow keys / A D to move, or drag the circle · space or up to jump</div>`,
'control markup');

  replaceOnce(
`  const timeVal = document.getElementById('timeVal');
  const bestVal = document.getElementById('bestVal');
`,
`  const timeVal = document.getElementById('timeVal');
  const bestVal = document.getElementById('bestVal');
  const CONTROL_ROLE = ${JSON.stringify(role)};
  const tetrisActions = document.getElementById('tetrisActions');
  const jumpBtn = document.getElementById('jumpBtn');
  const controlHint = document.getElementById('controlHint');
  if(CONTROL_ROLE === 'tetris'){
    jumpBtn.classList.add('role-hidden');
    tetrisActions.classList.remove('role-hidden');
    controlHint.textContent = 'joystick / ← → moves active piece · rotate button / space rotates · ↓ hands off to a new piece';
  }
`,
'role initialization');

  replaceOnce(
`  let elapsed, fallSpeed, spawnTimer, spawnInterval, running, phase, squishTimer;
`,
`  let elapsed, fallSpeed, spawnTimer, spawnInterval, running, phase, squishTimer;
  let pieceMoveCooldown, rotateQueued, newPieceQueued, aiDecisionTimer, aiAxis, aiJumpQueued, inactivePieces;
`,
'role state');

  replaceOnce(
`    keys = { left:false, right:false, jump:false };
    piece = null;
`,
`    keys = { left:false, right:false, jump:false };
    piece = null;
    inactivePieces = [];
    pieceMoveCooldown = 0;
    rotateQueued = false;
    newPieceQueued = false;
    aiDecisionTimer = 0;
    aiAxis = Math.random() < 0.5 ? -1 : 1;
    aiJumpQueued = false;
`,
'reset role state');

  replaceOnce(
`  function pieceCellRects(p){
    return p.cells.map(([cx,cy]) => {
      const col = p.baseCol + cx;
      return { col, x: col * CELL, y: p.y + cy * CELL };
    });
  }
`,
`  function pieceCellRects(p, cellsOverride, baseColOverride){
    const cells = cellsOverride || p.cells;
    const baseCol = baseColOverride === undefined ? p.baseCol : baseColOverride;
    return cells.map(([cx,cy]) => {
      const col = baseCol + cx;
      return { col, x: col * CELL, y: p.y + cy * CELL };
    });
  }

  function canPlacePiece(cells, baseCol){
    const rects = pieceCellRects(piece, cells, baseCol);
    return rects.every(r => {
      if(r.col < 0 || r.col >= COLS) return false;
      const row = rowFromY(r.y);
      return !grid.get(row)?.[r.col];
    });
  }

  function movePiece(direction){
    if(!piece || direction === 0) return;
    const nextCol = piece.baseCol + direction;
    if(canPlacePiece(piece.cells, nextCol)) piece.baseCol = nextCol;
  }

  function rotatePiece(){
    if(!piece || piece.key === 'O') return;
    const rotated = piece.cells.map(([x,y]) => [3-y, x]);
    for(const kick of [0, -1, 1, -2, 2]){
      if(canPlacePiece(rotated, piece.baseCol + kick)){
        piece.cells = rotated;
        piece.baseCol += kick;
        return;
      }
    }
  }

  function handOffToNewPiece(){
    if(piece) inactivePieces.push(piece);
    piece = null;
    spawnTimer = 0;
    spawnPiece();
    pieceMoveCooldown = 0;
  }

  function updateTetrisControls(){
    if(pieceMoveCooldown > 0) pieceMoveCooldown--;
    let direction = 0;
    if(joyActive && Math.abs(joyAxis) > 0.35) direction = joyAxis > 0 ? 1 : -1;
    else if(keys.left !== keys.right) direction = keys.left ? -1 : 1;
    if(direction && pieceMoveCooldown <= 0){
      movePiece(direction);
      pieceMoveCooldown = 7;
    }
    if(rotateQueued){ rotatePiece(); rotateQueued = false; }
    if(newPieceQueued){
      handOffToNewPiece();
      newPieceQueued = false;
    }
  }

  function settleInactivePiece(p){
    const finalRects = pieceCellRects(p);
    for(const r of finalRects){
      const n = rowFromY(r.y);
      if(!grid.has(n)) grid.set(n, new Array(COLS).fill(null));
      grid.get(n)[r.col] = { color:p.color, texture:p.texture, born:frameCount };
      spawnLandingDust(r.x, r.y);
    }
    recomputeHeightmap();
    const cleared = clearFullRows();
    if(cleared > 0){ shake = Math.max(shake, 8 + cleared*4); sfxLineClear(cleared); }
    else { shake = Math.max(shake, 4); sfxBlockLand(); }
    for(const h of heightmap){
      if(h <= CELL*1.5){ finalizeGameOver('buried'); return true; }
    }
    return false;
  }

  function updateInactivePieces(){
    for(let i=inactivePieces.length-1; i>=0; i--){
      const p = inactivePieces[i];
      p.y += fallSpeed;
      const rects = pieceCellRects(p);

      let pushAmount = 0;
      let anyOverlap = false;
      for(const r of rects){
        if(rectsOverlap(r.x, r.y, CELL, CELL, player.x, player.y, player.w, player.h)){
          anyOverlap = true;
          const penetration = (r.y + CELL) - player.y;
          if(penetration > pushAmount) pushAmount = penetration;
        }
      }
      if(anyOverlap){
        const pushedY = player.y + pushAmount;
        const floorY = surfaceBelow(player.x, player.w, player.y);
        const maxY = floorY - player.h;
        if(pushedY >= maxY){
          player.y = maxY;
          triggerSquish(p.color);
          return true;
        }
        player.y = pushedY;
        player.vy = Math.max(player.vy, 0);
        player.grounded = false;
        player.jumping = false;
      }

      let maxOverlap = -Infinity;
      for(const r of rects){
        const overlap = (r.y + CELL) - heightmap[r.col];
        if(overlap > maxOverlap) maxOverlap = overlap;
      }
      if(maxOverlap >= 0){
        p.y -= maxOverlap;
        inactivePieces.splice(i, 1);
        if(settleInactivePiece(p)) return true;
      }
    }
    return false;
  }

  function updateAiIntent(){
    if(--aiDecisionTimer > 0) return;
    aiDecisionTimer = 20 + Math.floor(Math.random()*35);
    if(piece){
      const centerCol = piece.baseCol + 1.5;
      const playerCol = (player.x + player.w/2) / CELL;
      aiAxis = playerCol < centerCol ? -1 : 1;
      if(Math.abs(playerCol-centerCol) < 2.5) aiAxis *= -1;
    } else if(Math.random() < 0.3){
      aiAxis *= -1;
    }
    aiJumpQueued = player.grounded && (Math.random() < 0.45 || columnsBlockedInRange(columnsSpanned(player.x + aiAxis*player.speed*5, player.w), player.y, player.y+player.h));
  }
`,
'piece controls');

  replaceOnce(
`  window.addEventListener('keydown', e=>{
    if(['ArrowLeft','a','A'].includes(e.key)) keys.left = true;
    if(['ArrowRight','d','D'].includes(e.key)) keys.right = true;
    if(['ArrowUp','w','W',' '].includes(e.key)) { keys.jump = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', e=>{
    if(['ArrowLeft','a','A'].includes(e.key)) keys.left = false;
    if(['ArrowRight','d','D'].includes(e.key)) keys.right = false;
    if(['ArrowUp','w','W',' '].includes(e.key)) keys.jump = false;
  });
`,
`  window.addEventListener('keydown', e=>{
    if(['ArrowLeft','a','A'].includes(e.key)) keys.left = true;
    if(['ArrowRight','d','D'].includes(e.key)) keys.right = true;
    if(CONTROL_ROLE === 'tetris'){
      if(['ArrowUp','w','W',' '].includes(e.key) && !e.repeat){ rotateQueued = true; e.preventDefault(); }
      if(['ArrowDown','s','S','Enter'].includes(e.key) && !e.repeat){ newPieceQueued = true; e.preventDefault(); }
    } else if(['ArrowUp','w','W',' '].includes(e.key)) { keys.jump = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', e=>{
    if(['ArrowLeft','a','A'].includes(e.key)) keys.left = false;
    if(['ArrowRight','d','D'].includes(e.key)) keys.right = false;
    if(CONTROL_ROLE !== 'tetris' && ['ArrowUp','w','W',' '].includes(e.key)) keys.jump = false;
  });
`,
'keyboard controls');

  replaceOnce(
`  bindTouch('jumpBtn', ()=>keys.jump=true, ()=>keys.jump=false);
`,
`  bindTouch('jumpBtn', ()=>keys.jump=true, ()=>keys.jump=false);
  bindTouch('rotateBtn', ()=>rotateQueued=true, ()=>{});
  bindTouch('newPieceBtn', ()=>newPieceQueued=true, ()=>{});
`,
'touch controls');

  replaceOnce(
`    // --- player horizontal ---
    // joystick (analog, farther drag = faster) takes priority while active;
    // otherwise fall back to keyboard (pressing both left+right cancels out)
    let axis = 0;
    if(joyActive && Math.abs(joyAxis) > 0.04){
      axis = joyAxis;
      player.facing = axis > 0 ? 1 : -1;
    } else if(keys.left && keys.right){
      axis = 0;
    } else if(keys.left){
      axis = -1; player.facing = -1;
    } else if(keys.right){
      axis = 1; player.facing = 1;
    }
`,
`    // --- player horizontal ---
    // When the human controls the tetrominoes, a lightweight AI drives the runner.
    let axis = 0;
    if(CONTROL_ROLE === 'tetris'){
      updateAiIntent();
      axis = aiAxis;
      player.facing = axis > 0 ? 1 : -1;
    } else if(joyActive && Math.abs(joyAxis) > 0.04){
      axis = joyAxis;
      player.facing = axis > 0 ? 1 : -1;
    } else if(keys.left && keys.right){
      axis = 0;
    } else if(keys.left){
      axis = -1; player.facing = -1;
    } else if(keys.right){
      axis = 1; player.facing = 1;
    }
`,
'player controller role');

  replaceOnce(
`    if(keys.jump && player.grounded){
`,
`    if((CONTROL_ROLE === 'tetris' ? aiJumpQueued : keys.jump) && player.grounded){
      aiJumpQueued = false;
`,
'AI jumping');

  replaceOnce(
`    // --- falling piece ---
    if(!piece){
      spawnTimer++;
      if(spawnTimer >= spawnInterval){
        spawnTimer = 0;
        spawnPiece();
      }
    } else {
`,
`    // --- falling piece ---
    if(CONTROL_ROLE === 'tetris'){
      updateTetrisControls();
      if(updateInactivePieces()) return;
    }
    if(!piece){
      if(CONTROL_ROLE === 'platformer'){
        spawnTimer++;
        if(spawnTimer >= spawnInterval){
          spawnTimer = 0;
          spawnPiece();
        }
      } else {
        spawnPiece();
      }
    } else {
`,
'piece spawning role');

  replaceOnce(
`        piece = null;
        // buried check
`,
`        piece = null;
        if(CONTROL_ROLE === 'tetris') spawnPiece();
        // buried check
`,
'automatic next piece');

  replaceOnce(
`    // falling piece
    if(piece){
      const rects = pieceCellRects(piece);
      for(const r of rects) drawBlockCell(r.x, r.y, piece.color, 1, piece.texture);
    }
`,
`    // falling pieces; only \`piece\` is player-controlled
    for(const falling of inactivePieces){
      const rects = pieceCellRects(falling);
      for(const r of rects) drawBlockCell(r.x, r.y, falling.color, 1, falling.texture);
    }
    if(piece){
      const rects = pieceCellRects(piece);
      for(const r of rects) drawBlockCell(r.x, r.y, piece.color, 1, piece.texture);
    }
`,
'multiple piece rendering');

  replaceOnce(
`    overlayTitle.style.color = '';
    overlay.classList.add('hidden');
    running = true;
`,
`    overlayTitle.style.color = '';
    overlay.classList.add('hidden');
    running = true;
    if(CONTROL_ROLE === 'tetris') newPieceQueued = true;
`,
'first controlled piece');

  replaceOnce(
`  setDifficulty('medium');
`,
`  setDifficulty('medium');
  if(CONTROL_ROLE === 'tetris'){
    overlayText.innerHTML = 'Control the active Tetris piece while the runner is handled by AI.<br>A new piece starts automatically when the active piece lands.<br>Press ↓ at any time to release the current piece and take control of a new one.';
  }
`,
'role instructions');

  return source;
};
