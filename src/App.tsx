/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, DoorOpen, Footprints, RefreshCw, Flashlight, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';

// Constants
const SCARY_IMAGE_URL = 'https://images.weserv.nl/?url=i.redd.it/rmp99js1g5me1.png';
const PLAYER_SPEED = 3;
const SCAN_DURATION = 1500;
const PSST_CHANCE = 0.001; // 0.1% chance
const KNOCKING_CHANCE = 0.001; // 0.1% chance

const AUDIO_URLS = {
  PSST: 'https://dl.dropboxusercontent.com/scl/fi/tpfgz4596tc1e1hap9tob/mrstokes302-psst-whisper-sfx-418603-AudioTrimmer.com.mp3?rlkey=3h6f5u5j2dq686g1fge2katue&st=vo02xias&dl=1',
  KNOCKING: 'https://dl.dropboxusercontent.com/scl/fi/11pi9c9gkvanfo5aej50w/freesound_community-knock-on-door-86241.mp3?rlkey=mzeywzl2utlqpgkj66ipbeb3i&st=f86vm9jc&dl=1',
  JUMPSCARE: 'https://dl.dropboxusercontent.com/scl/fi/vrsup62f00s2nabig18e9/FNAF-4-Jumpscare-Sound-Effect-AudioTrimmer.com-1.mp3?rlkey=ynye0suradfm8wc1yhmfmps7q&st=kpmm3dym&dl=1',
  VICTORY: 'https://dl.dropboxusercontent.com/scl/fi/p3oakrk15x0tm2o4fbyqi/FNAF_-Kids-Cheering-Gaming-Sound-Effect-HD.mp3?rlkey=quven4d1izjmm7kyk3p616rcu&st=dgb9rxp3&dl=1'
};

type Point = { x: number; y: number };

export default function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [floor, setFloor] = useState(1);
  const [playerPos, setPlayerPos] = useState<Point>({ x: 60, y: 60 });
  const [entities, setEntities] = useState<Point[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isJumpscared, setIsJumpscared] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [isSecretWin, setIsSecretWin] = useState(false);
  const [maze, setMaze] = useState<number[][]>([]);
  const [doorPos, setDoorPos] = useState<Point>({ x: 0, y: 0 });
  const [psstActive, setPsstActive] = useState(false);
  const [knockingActive, setKnockingActive] = useState(false);
  const [cellSize, setCellSize] = useState(40);
  const [mazeSize, setMazeSize] = useState(20);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [isJoystickActive, setIsJoystickActive] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerPosRef = useRef<Point>({ x: 60, y: 60 });
  const requestRef = useRef<number>(null);
  const keys = useRef<{ [key: string]: boolean }>({});
  const psstActiveRef = useRef(false);
  const knockingActiveRef = useRef(false);
  const isScanningRef = useRef(false);
  const isJoystickActiveRef = useRef(false);
  const jumpscareAudioRef = useRef<HTMLAudioElement | null>(null);
  const victoryAudioRef = useRef<HTMLAudioElement | null>(null);
  const psstAudioRef = useRef<HTMLAudioElement | null>(null);
  const knockingAudioRef = useRef<HTMLAudioElement | null>(null);
  const victoryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const joystickRef = useRef({ x: 0, y: 0 });

  // Preload and unlock audio
  useEffect(() => {
    // Attempt to lock orientation to landscape
    const screenOrientation = screen.orientation as any;
    if (screenOrientation && screenOrientation.lock) {
      screenOrientation.lock('landscape').catch(() => {
        console.warn("Orientation lock failed. This is common in browsers without user gesture.");
      });
    }

    jumpscareAudioRef.current = new Audio(AUDIO_URLS.JUMPSCARE);
    victoryAudioRef.current = new Audio(AUDIO_URLS.VICTORY);
    psstAudioRef.current = new Audio(AUDIO_URLS.PSST);
    knockingAudioRef.current = new Audio(AUDIO_URLS.KNOCKING);

    const allAudios = [
      jumpscareAudioRef.current,
      victoryAudioRef.current,
      psstAudioRef.current,
      knockingAudioRef.current
    ];

    allAudios.forEach(audio => {
      audio.load();
    });

    const unlockAudio = () => {
      allAudios.forEach(audio => {
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
        }).catch(e => console.warn("Audio unlock failed for one track", e));
      });
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  const triggerJumpscare = useCallback(() => {
    // Show image immediately
    setIsJumpscared(true);
    
    // Play jumpscare sound immediately from preloaded ref
    if (jumpscareAudioRef.current) {
      jumpscareAudioRef.current.currentTime = 0;
      jumpscareAudioRef.current.volume = 1.0;
      jumpscareAudioRef.current.play().catch(e => {
        console.warn("Jumpscare audio failed to play.", e);
      });
    }
    
    setTimeout(() => {
      setIsJumpscared(false);
      setGameOver(true);
    }, 2000);
  }, []);

  // Victory logic for Floor 5
  useEffect(() => {
    if (gameWon) {
      // Play victory sound
      if (victoryAudioRef.current) {
        victoryAudioRef.current.currentTime = 0;
        victoryAudioRef.current.volume = 0.8;
        victoryAudioRef.current.play().catch(e => console.warn("Victory audio failed", e));
      }

      // Fire confetti from bottom left and right
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 300 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        // since particles fall down, start from bottom
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: 0.7 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: 0.7 } });
      }, 250);

      // Start jumpscare timer (5 seconds)
      victoryTimerRef.current = setTimeout(() => {
        if (gameWon && !gameOver) {
          triggerJumpscare();
        }
      }, 5000);
    }

    return () => {
      if (victoryTimerRef.current) clearTimeout(victoryTimerRef.current);
    };
  }, [gameWon, gameOver, triggerJumpscare]);

  // Sync refs with state for the sound logic
  useEffect(() => { psstActiveRef.current = psstActive; }, [psstActive]);
  useEffect(() => { knockingActiveRef.current = knockingActive; }, [knockingActive]);
  useEffect(() => { isScanningRef.current = isScanning; }, [isScanning]);

  // Separate effect for random sounds (0.1% chance every 100ms)
  useEffect(() => {
    if (!gameStarted || gameOver || gameWon || isJumpscared) return;
    
    const interval = setInterval(() => {
      if (isScanningRef.current) return; // Do not play when flashlight is active

      if (Math.random() < PSST_CHANCE && !psstActiveRef.current) {
        setPsstActive(true);
        if (psstAudioRef.current) {
          psstAudioRef.current.currentTime = 0;
          psstAudioRef.current.play().catch(() => {});
        }
        setTimeout(() => setPsstActive(false), 2000);
      }
      if (Math.random() < KNOCKING_CHANCE && !knockingActiveRef.current) {
        setKnockingActive(true);
        if (knockingAudioRef.current) {
          knockingAudioRef.current.currentTime = 0;
          knockingAudioRef.current.play().catch(() => {});
        }
        setTimeout(() => setKnockingActive(false), 3000);
      }
    }, 100); // Check every 100ms instead of every frame
    
    return () => clearInterval(interval);
  }, [gameStarted, gameOver, gameWon, isJumpscared]);

  // Maze Generation
  const generateMaze = useCallback((f: number) => {
    let width = 20;
    let height = 20;
    let currentCellSize = 40;

    // Floor-specific maze logic
    if (f === 1) { width = 10; height = 10; currentCellSize = 80; }
    else if (f === 2) { width = 15; height = 15; currentCellSize = 53; }
    else if (f === 3) { width = 20; height = 20; currentCellSize = 40; }
    else if (f === 4) { width = 20; height = 20; currentCellSize = 40; }
    else if (f === 5) { width = 30; height = 30; currentCellSize = 26; }

    setCellSize(currentCellSize);
    setMazeSize(width);

    const newMaze = Array(height).fill(0).map(() => Array(width).fill(1));

    if (f === 4) {
      // Straight line for floor 4
      for (let i = 0; i < height; i++) newMaze[i][1] = 0;
    } else {
      const walk = (x: number, y: number) => {
        newMaze[y][x] = 0;
        const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]].sort(() => Math.random() - 0.5);
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && newMaze[ny][nx] === 1) {
            newMaze[y + dy / 2][x + dx / 2] = 0;
            walk(nx, ny);
          }
        }
      };
      walk(1, 1);
    }
    
    const door = f === 4 
      ? { x: 1 * currentCellSize + currentCellSize / 2, y: (height - 1) * currentCellSize + currentCellSize / 2 }
      : { x: (width - 2) * currentCellSize + currentCellSize / 2, y: (height - 2) * currentCellSize + currentCellSize / 2 };
    
    setMaze(newMaze);
    setDoorPos(door);
    const startPos = { x: currentCellSize * 1.5, y: currentCellSize * 1.5 };
    playerPosRef.current = startPos;
    setPlayerPos(startPos);
    
    // Prevent instant death during floor transition
    setIsTransitioning(true);
    setTimeout(() => setIsTransitioning(false), 500);

    // Entities (Spawn far from player and door)
    if (f < 5) {
      const newEntities: Point[] = [];
      let attempts = 0;
      while (newEntities.length < 1 && attempts < 100) {
        const ex = Math.random() * width * currentCellSize;
        const ey = Math.random() * height * currentCellSize;
        
        const distToPlayer = Math.sqrt(Math.pow(ex - startPos.x, 2) + Math.pow(ey - startPos.y, 2));
        const distToDoor = Math.sqrt(Math.pow(ex - door.x, 2) + Math.pow(ey - door.y, 2));
        
        // Spawn at least 300 units away from player and 200 from door
        if (distToPlayer > 300 && distToDoor > 200) {
          newEntities.push({ x: ex, y: ey });
        }
        attempts++;
      }
      setEntities(newEntities);
    } else {
      setEntities([]);
    }
  }, []);

  useEffect(() => {
    if (gameStarted) {
      generateMaze(floor);
    }
  }, [gameStarted, floor, generateMaze]);

  const update = useCallback(() => {
    if (gameOver || gameWon || isJumpscared || maze.length === 0 || !maze[0]) return;

    const oldX = playerPosRef.current.x;
    const oldY = playerPosRef.current.y;
    let dx = 0;
    let dy = 0;

    if (keys.current['w'] || keys.current['ArrowUp']) dy -= PLAYER_SPEED;
    if (keys.current['s'] || keys.current['ArrowDown']) dy += PLAYER_SPEED;
    if (keys.current['a'] || keys.current['ArrowLeft']) dx -= PLAYER_SPEED;
    if (keys.current['d'] || keys.current['ArrowRight']) dx += PLAYER_SPEED;

    // Joystick movement
    if (isJoystickActiveRef.current) {
      dx += joystickRef.current.x * PLAYER_SPEED;
      dy += joystickRef.current.y * PLAYER_SPEED;
    }

    // Collision Detection
    const radius = 10;
    const isWall = (tx: number, ty: number) => {
      const gx = Math.floor(tx / cellSize);
      const gy = Math.floor(ty / cellSize);
      if (gx < 0 || gy < 0 || gy >= maze.length || (maze[0] && gx >= maze[0].length)) return true;
      // Secret exit: allow passage to the top-left corner (0,0) on floor 5
      if (floor === 5 && gx <= 1 && gy <= 1) return false;
      return maze[gy][gx] === 1;
    };

    const checkCollision = (nx: number, ny: number) => {
      const corners = [
        { x: nx - radius, y: ny - radius },
        { x: nx + radius, y: ny - radius },
        { x: nx - radius, y: ny + radius },
        { x: nx + radius, y: ny + radius },
      ];
      return corners.some(c => isWall(c.x, c.y));
    };

    let finalX = oldX;
    let finalY = oldY;

    // Try moving X
    if (!checkCollision(oldX + dx, oldY)) {
      finalX = oldX + dx;
    } else if (floor === 5 && !isTransitioning) {
      // Safe zone at the start (top-left) to prevent instant death and allow secret exit
      const gx = Math.floor(oldX / cellSize);
      const gy = Math.floor(oldY / cellSize);
      if (gx > 2 || gy > 2) {
        triggerJumpscare();
        return;
      }
    }

    // Try moving Y
    if (!checkCollision(finalX, oldY + dy)) {
      finalY = oldY + dy;
    } else if (floor === 5 && !isTransitioning) {
      const gx = Math.floor(finalX / cellSize);
      const gy = Math.floor(oldY / cellSize);
      if (gx > 2 || gy > 2) {
        triggerJumpscare();
        return;
      }
    }

    playerPosRef.current = { x: finalX, y: finalY };
    setPlayerPos({ x: finalX, y: finalY });
    
    // Secret Exit Check (Floor 5 only)
    if (floor === 5 && Math.floor(finalX / cellSize) === 0 && Math.floor(finalY / cellSize) === 0) {
      setIsSecretWin(true);
      setGameWon(true);
      return;
    }

    // Door Check
    const distToDoor = Math.sqrt(Math.pow(finalX - doorPos.x, 2) + Math.pow(finalY - doorPos.y, 2));
    if (distToDoor < cellSize * 0.8) {
      if (floor < 5) {
        setFloor(f => f + 1);
      } else {
        setGameWon(true);
      }
      return;
    }

    // Update Entities
    if (floor < 5) {
      setEntities((prev) => prev.map(e => {
        const dx = playerPosRef.current.x - e.x;
        const dy = playerPosRef.current.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Floor-based speeds
        let speed = 0.2;
        if (floor === 2) speed = 0.3;
        if (floor === 3) speed = 0.5;
        if (floor === 4) speed = 0.7;
        
        // If too close, jumpscare
        if (dist < 25) {
          triggerJumpscare();
        }

        return {
          x: e.x + (dx / dist) * speed,
          y: e.y + (dy / dist) * speed
        };
      }));
    }

    requestRef.current = requestAnimationFrame(update);
  }, [gameOver, gameWon, isJumpscared, maze, floor, doorPos, cellSize, triggerJumpscare, isTransitioning]);

  useEffect(() => {
    if (gameStarted) {
      requestRef.current = requestAnimationFrame(update);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameStarted, update]);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      if (e.code === 'Space' && !isScanning) {
        triggerScan();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isScanning]);

  const triggerScan = () => {
    if (!isScanning) {
      setIsScanning(true);
      setTimeout(() => setIsScanning(false), SCAN_DURATION);
    }
  };

  const handleJoystickStart = (e: React.TouchEvent | React.MouseEvent) => {
    isJoystickActiveRef.current = true;
    setIsJoystickActive(true);
    handleJoystickMove(e);
  };

  const handleJoystickMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isJoystickActiveRef.current) return;
    const touch = 'touches' in e ? e.touches[0] : e;
    const joystickElement = document.getElementById('joystick-base');
    if (!joystickElement) return;

    const rect = joystickElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxRadius = rect.width / 2;
    
    const limitedDistance = Math.min(distance, maxRadius);
    const angle = Math.atan2(dy, dx);
    
    const x = Math.cos(angle) * limitedDistance;
    const y = Math.sin(angle) * limitedDistance;
    
    setJoystickPos({ x, y });
    joystickRef.current = { 
      x: (Math.cos(angle) * (limitedDistance / maxRadius)), 
      y: (Math.sin(angle) * (limitedDistance / maxRadius)) 
    };
  };

  const handleJoystickEnd = () => {
    isJoystickActiveRef.current = false;
    setIsJoystickActive(false);
    setJoystickPos({ x: 0, y: 0 });
    joystickRef.current = { x: 0, y: 0 };
  };

  // Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameStarted || maze.length === 0 || !maze[0]) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Maze
    ctx.fillStyle = '#2a2a2a'; // Brighter wall color
    ctx.strokeStyle = '#3a3a3a'; // Wall border
    ctx.lineWidth = 1;
    maze.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === 1) {
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      });
    });

    // Draw Door
    ctx.fillStyle = '#4ade80';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#4ade80';
    ctx.beginPath();
    ctx.arc(doorPos.x, doorPos.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Door Indicator Text
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', doorPos.x, doorPos.y - 20);

    // Lighting (Flashlight)
    const gradient = ctx.createRadialGradient(
      playerPos.x, playerPos.y, 0,
      playerPos.x, playerPos.y, isScanning ? 300 : 150 // Slightly larger flashlight
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.95)');

    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    // Draw Mini-map (Top Right)
    const mapScale = 0.25;
    const mapX = canvas.width - (maze[0].length * cellSize * mapScale) - 20;
    const mapY = 20;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(mapX - 5, mapY - 5, (maze[0].length * cellSize * mapScale) + 10, (maze.length * cellSize * mapScale) + 10);
    
    maze.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === 1) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.fillRect(mapX + x * cellSize * mapScale, mapY + y * cellSize * mapScale, cellSize * mapScale, cellSize * mapScale);
        }
      });
    });

    // Player on map
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(mapX + playerPos.x * mapScale, mapY + playerPos.y * mapScale, 2, 0, Math.PI * 2);
    ctx.fill();

    // Door on map
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(mapX + doorPos.x * mapScale, mapY + doorPos.y * mapScale, 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw Entities (only if scanning or very close)
    if (floor < 5) {
      entities.forEach(e => {
        const dist = Math.sqrt(Math.pow(e.x - playerPos.x, 2) + Math.pow(e.y - playerPos.y, 2));
        if (isScanning || dist < 100) {
          // Draw a faint scary face if scanning
          if (isScanning) {
            ctx.globalAlpha = 0.3;
            const img = new Image();
            img.src = SCARY_IMAGE_URL;
            ctx.drawImage(img, e.x - 20, e.y - 20, 40, 40);
            ctx.globalAlpha = 1.0;
          }
        }
      });
    }

    // Draw Player
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(playerPos.x, playerPos.y, 10, 0, Math.PI * 2);
    ctx.fill();

  }, [gameStarted, maze, playerPos, entities, isScanning, doorPos, floor]);

  const resetGame = () => {
    setFloor(1);
    setGameOver(false);
    setGameWon(false);
    setIsSecretWin(false);
    setGameStarted(false);
  };

  const handleStartGame = () => {
    // Attempt to lock orientation to landscape on user gesture
    const screenOrientation = screen.orientation as any;
    if (screenOrientation && screenOrientation.lock) {
      screenOrientation.lock('landscape').catch(() => {
        console.warn("Orientation lock failed on start.");
      });
    }
    setGameStarted(true);
  };

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black text-white p-8 font-mono">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl mb-8 tracking-widest uppercase text-red-600"
        >
          Insert Game Title
        </motion.h1>
        <div className="max-w-md text-center space-y-4 mb-12 opacity-80">
          <p>Navigate the maze. Very easy lol</p>
          <div className="flex justify-center gap-8 pt-4">
            <div className="flex flex-col items-center">
              <span className="text-xs opacity-50 mb-1">Move</span>
              <span className="border border-white/20 px-3 py-1 rounded">WASD</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs opacity-50 mb-1">Scan</span>
              <span className="border border-white/20 px-3 py-1 rounded">SPACE</span>
            </div>
          </div>
        </div>
        <button 
          onClick={handleStartGame}
          className="px-12 py-4 bg-red-900/20 border border-red-500/50 hover:bg-red-500 hover:text-black transition-all duration-500 rounded uppercase tracking-widest"
        >
          Enter Floor 1
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden flex items-center justify-center select-none touch-none">
      {/* Preload jumpscare image */}
      <img src={SCARY_IMAGE_URL} alt="" className="hidden" aria-hidden="true" referrerPolicy="no-referrer" />
      
      <div className="relative border-4 border-white/5 max-w-full max-h-full">
        <canvas 
          ref={canvasRef} 
          width={mazeSize * cellSize} 
          height={mazeSize * cellSize}
          className="bg-zinc-900 max-w-full max-h-screen object-contain"
        />
        
        {/* UI */}
        <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none z-50">
          <div className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-widest">
            <Footprints size={14} />
            <span>Floor {floor}</span>
          </div>
          {isScanning && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-blue-400 text-[10px] uppercase tracking-widest flex items-center gap-1"
            >
              <RefreshCw size={10} className="animate-spin" />
              Scanning...
            </motion.div>
          )}
        </div>

        {/* Mobile Controls */}
        {gameStarted && !gameOver && !gameWon && !isJumpscared && (
          <>
            {/* Joystick Left */}
            <div 
              className="absolute bottom-10 left-10 w-32 h-32 bg-white/10 rounded-full border border-white/20 flex items-center justify-center z-50 opacity-50"
              id="joystick-base"
              onTouchStart={handleJoystickStart}
              onTouchMove={handleJoystickMove}
              onTouchEnd={handleJoystickEnd}
              onMouseDown={handleJoystickStart}
              onMouseMove={handleJoystickMove}
              onMouseUp={handleJoystickEnd}
              onMouseLeave={handleJoystickEnd}
            >
              <motion.div 
                className="w-12 h-12 bg-white/30 rounded-full border border-white/40"
                animate={{ x: joystickPos.x, y: joystickPos.y }}
                transition={{ type: 'spring', damping: 15, stiffness: 200 }}
              />
            </div>

            {/* Flashlight Button Right */}
            <button 
              className="absolute bottom-10 right-10 w-24 h-24 bg-white/10 rounded-full border border-white/20 flex items-center justify-center z-50 opacity-50 active:scale-95 transition-transform"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                triggerScan();
              }}
            >
              <Flashlight className="text-white/50 w-8 h-8" />
              <span className="absolute -bottom-6 text-[10px] text-white/30 uppercase tracking-widest">Flashlight</span>
            </button>
          </>
        )}

        {/* Psst Notification (Sound only, no text as requested) */}

        {/* Jumpscare */}
        {isJumpscared && (
          <div className="absolute inset-0 z-[300] bg-black flex items-center justify-center overflow-hidden">
            <img 
              src={SCARY_IMAGE_URL} 
              className="w-full h-full object-cover"
              alt="JUMPSCARE"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </div>

      {/* Game Over / Win */}
      <AnimatePresence>
        {(gameOver || gameWon) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/95 z-[200] flex flex-col items-center justify-center text-white font-mono"
          >
            {gameWon && !isJumpscared && !gameOver && (
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center"
              >
                <div className="animate-bounce mb-4">
                  <Trophy className="text-yellow-400 w-24 h-24 drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]" />
                </div>
                <h2 className="text-7xl font-black mb-2 italic tracking-tighter text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.4)] text-center">
                  CONGRATULATIONS!
                </h2>
                <p className="text-white/60 text-sm uppercase tracking-[0.8em] mb-12">
                  You survived the depths
                </p>
              </motion.div>
            )}

            {(gameOver || (gameWon && (isJumpscared || gameOver))) && (
              <div className="flex flex-col items-center">
                <h2 className={`text-6xl mb-4 italic tracking-tighter ${gameWon && !isJumpscared && !isSecretWin ? 'text-green-500' : 'text-red-600'}`}>
                  {gameWon && !isJumpscared && !isSecretWin ? 'Escaped' : 'DEAD'}
                </h2>
                <p className="opacity-50 mb-12 uppercase tracking-widest text-xs text-center">
                  {gameWon && !isJumpscared && !isSecretWin ? 'You made it out of the maze.' : (isSecretWin ? 'The secret was a trap.' : `You died on Floor ${floor}.`)}
                </p>
                <button 
                  onClick={resetGame}
                  className="flex items-center gap-3 px-10 py-4 border border-white/10 hover:bg-white hover:text-black transition-all rounded uppercase text-[10px] tracking-[0.3em]"
                >
                  <RefreshCw size={14} /> Try Again
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
