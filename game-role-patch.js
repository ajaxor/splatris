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
    controlHint.textContent = 'joystick / ← → moves piece · rotate button / space rotates · ↓ starts the next piece';
  }
`,
'role initialization');

  replaceOnce(
`  let elapsed, fallSpeed, spawnTimer, spawnInterval, running, phase, squishTimer;
`,
`  let elapsed, fallSpeed, spawnTimer, spawnInterval, running, phase, squishTimer;
  let pieceMoveCooldown, rotateQueued, newPieceQueued, aiDecisionTimer, aiAxis, aiJumpQueued;
`,
'role state');

  replaceOnce(
`    keys = { left:false, right:false, jump:false };
    piece = null;
`,
`    keys = { left:false, right:false, jump:false };
    piece = null;
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
      if(!piece){ spawnTimer = 0; spawnPiece(); }
      newPieceQueued = false;
    }
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
    if(CONTROL_ROLE === 'tetris') updateTetrisControls();
    if(!piece){
      if(CONTROL_ROLE === 'platformer'){
        spawnTimer++;
        if(spawnTimer >= spawnInterval){
          spawnTimer = 0;
          spawnPiece();
        }
      }
    } else {
`,
'piece spawning role');

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
    overlayText.innerHTML = 'Control each falling Tetris piece while the runner is handled by AI.<br>Move left/right, rotate, and press the down arrow button to start the next piece.<br>Pieces always fall at their normal speed.';
  }
`,
'role instructions');

  return source;
};
