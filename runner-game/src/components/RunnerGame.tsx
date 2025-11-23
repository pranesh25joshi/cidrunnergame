import { useState, useEffect, useRef, useCallback } from 'react';

// Game Constants
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const GROUND_HEIGHT = 50;
const OBSTACLE_SPEED = 6;
const SPAWN_RATE_MIN = 1200;
const SPAWN_RATE_MAX = 2000;
const CATCH_SPEED = 0.5; // Speed at which officers catch up
const STUMBLE_PENALTY = 100; // Pixels pushed back on hit

interface Entity {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
}

interface Jumper extends Entity {
    dy: number;
    grounded: boolean;
    jumpCount: number;
}

export default function RunnerGame() {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(0);
    const lastTimeRef = useRef(0);
    const spawnTimerRef = useRef(0);
    const nextSpawnTimeRef = useRef(1500);

    // Game State
    const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'WON' | 'LOST'>('START');
    const [distance, setDistance] = useState(0); // Distance between officers and thief
    const [isLandscape, setIsLandscape] = useState(true);
    const [isMuted, setIsMuted] = useState(false);

    // Entities Refs
    // Player controls Officers (Left side)
    const officers = useRef<Jumper>({
        x: 50, // Start on left
        y: 0,
        width: 60, // Combined width of 2 officers
        height: 60,
        color: '#3b82f6', // Blue
        dy: 0,
        grounded: false,
        jumpCount: 0
    });

    // AI controls Thief (Right side)
    const thief = useRef<Jumper>({
        x: 0, // Will be set relative to canvas width
        y: 0,
        width: 40,
        height: 60,
        color: '#ef4444', // Red
        dy: 0,
        grounded: false,
        jumpCount: 0
    });

    const obstacles = useRef<Entity[]>([]);

    // Assets
    const thiefImg = useRef<HTMLImageElement | null>(null);
    const officer1Img = useRef<HTMLImageElement | null>(null);
    const officer2Img = useRef<HTMLImageElement | null>(null);
    const bgMusic = useRef<HTMLAudioElement | null>(null);

    // Load Assets
    useEffect(() => {
        const tImg = new Image();
        tImg.src = '/thief.png';
        tImg.onload = () => thiefImg.current = tImg;

        const o1Img = new Image();
        o1Img.src = '/police1.png';
        o1Img.onload = () => officer1Img.current = o1Img;

        const o2Img = new Image();
        o2Img.src = '/police2.png';
        o2Img.onload = () => officer2Img.current = o2Img;

        const audio = new Audio('/pakad-mc.mp3');
        audio.loop = true;
        bgMusic.current = audio;
    }, []);

    // Resize & Orientation Handler
    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current && canvasRef.current) {
                const { width, height } = containerRef.current.getBoundingClientRect();
                canvasRef.current.width = width;
                canvasRef.current.height = height;

                setIsLandscape(width > height);

                // Reset Y positions
                const groundY = height - GROUND_HEIGHT;
                officers.current.y = groundY - officers.current.height;

                // Thief stays at ~80% width
                thief.current.x = width * 0.8;
                thief.current.y = groundY - thief.current.height;
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Toggle Mute
    const toggleMute = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent jump
        if (bgMusic.current) {
            bgMusic.current.muted = !bgMusic.current.muted;
            setIsMuted(bgMusic.current.muted);
            // Try to play if it was paused due to autoplay policy
            if (!bgMusic.current.muted && bgMusic.current.paused && gameState === 'PLAYING') {
                bgMusic.current.play().catch(err => console.log("Audio resume failed", err));
            }
        }
    };

    // Game Logic
    const startGame = () => {
        setGameState('PLAYING');
        obstacles.current = [];

        if (canvasRef.current) {
            const w = canvasRef.current.width;
            const h = canvasRef.current.height;
            const groundY = h - GROUND_HEIGHT;

            // Reset Positions
            officers.current.x = 50;
            officers.current.y = groundY - officers.current.height;
            officers.current.dy = 0;
            officers.current.grounded = true;
            officers.current.jumpCount = 0;

            thief.current.x = w * 0.8;
            thief.current.y = groundY - thief.current.height;
            thief.current.dy = 0;
            thief.current.grounded = true;
        }

        if (bgMusic.current) {
            // Only restart music if it's not already playing or if we are restarting from a non-playing state
            if (bgMusic.current.paused) {
                bgMusic.current.currentTime = 0;
                bgMusic.current.muted = isMuted;
                const playPromise = bgMusic.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        console.log("Audio play failed (Autoplay policy)", e);
                        setIsMuted(true);
                        if (bgMusic.current) bgMusic.current.muted = true;
                    });
                }
            }
        }
    };

    const jump = useCallback(() => {
        if (gameState !== 'PLAYING') return;

        // Double Jump Logic for Officers
        if (officers.current.grounded || officers.current.jumpCount < 2) {
            officers.current.dy = JUMP_FORCE;
            officers.current.grounded = false;
            officers.current.jumpCount++;
        }
    }, [gameState]);

    // Input Listeners
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                if (gameState === 'START' || gameState === 'WON' || gameState === 'LOST') startGame();
                else jump();
            }
        };

        const handleTouch = (e: TouchEvent) => {
            // Don't prevent default if touching a button (handled by stopPropagation)
            // But for general screen tap, we want to jump
            // e.preventDefault(); // Removed to allow button clicks to work properly
            if ((e.target as HTMLElement).closest('button')) return;

            if (gameState === 'START' || gameState === 'WON' || gameState === 'LOST') startGame();
            else jump();
        };

        window.addEventListener('keydown', handleKeyDown);
        const container = containerRef.current;
        if (container) {
            container.addEventListener('touchstart', handleTouch, { passive: false });
            container.addEventListener('mousedown', (e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                if (gameState === 'START' || gameState === 'WON' || gameState === 'LOST') startGame();
                else jump();
            });
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (container) {
                container.removeEventListener('touchstart', handleTouch);
            }
        };
    }, [gameState, jump]);

    // Game Loop
    const update = useCallback((time: number) => {
        if (gameState !== 'PLAYING') return;

        const deltaTime = time - lastTimeRef.current;
        lastTimeRef.current = time;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const groundY = height - GROUND_HEIGHT;

        // Clear
        ctx.clearRect(0, 0, width, height);

        // Draw Sky
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#1e293b'); // Dark Slate
        gradient.addColorStop(1, '#334155'); // Slate
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Draw Ground
        ctx.fillStyle = '#10b981'; // Emerald
        ctx.fillRect(0, groundY, width, GROUND_HEIGHT);

        // --- UPDATE OFFICERS (PLAYER) ---
        officers.current.dy += GRAVITY;
        officers.current.y += officers.current.dy;

        // Ground Collision
        if (officers.current.y + officers.current.height > groundY) {
            officers.current.y = groundY - officers.current.height;
            officers.current.dy = 0;
            officers.current.grounded = true;
            officers.current.jumpCount = 0;
        } else {
            officers.current.grounded = false;
        }

        // Move Officers forward (Catch mechanic)
        officers.current.x += CATCH_SPEED;

        // Win Condition: Catch Thief
        if (officers.current.x + officers.current.width >= thief.current.x) {
            setGameState('WON');
            if (bgMusic.current) bgMusic.current.pause();
            return;
        }

        // Lose Condition: Fall off screen
        if (officers.current.x + officers.current.width < 0) {
            setGameState('LOST');
            if (bgMusic.current) bgMusic.current.pause();
            return;
        }

        // Draw Officers
        if (officer1Img.current) {
            ctx.drawImage(officer1Img.current, officers.current.x, officers.current.y, 40, 60);
        } else {
            ctx.fillStyle = officers.current.color;
            ctx.fillRect(officers.current.x, officers.current.y, 40, 60);
        }

        if (officer2Img.current) {
            ctx.drawImage(officer2Img.current, officers.current.x + 30, officers.current.y + 5, 40, 60);
        } else {
            ctx.fillStyle = officers.current.color;
            ctx.fillRect(officers.current.x + 30, officers.current.y + 5, 40, 60);
        }

        // --- UPDATE THIEF (AI) ---
        thief.current.dy += GRAVITY;
        thief.current.y += thief.current.dy;

        if (thief.current.y + thief.current.height > groundY) {
            thief.current.y = groundY - thief.current.height;
            thief.current.dy = 0;
            thief.current.grounded = true;
        } else {
            thief.current.grounded = false;
        }

        // AI Jump Logic
        // Check for upcoming obstacles
        const upcomingObs = obstacles.current.find(obs =>
            obs.x > thief.current.x &&
            obs.x < thief.current.x + 150 // Look ahead distance
        );

        if (upcomingObs && thief.current.grounded) {
            thief.current.dy = JUMP_FORCE;
            thief.current.grounded = false;
        }

        // Draw Thief
        if (thiefImg.current) {
            ctx.drawImage(thiefImg.current, thief.current.x, thief.current.y, thief.current.width, thief.current.height);
        } else {
            ctx.fillStyle = thief.current.color;
            ctx.fillRect(thief.current.x, thief.current.y, thief.current.width, thief.current.height);
        }

        // --- OBSTACLES ---
        const dt = Math.min(deltaTime, 50);
        spawnTimerRef.current += dt;
        if (spawnTimerRef.current > nextSpawnTimeRef.current) {
            spawnTimerRef.current = 0;
            nextSpawnTimeRef.current = Math.random() * (SPAWN_RATE_MAX - SPAWN_RATE_MIN) + SPAWN_RATE_MIN;

            const obsHeight = Math.floor(Math.random() * (80 - 40 + 1)) + 40;
            obstacles.current.push({
                x: width,
                y: groundY - obsHeight,
                width: 30,
                height: obsHeight,
                color: '#78350f' // Amber 900
            });
        }

        for (let i = obstacles.current.length - 1; i >= 0; i--) {
            const obs = obstacles.current[i];
            obs.x -= OBSTACLE_SPEED;

            ctx.fillStyle = obs.color;
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

            // Collision with Officers
            const hitMargin = 5;
            if (
                officers.current.x + hitMargin < obs.x + obs.width - hitMargin &&
                officers.current.x + officers.current.width - hitMargin > obs.x + hitMargin &&
                officers.current.y + hitMargin < obs.y + obs.height - hitMargin &&
                officers.current.y + officers.current.height - hitMargin > obs.y + hitMargin
            ) {
                // Penalty: Push back
                officers.current.x -= STUMBLE_PENALTY;
                // Remove obstacle to prevent multi-hit
                obstacles.current.splice(i, 1);
                continue;
            }

            if (obs.x + obs.width < 0) {
                obstacles.current.splice(i, 1);
            }
        }

        // Update Distance UI
        setDistance(Math.floor(thief.current.x - officers.current.x));

        requestRef.current = requestAnimationFrame(update);
    }, [gameState]);

    useEffect(() => {
        if (gameState === 'PLAYING') {
            lastTimeRef.current = performance.now();
            requestRef.current = requestAnimationFrame(update);
        }
        return () => cancelAnimationFrame(requestRef.current!);
    }, [gameState, update]);

    return (
        <div ref={containerRef} className="relative w-full h-full bg-slate-900 overflow-hidden select-none font-sans">
            <canvas ref={canvasRef} className="block w-full h-full" />

            {/* Orientation Warning */}
            {!isLandscape && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 text-white p-8 text-center backdrop-blur-md">
                    <div>
                        <svg className="w-16 h-16 mx-auto mb-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        <h2 className="text-2xl font-bold mb-2">Please Rotate Device</h2>
                        <p>This game is best played in landscape mode.</p>
                    </div>
                </div>
            )}

            {/* HUD */}
            <div className="absolute top-8 left-8 right-8 flex justify-between items-start pointer-events-none" style={{ paddingTop: 'env(safe-area-inset-top)', paddingRight: 'env(safe-area-inset-right)', paddingLeft: 'env(safe-area-inset-left)' }}>
                {/* Distance */}
                <div className="glass-panel px-6 py-2 rounded-full flex items-center gap-3 animate-fade-in pointer-events-auto">
                    <span className="text-xs text-blue-200 uppercase font-bold tracking-wider">Target</span>
                    <span className={`text-2xl font-black tabular-nums tracking-tight ${distance < 200 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                        {distance}m
                    </span>
                </div>

                {/* Mute Button */}
                <button
                    onClick={toggleMute}
                    className="glass-panel p-3 rounded-full text-white hover:bg-white/10 active:scale-95 transition-all pointer-events-auto z-50"
                >
                    {isMuted ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                    ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                    )}
                </button>
            </div>

            {/* Start Screen */}
            {gameState === 'START' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-20 animate-fade-in">
                    <div className="text-center mb-12 animate-slide-up">
                        <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-400 drop-shadow-2xl mb-2 italic transform -skew-x-6">
                            COP CHASE
                        </h1>
                        <p className="text-blue-200 text-lg md:text-xl font-medium tracking-wide">
                            CATCH THE THIEF BEFORE HE ESCAPES!
                        </p>
                    </div>

                    <button
                        onClick={startGame}
                        className="group relative px-10 py-5 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full font-black text-2xl text-white shadow-lg shadow-blue-500/30 transition-all duration-300 transform hover:scale-110 hover:shadow-blue-500/50 active:scale-95 animate-pulse-glow"
                    >
                        <span className="relative z-10 flex items-center gap-3">
                            START CHASE
                        </span>
                    </button>

                    <div className="mt-8 text-slate-400 text-sm font-medium">
                        <p>Avoid obstacles to gain speed.</p>
                        <p>Hit obstacles and you fall back!</p>
                    </div>
                </div>
            )}

            {/* Won Screen */}
            {gameState === 'WON' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-900/90 backdrop-blur-md z-20 animate-fade-in">
                    <h2 className="text-6xl md:text-8xl font-black text-white drop-shadow-lg mb-4 transform -rotate-2">
                        BUSTED!
                    </h2>
                    <p className="text-2xl text-blue-200 mb-8">Target Apprehended</p>
                    <button
                        onClick={startGame}
                        className="px-10 py-4 bg-white text-blue-900 rounded-full font-black text-xl shadow-xl hover:bg-blue-50 transition-all transform hover:scale-105 active:scale-95"
                    >
                        CHASE AGAIN
                    </button>
                </div>
            )}

            {/* Lost Screen */}
            {gameState === 'LOST' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/90 backdrop-blur-md z-20 animate-fade-in">
                    <h2 className="text-6xl md:text-8xl font-black text-white drop-shadow-lg mb-4 transform rotate-2">
                        ESCAPED!
                    </h2>
                    <p className="text-2xl text-red-200 mb-8">Target Got Away</p>
                    <button
                        onClick={startGame}
                        className="px-10 py-4 bg-white text-red-900 rounded-full font-black text-xl shadow-xl hover:bg-red-50 transition-all transform hover:scale-105 active:scale-95"
                    >
                        RETRY MISSION
                    </button>
                </div>
            )}
        </div>
    );
}
