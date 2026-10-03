(function () {
  'use strict';

  /* ------------------------------------------------------------------
   * Helpers
   * ------------------------------------------------------------------ */
  const lerp = (norm, min, max) => (max - min) * norm + min;
  const norm = (value, min, max) => (value - min) / (max - min);
  const mapRange = (value, sMin, sMax, dMin, dMax) => lerp(norm(value, sMin, sMax), dMin, dMax);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const getCanvas = (width, height) => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  };

  const toBitmap = canvas => (window.createImageBitmap ? createImageBitmap(canvas) : Promise.resolve(canvas));

  /* ------------------------------------------------------------------
   * Saved progress (all keys prefixed with "train-puzzle:")
   * ------------------------------------------------------------------ */
  const KEY = 'train-puzzle:';
  const store = {
    get(name, fallback) {
      try {
        const v = localStorage.getItem(KEY + name);
        return v === null ? fallback : v;
      } catch (e) {
        return fallback;
      }
    },
    set(name, value) {
      try { localStorage.setItem(KEY + name, String(value)); } catch (e) { /* storage unavailable */ }
    }
  };

  /* ------------------------------------------------------------------
   * Constants
   * ------------------------------------------------------------------ */
  const TileTypes = Object.freeze({
    upleft: 1,
    upright: 2,
    downleft: 3,
    downright: 4,
    horizontal: 5,
    vertical: 6,
    shadow: 7,
    blocker: 9
  });

  const Directions = Object.freeze({ up: 1, right: 2, down: 3, left: 4 });

  // Sprites are rendered at a higher resolution than the world units so they stay sharp when scaled up.
  const SPR = 2;
  const TILE_W = 224;
  const TILE_H = 144;
  const TUNNEL_PAD = 140;

  const COLORS = {
    rail: '#7d94a3',
    railShadow: '#314858',
    road: '#01aead',
    blocker: '#f38073',
    locked: '#019897',
    bg: '#252021',
    yellow: '#fdb601'
  };

  /* ------------------------------------------------------------------
   * Level generation (unchanged rules from the original game)
   * ------------------------------------------------------------------ */
  class PathPos {
    constructor(x, y, trail) {
      this.x = x;
      this.y = y;
      this.trail = [...trail];
      this.finishFound = false;
    }

    getAdjacent(l, prev) {
      let directions = [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 }
      ];
      const adj = [];

      if (Math.random() >= 0.5) directions = directions.reverse();

      for (let i = 0; i < directions.length; i++) {
        const dir = directions[i];
        const nx = this.x + dir.x;
        const ny = this.y + dir.y;
        const posKey = nx + 'x' + ny;

        if (nx >= 0 && ny >= 0 && nx < 8 && ny < 8) {
          if (l.level[ny][nx] !== 9 && !prev.includes(posKey)) {
            this.trail.push(this);
            prev.push(posKey);
            const np = new PathPos(nx, ny, this.trail);
            if (nx === l.end.x && ny === l.end.y) np.finishFound = true;
            adj.push(np);
          }
        }
      }
      return adj;
    }
  }

  const levelFactory = {
    randomNumber: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,

    newLevel() {
      let l = null;
      let path = [];
      const minLength = 9;

      while (path.length < minLength) {
        l = levelFactory.generateLevel();
        path = levelFactory.findPath(l);
      }

      levelFactory.addTrailToMap(l.level, path, l.end);

      for (let i = 0; i < l.level.length; i++) {
        for (let j = 0; j < l.level[i].length; j++) {
          if (l.level[i][j] === 0) l.level[i][j] = levelFactory.randomNumber(1, 6);
        }
      }

      // Remove the frame of blockers around the board
      for (let i = 0; i <= 7; i++) {
        if (l.level[i][0] === 9) l.level[i][0] = 0;
        if (l.level[0][i] === 9) l.level[0][i] = 0;
        if (l.level[i][7] === 9) l.level[i][7] = 0;
        if (l.level[7][i] === 9) l.level[7][i] = 0;
      }
      return l;
    },

    generateLevel() {
      const rn = levelFactory.randomNumber;
      const l = {
        level: [
          [9, 9, 9, 9, 9, 9, 9, 9],
          [9, 0, 0, 0, 0, 0, 0, 9],
          [9, 0, 0, 0, 0, 0, 0, 9],
          [9, 0, 0, 0, 0, 0, 0, 9],
          [9, 0, 0, 0, 0, 0, 0, 9],
          [9, 0, 0, 0, 0, 0, 0, 9],
          [9, 0, 0, 0, 0, 0, 0, 9],
          [9, 9, 9, 9, 9, 9, 9, 9]
        ],
        start: Math.random() >= 0.5 ? { x: rn(1, 6), y: 0 } : { x: 0, y: rn(1, 6) },
        end: Math.random() >= 0.5 ? { x: rn(1, 6), y: 7 } : { x: 7, y: rn(1, 6) },
        spare: rn(1, 6)
      };

      const minBlockers = Math.floor(rn(1, 100) / 10);

      l.level[l.start.y][l.start.x] = l.start.x === 0 ? 6 : 5;
      l.level[l.end.y][l.end.x] = l.end.x === 7 ? 6 : 5;

      for (let i = 0; i < rn(minBlockers, 10); i++) {
        const x = rn(1, 6);
        const y = rn(1, 6);
        l.level[y][x] = 9;
        if (Math.random() > 0.5) l.level[y][x + 1] = 9;
        if (Math.random() > 0.5) l.level[y + 1][x] = 9;
      }
      return l;
    },

    findPath(l) {
      return levelFactory.recursiveAdjacentPositions([new PathPos(l.start.x, l.start.y, [])], l, []);
    },

    addTrailToMap(level, path, endPos) {
      let dir = '';

      for (let i = 0; i < path.length; i++) {
        const t = path[i];
        const nextPos = path[i + 1] ? { x: path[i + 1].x, y: path[i + 1].y } : endPos;
        const change = levelFactory.getNextTilePosition(t, nextPos);

        if (t.y === 0) {
          level[t.y][t.x] = 6;
          dir = 'down';
        } else if (t.x === 0) {
          level[t.y][t.x] = 5;
          dir = 'right';
        }

        if (!change) continue;

        if (dir === 'down') {
          if (change === 'left') { level[t.y][t.x] = 3; dir = 'left'; }
          else if (change === 'right') { level[t.y][t.x] = 4; dir = 'right'; }
          else level[t.y][t.x] = 5;
        } else if (dir === 'up') {
          if (change === 'left') { level[t.y][t.x] = 1; dir = 'left'; }
          else if (change === 'right') { level[t.y][t.x] = 2; dir = 'right'; }
          else level[t.y][t.x] = 5;
        } else if (dir === 'right') {
          if (change === 'up') { level[t.y][t.x] = 3; dir = 'up'; }
          else if (change === 'down') { level[t.y][t.x] = 1; dir = 'down'; }
          else level[t.y][t.x] = 6;
        } else if (dir === 'left') {
          if (change === 'up') { level[t.y][t.x] = 4; dir = 'up'; }
          else if (change === 'down') { level[t.y][t.x] = 2; dir = 'down'; }
          else level[t.y][t.x] = 6;
        }
      }
    },

    getNextTilePosition(t, nextPos) {
      if (!nextPos) return undefined;
      const cx = nextPos.x - t.x;
      const cy = nextPos.y - t.y;
      if (cx === -1) return 'left';
      if (cx === 1) return 'right';
      if (cy === -1) return 'up';
      if (cy === 1) return 'down';
      return undefined;
    },

    recursiveAdjacentPositions(positions, l, prev) {
      let manyPos = [];

      for (let i = 0; i < positions.length; i++) {
        const adj = positions[i].getAdjacent(l, prev);
        manyPos = manyPos.concat(adj);
        for (let j = 0; j < adj.length; j++) {
          if (adj[j].finishFound) return adj[j].trail;
        }
      }

      if (manyPos.length) {
        const res = levelFactory.recursiveAdjacentPositions(manyPos, l, prev);
        if (res.length) return res;
      }
      return [];
    }
  };

  /* ------------------------------------------------------------------
   * Train sprites (pre-rendered for every rotation)
   * ------------------------------------------------------------------ */
  const puzzleSpritesFactory = quality => {
    class Rectangle {
      constructor(center, radius, rotation) {
        this.radius = radius;
        this.center = center;
        this.rotation = rotation;
        this.rotate(rotation);
      }

      rotate(r) {
        this.rotation = r;
        this.p1 = this.getPoint(this.center, r + 30, this.radius);
        this.p2 = this.getPoint(this.center, r + 150, this.radius);
        this.p3 = this.getPoint(this.center, r + 210, this.radius);
        this.p4 = this.getPoint(this.center, r + 330, this.radius);
      }

      translate(distance) {
        const r = new Rectangle(this.center, this.radius, this.rotation);
        r.p1.y += distance;
        r.p2.y += distance;
        r.p3.y += distance;
        r.p4.y += distance;
        return r;
      }

      localTranslate(distance) {
        this.p1.y += distance;
        this.p2.y += distance;
        this.p3.y += distance;
        this.p4.y += distance;
        return this;
      }

      push(distance) {
        return new Rectangle(this.getPoint(this.center, this.rotation, distance), this.radius, this.rotation);
      }

      intersect(rectangle, inverted) {
        const r = new Rectangle(this.center, this.radius, this.rotation);
        if (inverted) {
          r.p1 = { x: this.p1.x, y: this.p1.y };
          r.p2 = { x: rectangle.p2.x, y: rectangle.p2.y };
          r.p3 = { x: rectangle.p3.x, y: rectangle.p3.y };
          r.p4 = { x: this.p4.x, y: this.p4.y };
        } else {
          r.p1 = { x: rectangle.p1.x, y: rectangle.p1.y };
          r.p2 = { x: this.p2.x, y: this.p2.y };
          r.p3 = { x: this.p3.x, y: this.p3.y };
          r.p4 = { x: rectangle.p4.x, y: rectangle.p4.y };
        }
        return r;
      }

      connect(ctx, colors, rectangle, drawHiddenSides) {
        let drawOrder;
        const sides = {
          1: { p1: this.p1, p2: rectangle.p1, p3: rectangle.p4, p4: this.p4 },
          2: { p1: this.p2, p2: rectangle.p2, p3: rectangle.p1, p4: this.p1 },
          3: { p1: this.p2, p2: rectangle.p2, p3: rectangle.p3, p4: this.p3 },
          4: { p1: this.p3, p2: rectangle.p3, p3: rectangle.p4, p4: this.p4 }
        };

        if (this.rotation <= 90) drawOrder = [4, 3, 2, 1];
        else if (this.rotation <= 180) drawOrder = [2, 3, 1, 4];
        else if (this.rotation <= 270) drawOrder = [2, 1, 3, 4];
        else drawOrder = [4, 1, 3, 2];

        for (let i = drawHiddenSides ? 1 : 3; i <= 4; i++) {
          this.drawSide(ctx, sides[drawOrder[i - 1]], colors['side' + drawOrder[i - 1]]);
        }
      }

      drawSide(ctx, side, color) {
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(side.p1.x, side.p1.y);
        ctx.lineTo(side.p2.x, side.p2.y);
        ctx.lineTo(side.p3.x, side.p3.y);
        ctx.lineTo(side.p4.x, side.p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      getPoint(center, rotation, radius) {
        const radian = (rotation / 180) * Math.PI;
        return {
          x: center.x + radius * Math.cos(radian),
          y: center.y + Math.floor(radius / 1.6) * Math.sin(radian)
        };
      }

      draw(ctx, color) {
        this.drawSide(ctx, this, color);
        return this;
      }
    }

    const drawSlice = (ctx, b, startSlant, colors, translate, height, slant) => {
      const g2 = b.push(0);
      const g1 = b.push(startSlant);
      const ground = g1.intersect(g2, true);
      const ground2 = g1.intersect(g2, true);
      const base = ground.localTranslate(translate);
      const top = ground2.localTranslate(translate - height);
      const topPushed = ground.push(slant).translate(translate - height);
      const t = top.intersect(topPushed);
      base.connect(ctx, colors, t, slant !== 0);
      return t;
    };

    const createSprite = (rotation, colors, isLocomotive) => {
      // Drawn in a 600x600 space and stored at 300x300 (shown at 150x150 world units)
      const offscreen = getCanvas(300, 300);
      const ctx = offscreen.getContext('2d');
      ctx.scale(0.5, 0.5);
      const ground = new Rectangle({ x: 300, y: 420 }, 210, rotation);
      const base = new Rectangle({ x: 300, y: 420 }, 220, rotation);

      if (!isLocomotive) {
        ground.connect(ctx, colors.baseColors, base.translate(-40), false);
        base.translate(-40).connect(ctx, colors.baseColors, base.translate(-50), false);
        base.translate(-50).connect(ctx, colors.colorLine, base.translate(-70), false);
        base.translate(-70).connect(ctx, colors.baseColors, base.translate(-90), false);
        base.translate(-90).connect(ctx, colors.windowColors, base.translate(-160), false);
        base.translate(-160).connect(ctx, colors.baseColors, base.translate(-200).draw(ctx, '#fff'), false);
      } else {
        ground.connect(ctx, colors.baseColors, base.translate(-40), false);
        base.translate(-40).connect(ctx, colors.baseColors, base.translate(-50), false);
        drawSlice(ctx, base, 0, colors.colorLine2, -50, 20, -10);
        drawSlice(ctx, base, -10, colors.baseColors, -70, 20, -20);
        drawSlice(ctx, base, -30, colors.windowColors, -90, 70, -70);
        drawSlice(ctx, base, -100, colors.baseColors2, -160, 20, -70);
        drawSlice(ctx, base, -170, colors.baseColors3, -180, 20, -100).draw(ctx, '#FFF');
      }
      return toBitmap(offscreen);
    };

    const colors = {
      baseColors: { side1: '#d9dbdb', side2: '#fff', side3: '#d9dbdb', side4: '#fff' },
      baseColors2: { side1: '#e2e2e2', side2: '#fff', side3: '#d9dbdb', side4: '#fff' },
      baseColors3: { side1: '#f7f7f7', side2: '#fff', side3: '#d9dbdb', side4: '#fff' },
      colorLine: { side1: '#d9dbdb', side2: '#f38073', side3: '#d9dbdb', side4: '#f38073' },
      colorLine2: { side1: '#f38073', side2: '#f38073', side3: '#d9dbdb', side4: '#f38073' },
      windowColors: { side1: '#323332', side2: '#323332', side3: '#323332', side4: '#323332' }
    };
    const locPromises = [];
    const carPromises = [];

    for (let rotation = 0; rotation <= 360; rotation += quality) {
      carPromises.push(createSprite(rotation, colors, false));
      locPromises.push(createSprite(rotation, colors, true));
    }
    return { locPromises, carPromises };
  };

  /* ------------------------------------------------------------------
   * Game state
   * ------------------------------------------------------------------ */
  const state = {
    canvas: null,
    ctx: null,
    dpr: 1,
    map: null,
    // 'loading' | 'menu' | 'playing' | 'paused' | 'won' | 'lost'
    phase: 'loading',
    autoplay: true,
    train: { tile: null, prevTiles: [], dir: null, speed: 0.25 },
    lastCarts: null,
    timing: { last: 0 },
    graphics: {},
    level: 1,
    best: 0,
    difficulty: 25,
    // view transform: screen = world * s + (ox, oy) in CSS pixels
    view: { s: 0.5, ox: 0, oy: 0 },
    viewTarget: { s: 0.5, ox: 0, oy: 0 },
    viewSnap: true,
    layout: null,
    // pointer interaction
    hoverTile: null,
    aim: null,
    spareBump: 0
  };

  const ui = {};

  /* ------------------------------------------------------------------
   * Tiles
   * ------------------------------------------------------------------ */
  class Tile {
    constructor(x, y, type) {
      this.x = x;
      this.y = y;
      this.type = type;
      this.width = TILE_W;
      this.height = TILE_H;
      this.progress = 0;
      this.locked = false;
      this.setDir = null;
      this.pixelPos = {
        x: 578 + this.x * 112 - this.y * 112,
        y: 124 + this.y * 72 + this.x * 72
      };
    }

    draw(ctx) {
      const sprite = state.graphics['tile-' + this.type + (this.locked ? '-locked' : '')];
      if (sprite) ctx.drawImage(sprite, this.pixelPos.x, this.pixelPos.y, TILE_W, TILE_H);
    }

    getCorners(rotateCount) {
      const corners = [
        { x: 112, y: 0 },
        { x: 224, y: 72 },
        { x: 112, y: 144 },
        { x: 0, y: 72 }
      ];
      for (let i = 0; i < rotateCount; i++) corners.push(corners.shift());
      return { c1: corners[0], c2: corners[1], c3: corners[2], c4: corners[3] };
    }

    makeSprite(type, isLocked) {
      const offscreen = getCanvas(TILE_W * SPR, TILE_H * SPR);
      const ctx = offscreen.getContext('2d');
      let fillStyle = '#e17f51';

      ctx.scale(SPR, SPR);

      if (isLocked) {
        fillStyle = COLORS.locked;
      } else if (type === TileTypes.shadow) {
        fillStyle = 'rgba(0, 0, 0, .2)';
      } else if (type === TileTypes.blocker) {
        fillStyle = COLORS.blocker;
      } else {
        fillStyle = COLORS.road;
      }

      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      ctx.moveTo(112, 0);
      ctx.lineTo(224, 72);
      ctx.lineTo(112, 144);
      ctx.lineTo(0, 72);
      ctx.closePath();
      ctx.fill();

      if (type === TileTypes.shadow) {
        // Thickness of the lifted preview tile
        const thickness = 10;
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, thickness);
        ctx.lineTo(112, 72 + thickness);
        ctx.lineTo(224, thickness);
        ctx.lineTo(224, 0);
        ctx.closePath();
        ctx.fill();
      }

      const railMin = 0.37;
      const railMax = 0.63;

      if (type === TileTypes.horizontal || type === TileTypes.vertical) {
        this.drawRail(ctx, railMin, type === TileTypes.horizontal ? 0 : 1);
        this.drawRail(ctx, railMax, type === TileTypes.horizontal ? 0 : 1);
      } else if (type === TileTypes.upright) {
        this.drawRailCorner(ctx, railMin, 0);
        this.drawRailCorner(ctx, railMax, 0);
      } else if (type === TileTypes.upleft) {
        this.drawRailCorner(ctx, railMin, 1);
        this.drawRailCorner(ctx, railMax, 1);
      } else if (type === TileTypes.downleft) {
        this.drawRailCorner(ctx, railMin, 2);
        this.drawRailCorner(ctx, railMax, 2);
      } else if (type === TileTypes.downright) {
        this.drawRailCorner(ctx, railMin, 3);
        this.drawRailCorner(ctx, railMax, 3);
      }
      return toBitmap(offscreen);
    }

    makeGoalSprite(cIndex) {
      const offscreen = getCanvas(TILE_W * SPR, TILE_H * SPR);
      const ctx = offscreen.getContext('2d');
      const c = this.getCorners(cIndex);
      const p2 = this.getPosLine(c.c1, c.c2, 0.5);
      const p3 = this.getPosLine(c.c4, c.c3, 0.5);
      const p1 = this.getPosLine(p2, p3, 0.5);

      ctx.scale(SPR, SPR);
      ctx.fillStyle = COLORS.bg;
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.bg;
      ctx.beginPath();
      ctx.moveTo(c.c1.x, c.c1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(c.c4.x, c.c4.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(c.c2.x, c.c2.y);
      ctx.lineTo(c.c3.x, c.c3.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return toBitmap(offscreen);
    }

    drawGoal(ctx) {
      const sprite = state.graphics['goal' + (this.x === 7 ? 0 : 1)];
      if (sprite) ctx.drawImage(sprite, this.pixelPos.x, this.pixelPos.y, TILE_W, TILE_H);
    }

    makeTunnelSprite(drawCover, isFlipped) {
      // extra room above the tile so the tunnel cover is not clipped
      const offscreen = getCanvas(264 * SPR, (184 + TUNNEL_PAD) * SPR);
      const ctx = offscreen.getContext('2d');
      const c = this.getCorners(1);
      ctx.translate(0, TUNNEL_PAD * SPR);
      const p1 = this.getPosLine(c.c1, c.c2, 0.2);
      const p2 = this.getPosLine(c.c1, c.c2, 0.8);
      const center = this.getPosLine(c.c1, c.c2, 0.5);

      if (isFlipped) {
        ctx.translate(224 * SPR, 0);
        ctx.scale(-SPR, SPR);
      } else {
        ctx.scale(SPR, SPR);
      }

      if (drawCover) {
        ctx.fillStyle = COLORS.bg;
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y - 18);
        ctx.lineTo(c.c3.x, c.c3.y);
        ctx.lineTo(c.c3.x - 50, c.c3.y - 100);
        ctx.lineTo(c.c4.x, c.c4.y - 100);
        ctx.lineTo(c.c1.x, c.c1.y - 100);
        ctx.lineTo(p1.x, p1.y - 50);
        ctx.quadraticCurveTo(p1.x, p1.y - 75, center.x, center.y - 75);
        ctx.quadraticCurveTo(p2.x, p2.y - 75, p2.x, p2.y - 50);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.strokeStyle = COLORS.bg;
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.moveTo(c.c4.x, c.c4.y);
        ctx.lineTo(c.c1.x, c.c1.y);
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = COLORS.bg;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(c.c1.x, c.c1.y);
        ctx.lineTo(c.c4.x, c.c4.y);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#444';
        ctx.beginPath();
        const p3 = this.getPosLine(c.c3, c.c4, 0.8);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(c.c4.x, c.c4.y);
        ctx.lineTo(p1.x, p1.y - 75);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = COLORS.bg;
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y - 23);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(c.c2.x, c.c2.y);
        ctx.lineTo(c.c3.x, c.c3.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = COLORS.bg;
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.moveTo(c.c2.x, c.c2.y);
        ctx.lineTo(c.c3.x, c.c3.y);
        ctx.closePath();
        ctx.stroke();
      }
      return toBitmap(offscreen);
    }

    drawTunnel(ctx, drawCover) {
      const key = 'tunnel' + (drawCover ? '-cover' : '') + (this.x !== 0 ? '-flipped' : '');

      if (!drawCover) {
        // Hide everything above the top edges of the board (the train waits up there)
        ctx.fillStyle = COLORS.bg;
        ctx.beginPath();
        ctx.moveTo(-4000, 180 + 4690 * (420 / 690));
        ctx.lineTo(690, 180);
        ctx.lineTo(5380, 180 + 4690 * (420 / 690));
        ctx.lineTo(5380, -4000);
        ctx.lineTo(-4000, -4000);
        ctx.closePath();
        ctx.fill();
      }

      const sprite = state.graphics[key];
      if (sprite) ctx.drawImage(sprite, this.pixelPos.x, this.pixelPos.y - TUNNEL_PAD, 264, 184 + TUNNEL_PAD);
    }

    drawRail(ctx, pos, rotateCount) {
      const c = this.getCorners(rotateCount);
      const p1 = this.getPosLine(c.c2, c.c1, pos);
      const p2 = this.getPosLine(c.c3, c.c4, pos);

      ctx.lineWidth = 6;
      ctx.strokeStyle = COLORS.railShadow;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.strokeStyle = COLORS.rail;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y - 4);
      ctx.lineTo(p2.x, p2.y - 4);
      ctx.stroke();
    }

    drawRailCorner(ctx, pos, rotateCount) {
      const c = this.getCorners(rotateCount);
      const p1 = this.getPosLine(c.c3, c.c4, pos);
      const p2 = this.getPosLine(c.c3, c.c2, pos);
      const p3 = this.getPosLine(c.c2, c.c1, pos);
      const control = this.getPosLine(p1, p3, pos);

      ctx.lineWidth = 6;
      ctx.strokeStyle = COLORS.railShadow;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(control.x, control.y, p2.x, p2.y);
      ctx.stroke();

      ctx.strokeStyle = COLORS.rail;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y - 4);
      ctx.quadraticCurveTo(control.x, control.y - 4, p2.x, p2.y - 4);
      ctx.stroke();
    }

    // Returns null when the train cannot continue on this tile (derailment)
    getTrainCartInfo(tileProgress, isLocomotive) {
      let g1 = null;
      let r = 0;
      const d = isLocomotive ? state.train.dir : this.setDir;
      const T = TileTypes;
      const D = Directions;

      if (this.type === T.upleft && d === D.right) {
        g1 = this.drawCornerPos(true, 0, tileProgress);
        r = Math.round(mapRange(tileProgress, 0, 100, 45, 135));
      } else if (this.type === T.upleft && d === D.up) {
        g1 = this.drawCornerPos(false, 3, tileProgress);
        r = Math.round(mapRange(tileProgress, 0, 100, 315, 225));
      } else if (this.type === T.upright && d === D.left) {
        g1 = this.drawCornerPos(false, 2, tileProgress);
        r = Math.round(mapRange(tileProgress, 0, 100, 225, 135));
      } else if (this.type === T.upright && d === D.up) {
        g1 = this.drawCornerPos(true, 3, tileProgress);
        r = Math.round(mapRange(tileProgress, 0, 100, 315, 405));
        if (r > 360) r -= 360;
      } else if (this.type === T.downright && d === D.down) {
        g1 = this.drawCornerPos(false, 1, tileProgress);
        r = Math.round(mapRange(tileProgress, 0, 100, 135, 45));
      } else if (this.type === T.downright && d === D.left) {
        g1 = this.drawCornerPos(true, 2, tileProgress);
        r = Math.round(mapRange(tileProgress, 0, 100, 225, 315));
      } else if (this.type === T.downleft && d === D.right) {
        g1 = this.drawCornerPos(false, 0, tileProgress);
        r = Math.round(mapRange(tileProgress, 0, 100, 45, -45));
        if (r < 0) r = 360 - Math.abs(r);
      } else if (this.type === T.downleft && d === D.down) {
        g1 = this.drawCornerPos(true, 1, tileProgress);
        r = Math.round(mapRange(tileProgress, 0, 100, 135, 225));
      } else if (this.type === T.vertical && (d === D.left || d === D.right)) {
        g1 = this.drawStraightPos(tileProgress, d);
        r = d === D.left ? 225 : 45;
      } else if (this.type === T.horizontal && (d === D.down || d === D.up)) {
        g1 = this.drawStraightPos(tileProgress, d);
        r = d === D.down ? 135 : 315;
      } else {
        return null;
      }

      return {
        x: g1.x - 83,
        y: g1.y - 111,
        rotation: clamp(r, 0, 360),
        isLocomotive: isLocomotive,
        progress: tileProgress,
        tile: this
      };
    }

    drawStraightPos(tileProgress, dir) {
      const add = dir === Directions.down || dir === Directions.left ? 0 : 2;
      const c = this.getCorners(this.type === TileTypes.horizontal ? add : add + 1);
      const p1 = this.getPosLine(c.c2, c.c1, 0.5);
      const p2 = this.getPosLine(c.c3, c.c4, 0.5);
      p1.x += this.pixelPos.x;
      p1.y += this.pixelPos.y;
      p2.x += this.pixelPos.x;
      p2.y += this.pixelPos.y;
      return this.getPosLine(p1, p2, tileProgress / 100);
    }

    drawCornerPos(alt, r, tileProgress) {
      const c = this.getCorners(r);
      const p1 = this.getPosLine(c.c1, c.c4, 0.5);
      const p2 = alt ? this.getPosLine(c.c3, c.c4, 0.5) : this.getPosLine(c.c1, c.c2, 0.5);
      const cp = this.getPosLine(p1, this.getPosLine(c.c2, c.c3, 0.5), 0.5);
      p1.x += this.pixelPos.x;
      p1.y += this.pixelPos.y;
      p2.x += this.pixelPos.x;
      p2.y += this.pixelPos.y;
      cp.x += this.pixelPos.x;
      cp.y += this.pixelPos.y;
      return this.getPosLineCorner(p1, p2, cp, tileProgress / 100);
    }

    getPosLine(p1, p2, percent) {
      return { x: lerp(percent, p1.x, p2.x), y: lerp(percent, p1.y, p2.y) };
    }

    getPosLineCorner(p1, p2, cp, t) {
      const q = (a, b, c) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
      return { x: q(p1.x, cp.x, p2.x), y: q(p1.y, cp.y, p2.y) };
    }
  }

  class GameMap {
    constructor(level, autoplay) {
      this.map = level.level;
      this.startPos = level.start;
      this.endPos = level.end;
      this.spare = level.spare;
      this.tileArr = [[], [], [], [], [], [], [], [], []];

      if (!autoplay) this.scramble();

      for (let i = 0; i < this.map.length; i++) {
        for (let j = 0; j < this.map[i].length; j++) {
          const tile = new Tile(j, i, this.map[i][j]);
          if (j === this.startPos.x && i === this.startPos.y) tile.locked = true;
          else if (j === this.endPos.x && i === this.endPos.y) tile.locked = true;
          this.tileArr[i].push(tile);
        }
      }
    }

    get startTile() { return this.tileArr[this.startPos.y][this.startPos.x]; }
    get endTile() { return this.tileArr[this.endPos.y][this.endPos.x]; }

    scramble() {
      const tiles = [];
      for (let i = 1; i < this.map.length - 1; i++) {
        for (let j = 1; j < this.map[i].length - 1; j++) {
          if (this.map[i][j] !== TileTypes.blocker) tiles.push(this.map[i][j]);
        }
      }
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
      }
      let k = 0;
      for (let i = 1; i < this.map.length - 1; i++) {
        for (let j = 1; j < this.map[i].length - 1; j++) {
          if (this.map[i][j] !== TileTypes.blocker) this.map[i][j] = tiles[k++];
        }
      }
    }

    // World-space bounding box of everything that is drawn for this level
    bounds() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (tile, top) => {
        x0 = Math.min(x0, tile.pixelPos.x);
        x1 = Math.max(x1, tile.pixelPos.x + TILE_W);
        y0 = Math.min(y0, tile.pixelPos.y - top);
        y1 = Math.max(y1, tile.pixelPos.y + TILE_H);
      };
      for (let i = 1; i <= 6; i++) {
        for (let j = 1; j <= 6; j++) add(this.tileArr[i][j], 40);
      }
      add(this.startTile, 70);
      add(this.endTile, 0);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    draw(ctx) {
      for (let i = 0; i < this.tileArr.length; i++) {
        for (let j = 0; j < this.tileArr[i].length; j++) {
          const tile = this.tileArr[i][j];
          if (tile.type !== 0) tile.draw(ctx);
        }
      }
    }

    // Exact isometric hit test: which tile contains the world point?
    tileAt(wx, wy) {
      const u = (wx - 690) / 112;
      const v = (wy - 196) / 72;
      const x = Math.round((u + v) / 2);
      const y = Math.round((v - u) / 2);
      if (x < 0 || y < 0 || x > 7 || y > 7) return null;
      return this.tileArr[y][x] || null;
    }

    isSwappable(tile) {
      return !!tile && tile.x >= 1 && tile.x <= 6 && tile.y >= 1 && tile.y <= 6 &&
        !tile.locked && tile.type !== TileTypes.blocker && tile.type !== 0;
    }
  }

  const getNextTile = (tiles, t, dir) => {
    const T = TileTypes;
    const D = Directions;
    const row = y => tiles[y] || [];
    const result = { dir: dir, tile: null };

    if (t.type === T.vertical && dir === D.right) result.tile = row(t.y)[t.x + 1];
    if (t.type === T.vertical && dir === D.left) result.tile = row(t.y)[t.x - 1];
    if (t.type === T.horizontal && dir === D.down) result.tile = row(t.y + 1)[t.x];
    if (t.type === T.horizontal && dir === D.up) result.tile = row(t.y - 1)[t.x];

    if (t.type === T.upleft && dir === D.right) { result.tile = row(t.y + 1)[t.x]; result.dir = D.down; }
    if (t.type === T.downright && dir === D.down) { result.tile = row(t.y)[t.x + 1]; result.dir = D.right; }
    if (t.type === T.downleft && dir === D.right) { result.tile = row(t.y - 1)[t.x]; result.dir = D.up; }
    if (t.type === T.upleft && dir === D.up) { result.tile = row(t.y)[t.x - 1]; result.dir = D.left; }
    if (t.type === T.upright && dir === D.left) { result.tile = row(t.y + 1)[t.x]; result.dir = D.down; }
    if (t.type === T.upright && dir === D.up) { result.tile = row(t.y)[t.x + 1]; result.dir = D.right; }
    if (t.type === T.downleft && dir === D.down) { result.tile = row(t.y)[t.x - 1]; result.dir = D.left; }
    if (t.type === T.downright && dir === D.left) { result.tile = row(t.y - 1)[t.x]; result.dir = D.up; }

    return result;
  };

  /* ------------------------------------------------------------------
   * Speed and levels
   * ------------------------------------------------------------------ */
  const baseSpeed = () => mapRange(state.difficulty, 1, 100, 0, 1);
  const levelSpeed = () => baseSpeed() + Math.min(0.6, (state.level - 1) * 0.03);

  const startLevel = autoplay => {
    state.autoplay = autoplay;
    state.map = new GameMap(levelFactory.newLevel(), autoplay);
    const start = state.map.startTile;
    state.train = {
      tile: start,
      prevTiles: [],
      dir: state.map.startPos.x === 0 ? Directions.right : Directions.down,
      speed: autoplay ? baseSpeed() : levelSpeed()
    };
    // Give the player a head start while the train is still in the tunnel
    start.progress = autoplay ? 0 : -200;
    start.setDir = null;
    state.lastCarts = null;
    state.aim = null;
    state.hoverTile = null;
    updateLayout();
  };

  const setPhase = phase => {
    state.phase = phase;
    const b = document.body;
    b.classList.toggle('game--loading', phase === 'loading');
    b.classList.toggle('game--menu', phase === 'menu');
    b.classList.toggle('game--active', phase === 'playing');
    b.classList.toggle('game--paused', phase === 'paused');
    b.classList.toggle('game--win', phase === 'won');
    b.classList.toggle('game--over', phase === 'lost');
    b.classList.toggle('game--hud', phase !== 'menu' && phase !== 'loading');
    updateLayout();
  };

  const updateTexts = () => {
    ui.levelNum.textContent = state.level;
    ui.menuLevel.textContent = state.level;
    ui.menuBest.textContent = state.best;
    ui.menuBestWrap.hidden = state.best < 1;
    ui.btnReset.hidden = state.level <= 1;
    ui.btnPlay.textContent = state.level > 1 ? 'Continue' : 'Play';
    ui.speedValue.textContent = state.difficulty;
  };

  const playGame = () => {
    startLevel(false);
    setPhase('playing');
    updateTexts();
  };

  const gotoMenu = () => {
    startLevel(true);
    setPhase('menu');
    updateTexts();
  };

  const onWin = () => {
    const done = state.level;
    state.best = Math.max(state.best, done);
    state.level = done + 1;
    store.set('level', state.level);
    store.set('best', state.best);
    ui.winLevel.textContent = done;
    ui.winNext.textContent = state.level;
    setPhase('won');
  };

  const onLose = () => {
    ui.overLevel.textContent = state.level;
    setPhase('lost');
  };

  const finish = () => {
    if (state.phase === 'playing') state.train.speed = 7;
  };

  const pause = () => {
    if (state.phase === 'playing') {
      state.aim = null;
      setPhase('paused');
    }
  };

  const resume = () => {
    if (state.phase === 'paused') setPhase('playing');
  };

  /* ------------------------------------------------------------------
   * Layout: fill the whole viewport, board + side/bottom panel
   * ------------------------------------------------------------------ */
  const updateLayout = () => {
    if (!state.canvas) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    if (state.canvas.width !== Math.round(W * dpr) || state.canvas.height !== Math.round(H * dpr)) {
      state.canvas.width = Math.round(W * dpr);
      state.canvas.height = Math.round(H * dpr);
    }
    state.dpr = dpr;

    if (!state.map) return;
    const b = state.map.bounds();
    const showPanel = document.body.classList.contains('game--hud');
    const portrait = W < H * 1.15;
    const pad = Math.max(8, Math.min(W, H) * 0.02);
    document.body.classList.toggle('lay-bottom', portrait);
    document.body.classList.toggle('lay-side', !portrait);

    const fit = (aw, ah) => Math.min(aw / b.w, ah / b.h);
    let s, ox, oy;
    const panel = ui.panel.style;

    const modal = ui.modal;
    modal.style.top = '';
    if (!showPanel) {
      const mh = modal.offsetHeight;
      const sFull = fit(W - 2 * pad, H - 2 * pad);
      const sAbove = fit(W - 2 * pad, H - mh - 3 * pad);
      if (portrait && mh > 0 && sAbove > sFull * 0.8) {
        // tall screens: board above the ticket instead of hidden behind it
        s = sAbove;
        const bh = b.h * s;
        const top = Math.max(pad, (H - (bh + pad + mh)) / 2);
        ox = (W - b.w * s) / 2 - b.x * s;
        oy = top - b.y * s;
        modal.style.top = top + bh + pad + mh / 2 + 'px';
      } else {
        s = sFull;
        ox = (W - b.w * s) / 2 - b.x * s;
        oy = (H - b.h * s) / 2 - b.y * s;
      }
    } else if (portrait) {
      const ph = clamp(H * 0.23, 130, 210);
      const gap = pad;
      s = fit(W - 2 * pad, H - ph - gap - 2 * pad);
      const bh = b.h * s;
      const top = Math.max(pad, (H - (bh + gap + ph)) / 2);
      ox = (W - b.w * s) / 2 - b.x * s;
      oy = top - b.y * s;
      const pw = Math.min(W - 2 * pad, 520);
      panel.left = (W - pw) / 2 + 'px';
      panel.top = top + bh + gap + 'px';
      panel.width = pw + 'px';
      panel.height = ph + 'px';
    } else {
      const pw = clamp(W * 0.2, 180, 240);
      const gap = pad;
      s = fit(W - pw - gap - 2 * pad, H - 2 * pad);
      const bw = b.w * s;
      const left = Math.max(pad, (W - (pw + gap + bw)) / 2);
      ox = left + pw + gap - b.x * s;
      oy = (H - b.h * s) / 2 - b.y * s;
      const ph = Math.min(H - 2 * pad, 460);
      panel.left = left + 'px';
      panel.top = (H - ph) / 2 + 'px';
      panel.width = pw + 'px';
      panel.height = ph + 'px';
    }

    state.viewTarget = { s, ox, oy };
    if (state.viewSnap) {
      state.view = { s, ox, oy };
      state.viewSnap = false;
    }

    // Spare piece canvas
    const sc = ui.spareCanvas;
    const r = sc.getBoundingClientRect();
    if (r.width > 0) {
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      if (sc.width !== w || sc.height !== h) {
        sc.width = w;
        sc.height = h;
      }
    }
  };

  const screenToWorld = (cx, cy) => ({
    x: (cx - state.view.ox) / state.view.s,
    y: (cy - state.view.oy) / state.view.s
  });

  /* ------------------------------------------------------------------
   * Drawing
   * ------------------------------------------------------------------ */
  const drawTrain = (ctx, cart) => {
    const sprites = state.graphics[cart.isLocomotive ? 'locSprites' : 'carSprites'];
    const sprite = sprites[Math.round(cart.rotation)] || sprites[sprites.length - 1];
    if (sprite) ctx.drawImage(sprite, cart.x, cart.y, 150, 150);
  };

  const diamondPath = (ctx, x, y) => {
    ctx.beginPath();
    ctx.moveTo(x + 112, y);
    ctx.lineTo(x + 224, y + 72);
    ctx.lineTo(x + 112, y + 144);
    ctx.lineTo(x, y + 72);
    ctx.closePath();
  };

  const drawPreview = (ctx, now) => {
    if (state.phase !== 'playing') return;
    const spare = state.graphics['tile-' + state.map.spare];
    let target = null;
    let ghost = null;

    if (state.aim) {
      target = state.aim.target;
      if (!target && state.aim.fromDock && state.aim.moved) ghost = state.aim.world;
    } else if (state.hoverTile) {
      target = state.hoverTile;
    }

    if (target && !state.map.isSwappable(target)) target = null;

    if (target) {
      const p = target.pixelPos;
      if (state.graphics.shadow) ctx.drawImage(state.graphics.shadow, p.x, p.y, TILE_W, TILE_H);
      ctx.save();
      ctx.strokeStyle = COLORS.yellow;
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(now / 160);
      ctx.lineWidth = 6;
      diamondPath(ctx, p.x, p.y);
      ctx.stroke();
      ctx.restore();
      if (spare) ctx.drawImage(spare, p.x, p.y - 72, TILE_W, TILE_H);
      ctx.save();
      ctx.strokeStyle = 'rgba(214, 255, 252, 0.9)';
      ctx.lineWidth = 4;
      diamondPath(ctx, p.x, p.y - 72);
      ctx.stroke();
      ctx.restore();
    } else if (ghost && spare) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.drawImage(spare, ghost.x - 112, ghost.y - 72 - 110, TILE_W, TILE_H);
      ctx.restore();
    }
  };

  const drawSpare = now => {
    const c = ui.spareCanvas;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!state.map) return;
    const sprite = state.graphics['tile-' + state.map.spare];
    if (!sprite) return;
    const thick = 14;
    const sc = Math.min(c.width / (TILE_W + 20), c.height / (TILE_H + thick + 20));
    state.spareBump = Math.max(0, state.spareBump - 0.06);
    const bounce = Math.sin(state.spareBump * Math.PI) * 10;
    const dragging = state.aim && state.aim.fromDock;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.scale(sc, sc);
    ctx.translate(-TILE_W / 2, -TILE_H / 2 - thick / 2 - bounce);
    ctx.globalAlpha = dragging ? 0.4 : 1;
    // tile thickness
    ctx.fillStyle = '#017a79';
    ctx.beginPath();
    ctx.moveTo(0, 72);
    ctx.lineTo(112, 144);
    ctx.lineTo(224, 72);
    ctx.lineTo(224, 72 + thick);
    ctx.lineTo(112, 144 + thick);
    ctx.lineTo(0, 72 + thick);
    ctx.closePath();
    ctx.fill();
    ctx.drawImage(sprite, 0, 0, TILE_W, TILE_H);
    ctx.globalAlpha = 1;
    void now;
  };

  const animateLoop = time => {
    requestAnimationFrame(animateLoop);
    if (!state.map) return;

    const delta = state.timing.last ? clamp(time - state.timing.last, 0, 50) : 16;
    state.timing.last = time;

    // ease the view towards its target (smooth when the level size changes)
    const k = 1 - Math.exp(-delta / 120);
    const v = state.view, t = state.viewTarget;
    v.s += (t.s - v.s) * k;
    v.ox += (t.ox - v.ox) * k;
    v.oy += (t.oy - v.oy) * k;

    const ctx = state.ctx;
    const dpr = state.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
    ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.ox, dpr * v.oy);

    const map = state.map;
    const train = state.train;
    const moving = state.phase === 'playing' || state.phase === 'menu' || state.phase === 'won';

    map.draw(ctx);

    if (!train.tile.setDir) train.tile.setDir = train.dir;

    if (moving && train.tile.progress >= 100) {
      const next = getNextTile(map.tileArr, train.tile, train.dir);
      if (next.tile) {
        train.tile.progress -= 100;
        train.prevTiles.unshift(train.tile);
        if (train.prevTiles.length > 2) train.prevTiles.pop();
        train.tile.setDir = train.dir;
        train.tile = next.tile;
        if (train.tile.type !== TileTypes.blocker) train.tile.locked = true;
        train.dir = next.dir;
        train.tile.setDir = null;
      }
    }

    map.endTile.drawGoal(ctx);
    map.startTile.drawTunnel(ctx, false);

    let carts = null;
    if (state.phase === 'lost') {
      carts = state.lastCarts;
    } else {
      const p0 = train.tile.progress;
      const loc = train.tile.getTrainCartInfo(p0, true);
      if (loc) {
        carts = [loc];
        let p = p0;
        let r = 0;
        for (let i = 0; i <= 1; i++) {
          p -= 76;
          if (p < 0) {
            p += 100;
            r += 1;
          }
          let cart = null;
          if (r === 0) cart = train.tile.getTrainCartInfo(p, false);
          else if (r <= train.prevTiles.length) cart = train.prevTiles[r - 1].getTrainCartInfo(p, false);
          if (cart) carts.push(cart);
        }
        carts.sort((a, b) => a.y - b.y);
        state.lastCarts = carts;
      } else if (state.phase === 'playing') {
        onLose();
        carts = state.lastCarts;
      } else if (state.phase === 'menu') {
        startLevel(true);
        return;
      }
    }

    if (carts) {
      for (let i = 0; i < carts.length; i++) {
        const c = carts[i];
        // carts still waiting outside the tunnel are hidden
        if (c.progress < 100 && !(c.tile === map.startTile && c.progress < 0)) drawTrain(ctx, c);
      }
    }

    // The whole train has entered the goal
    if (train.tile === map.endTile && train.tile.progress > 260) {
      if (state.phase === 'menu') {
        startLevel(true);
        return;
      }
      if (state.phase === 'playing') onWin();
    }

    map.startTile.drawTunnel(ctx, true);
    drawPreview(ctx, time);

    if (moving) {
      train.tile.progress += (train.speed * delta) / 8 + 0.03 * delta;
    }

    drawSpare(time);
  };

  /* ------------------------------------------------------------------
   * Input: tap a tile to swap it, or drag (from the board or from the
   * spare piece) and release over a tile.
   * ------------------------------------------------------------------ */
  const canvasPoint = e => {
    const rect = state.canvas.getBoundingClientRect();
    return screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  };

  const pickTarget = world => {
    const t = state.map.tileAt(world.x, world.y);
    return state.map.isSwappable(t) ? t : null;
  };

  const swapWith = tile => {
    if (!tile || !state.map.isSwappable(tile)) return;
    const map = state.map;
    map.tileArr[tile.y][tile.x] = new Tile(tile.x, tile.y, map.spare);
    map.spare = tile.type;
    state.spareBump = 1;
  };

  const beginAim = (e, fromDock) => {
    if (state.phase !== 'playing') return;
    if (state.aim) return;
    e.preventDefault();
    const world = canvasPoint(e);
    state.aim = {
      id: e.pointerId,
      fromDock,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      world,
      target: fromDock ? null : pickTarget(world)
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  };

  const moveAim = e => {
    if (state.phase !== 'playing') {
      state.hoverTile = null;
      return;
    }
    if (state.aim && state.aim.id === e.pointerId) {
      const a = state.aim;
      if (Math.hypot(e.clientX - a.sx, e.clientY - a.sy) > 6) a.moved = true;
      a.world = canvasPoint(e);
      a.target = pickTarget(a.world);
    } else if (!state.aim && e.pointerType === 'mouse') {
      state.hoverTile = pickTarget(canvasPoint(e));
    }
  };

  const endAim = e => {
    const a = state.aim;
    if (!a || a.id !== e.pointerId) return;
    state.aim = null;
    if (state.phase !== 'playing') return;
    a.world = canvasPoint(e);
    const target = pickTarget(a.world);
    if (target) swapWith(target);
    if (e.pointerType === 'mouse') state.hoverTile = pickTarget(a.world);
  };

  const cancelAim = e => {
    if (state.aim && state.aim.id === e.pointerId) state.aim = null;
  };

  const bindInput = () => {
    const cv = state.canvas;
    cv.addEventListener('pointerdown', e => beginAim(e, false));
    cv.addEventListener('pointermove', moveAim);
    cv.addEventListener('pointerup', endAim);
    cv.addEventListener('pointercancel', cancelAim);
    cv.addEventListener('pointerleave', e => {
      if (e.pointerType === 'mouse') state.hoverTile = null;
    });

    const sp = ui.spare;
    sp.addEventListener('pointerdown', e => beginAim(e, true));
    sp.addEventListener('pointermove', moveAim);
    sp.addEventListener('pointerup', endAim);
    sp.addEventListener('pointercancel', cancelAim);

    document.addEventListener('contextmenu', e => e.preventDefault());

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (state.phase === 'playing') pause();
        else if (state.phase === 'paused') resume();
      } else if (e.key === 'f' || e.key === 'F') {
        finish();
      }
    });

    ui.btnPlay.addEventListener('click', playGame);
    ui.btnReset.addEventListener('click', () => {
      state.level = 1;
      store.set('level', 1);
      updateTexts();
    });
    ui.btnFinish.addEventListener('click', finish);
    ui.btnPause.addEventListener('click', pause);
    ui.btnResume.addEventListener('click', resume);
    ui.btnNext.addEventListener('click', playGame);
    ui.btnRetry.addEventListener('click', playGame);
    document.querySelectorAll('[data-action=menu]').forEach(btn => btn.addEventListener('click', gotoMenu));

    ui.slider.addEventListener('input', () => {
      state.difficulty = clamp(parseInt(ui.slider.value, 10) || 25, 1, 100);
      store.set('difficulty', state.difficulty);
      if (state.autoplay) state.train.speed = baseSpeed();
      updateTexts();
    });

    window.addEventListener('resize', updateLayout);
    window.addEventListener('orientationchange', () => setTimeout(updateLayout, 120));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause();
      state.timing.last = 0;
    });
  };

  /* ------------------------------------------------------------------
   * Loading
   * ------------------------------------------------------------------ */
  const getQuality = () => {
    let score = 0;
    const table = [3, 4, 6, 8];
    if (!window.createImageBitmap) score += 1;
    if (!navigator.deviceMemory || navigator.deviceMemory < 8) score += 1;
    if (window.matchMedia('(max-width: 760px)').matches) score += 1;
    return table[score];
  };

  const loadTileSprites = () => {
    const t = new Tile(0, 0, 0);
    const jobs = [];
    const put = (key, p) => jobs.push(p.then(s => { state.graphics[key] = s; }));
    [1, 2, 3, 4, 5, 6, 9].forEach(type => {
      put('tile-' + type, t.makeSprite(type, false));
      put('tile-' + type + '-locked', t.makeSprite(type, true));
    });
    put('shadow', t.makeSprite(TileTypes.shadow, false));
    put('goal0', t.makeGoalSprite(0));
    put('goal1', t.makeGoalSprite(1));
    put('tunnel', t.makeTunnelSprite(false, false));
    put('tunnel-flipped', t.makeTunnelSprite(false, true));
    put('tunnel-cover', t.makeTunnelSprite(true, false));
    put('tunnel-cover-flipped', t.makeTunnelSprite(true, true));
    return Promise.all(jobs);
  };

  const expand = (results, quality) => {
    const out = [];
    for (let i = 0; i < results.length; i++) {
      for (let j = 0; j < quality; j++) out.push(results[i]);
    }
    return out;
  };

  const load = () => {
    const $ = id => document.getElementById(id);
    state.canvas = $('board');
    state.ctx = state.canvas.getContext('2d');
    Object.assign(ui, {
      panel: $('panel'),
      modal: document.querySelector('.modal'),
      spare: $('spare'),
      spareCanvas: $('spareCanvas'),
      levelNum: $('levelNum'),
      btnFinish: $('btnFinish'),
      btnPause: $('btnPause'),
      btnPlay: $('btnPlay'),
      btnReset: $('btnReset'),
      btnResume: $('btnResume'),
      btnNext: $('btnNext'),
      btnRetry: $('btnRetry'),
      slider: $('speed'),
      speedValue: $('speedValue'),
      menuLevel: $('menuLevel'),
      menuBest: $('menuBest'),
      menuBestWrap: $('menuBestWrap'),
      winLevel: $('winLevel'),
      winNext: $('winNext'),
      overLevel: $('overLevel')
    });

    state.level = Math.max(1, parseInt(store.get('level', '1'), 10) || 1);
    state.best = Math.max(0, parseInt(store.get('best', '0'), 10) || 0);
    state.difficulty = clamp(parseInt(store.get('difficulty', '25'), 10) || 25, 1, 100);
    ui.slider.value = state.difficulty;
    updateTexts();
    updateLayout();

    const quality = getQuality();
    const sprites = puzzleSpritesFactory(quality);

    loadTileSprites()
      .then(() => Promise.all(sprites.carPromises))
      .then(res => { state.graphics.carSprites = expand(res, quality); })
      .then(() => Promise.all(sprites.locPromises))
      .then(res => { state.graphics.locSprites = expand(res, quality); })
      .then(() => {
        bindInput();
        state.viewSnap = true;
        startLevel(true);
        setPhase('menu');
        updateTexts();
        requestAnimationFrame(animateLoop);
      })
      .catch(err => console.error(err));
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
