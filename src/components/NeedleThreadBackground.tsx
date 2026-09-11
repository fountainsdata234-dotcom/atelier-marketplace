import React, { useEffect, useRef, useState } from 'react';

interface Point {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  age?: number;
}

interface NeedleThreadBackgroundProps {
  isDarkMode: boolean;
}

export const NeedleThreadBackground: React.FC<NeedleThreadBackgroundProps> = ({ isDarkMode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number; prevX: number; prevY: number; angle: number; isMoving: boolean; lastMoveTime: number }>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 400,
    y: typeof window !== 'undefined' ? window.innerHeight / 3 : 300,
    prevX: 400,
    prevY: 300,
    angle: -Math.PI / 4,
    isMoving: false,
    lastMoveTime: Date.now(),
  });

  const [interactiveMode, setInteractiveMode] = useState<boolean>(true);
  const stitchesRef = useRef<{ x: number; y: number; opacity: number }[]>([]);
  const threadNodesRef = useRef<Point[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Initialize thread nodes
    const nodeCount = 24;
    threadNodesRef.current = [];
    for (let i = 0; i < nodeCount; i++) {
      threadNodesRef.current.push({
        x: mouseRef.current.x,
        y: mouseRef.current.y + i * 4,
      });
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const mouse = mouseRef.current;
      const dx = e.clientX - mouse.x;
      const dy = e.clientY - mouse.y;
      
      if (Math.hypot(dx, dy) > 2) {
        mouse.angle = Math.atan2(dy, dx);
        mouse.prevX = mouse.x;
        mouse.prevY = mouse.y;
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.isMoving = true;
        mouse.lastMoveTime = Date.now();

        // Drop stitch puncture point occasionally
        if (Math.random() < 0.18) {
          stitchesRef.current.push({
            x: e.clientX,
            y: e.clientY,
            opacity: 0.85,
          });
          if (stitchesRef.current.length > 50) {
            stitchesRef.current.shift();
          }
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);

    let t = 0;

    const render = () => {
      t += 0.02;
      const mouse = mouseRef.current;

      // Gentle auto-float if user is idle
      const timeSinceMove = Date.now() - mouse.lastMoveTime;
      if (timeSinceMove > 1800) {
        mouse.isMoving = false;
        const autoDx = Math.cos(t * 0.8) * 1.5;
        const autoDy = Math.sin(t * 1.2) * 1.5;
        mouse.x += autoDx;
        mouse.y += autoDy;
        mouse.angle = Math.atan2(autoDy, autoDx);
      }

      ctx.clearRect(0, 0, width, height);

      // 1. Draw subtle woven fabric grid pattern
      const gridSize = 48;
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = isDarkMode ? 'rgba(255, 255, 255, 0.022)' : 'rgba(0, 0, 0, 0.035)';
      
      // Vertical weft threads
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      // Horizontal warp threads
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 2. Draw fabric puncture stitches
      stitchesRef.current.forEach((stitch) => {
        stitch.opacity -= 0.003;
        if (stitch.opacity > 0) {
          ctx.save();
          ctx.strokeStyle = isDarkMode 
            ? `rgba(217, 119, 6, ${stitch.opacity * 0.7})` 
            : `rgba(180, 83, 9, ${stitch.opacity * 0.6})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.arc(stitch.x, stitch.y, 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      });
      stitchesRef.current = stitchesRef.current.filter((s) => s.opacity > 0);

      // 3. Update thread physics (Verlet / Spring chain)
      const nodes = threadNodesRef.current;
      if (nodes.length > 0) {
        // First node pinned to needle eye (back end of needle)
        const needleLength = 34;
        const eyeX = mouse.x - Math.cos(mouse.angle) * (needleLength * 0.75);
        const eyeY = mouse.y - Math.sin(mouse.angle) * (needleLength * 0.75);
        
        nodes[0].x = eyeX;
        nodes[0].y = eyeY;

        for (let i = 1; i < nodes.length; i++) {
          const prev = nodes[i - 1];
          const curr = nodes[i];
          const dx = prev.x - curr.x;
          const dy = prev.y - curr.y;
          const dist = Math.hypot(dx, dy);
          const targetDist = 7;
          
          // Spring tension
          if (dist > targetDist) {
            const factor = (dist - targetDist) * 0.35;
            curr.x += (dx / dist) * factor;
            curr.y += (dy / dist) * factor + 0.3; // subtle gravity
          } else {
            curr.y += 0.2; // gravity drape
          }
        }

        // Draw flowing silk thread
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(nodes[0].x, nodes[0].y);
        for (let i = 1; i < nodes.length - 1; i++) {
          const xc = (nodes[i].x + nodes[i + 1].x) / 2;
          const yc = (nodes[i].y + nodes[i + 1].y) / 2;
          ctx.quadraticCurveTo(nodes[i].x, nodes[i].y, xc, yc);
        }
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Silk thread gradient
        const threadGrad = ctx.createLinearGradient(
          nodes[0].x, nodes[0].y,
          nodes[nodes.length - 1].x, nodes[nodes.length - 1].y
        );
        if (isDarkMode) {
          threadGrad.addColorStop(0, 'rgba(251, 191, 36, 0.95)');
          threadGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.75)');
          threadGrad.addColorStop(1, 'rgba(217, 119, 6, 0.15)');
        } else {
          threadGrad.addColorStop(0, 'rgba(180, 83, 9, 0.9)');
          threadGrad.addColorStop(0.5, 'rgba(217, 119, 6, 0.65)');
          threadGrad.addColorStop(1, 'rgba(245, 158, 11, 0.15)');
        }
        ctx.strokeStyle = threadGrad;
        ctx.stroke();

        // Thread shimmer sheen
        ctx.beginPath();
        ctx.moveTo(nodes[0].x, nodes[0].y);
        ctx.lineTo(nodes[3]?.x || nodes[0].x, nodes[3]?.y || nodes[0].y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.8)';
        ctx.stroke();
        ctx.restore();
      }

      // 4. Draw realistic metallic tailor needle
      ctx.save();
      ctx.translate(mouse.x, mouse.y);
      ctx.rotate(mouse.angle);

      const needleLen = 36;
      const needleWidth = 3;

      // Needle shadow
      ctx.save();
      ctx.shadowColor = isDarkMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.18)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;

      // Needle Body (Tapered)
      ctx.beginPath();
      ctx.moveTo(needleLen * 0.35, 0); // Sharp tip
      ctx.lineTo(-needleLen * 0.65, -needleWidth); // Top shoulder
      ctx.lineTo(-needleLen * 0.75, 0); // Rounded eye end
      ctx.lineTo(-needleLen * 0.65, needleWidth); // Bottom shoulder
      ctx.closePath();

      // Steel/Gold metallic gradient
      const needleGrad = ctx.createLinearGradient(
        needleLen * 0.35, 0,
        -needleLen * 0.75, 0
      );
      if (isDarkMode) {
        needleGrad.addColorStop(0, '#fef08a');
        needleGrad.addColorStop(0.3, '#f59e0b');
        needleGrad.addColorStop(0.7, '#e2e8f0');
        needleGrad.addColorStop(1, '#94a3b8');
      } else {
        needleGrad.addColorStop(0, '#cbd5e1');
        needleGrad.addColorStop(0.4, '#f1f5f9');
        needleGrad.addColorStop(0.8, '#d97706');
        needleGrad.addColorStop(1, '#64748b');
      }
      ctx.fillStyle = needleGrad;
      ctx.fill();
      ctx.restore();

      // Needle Eyelet (Oval hole for thread)
      ctx.beginPath();
      ctx.ellipse(-needleLen * 0.58, 0, 3.5, 1.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = isDarkMode ? '#0c0d10' : '#fbf9f5';
      ctx.fill();
      ctx.strokeStyle = isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Gleam highlight along needle shaft
      ctx.beginPath();
      ctx.moveTo(needleLen * 0.25, -0.6);
      ctx.lineTo(-needleLen * 0.4, -0.6);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isDarkMode]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
      <canvas ref={canvasRef} className="w-full h-full block" />
      
      {/* Interactive Needle Indicator Badge */}
      <div className="absolute top-20 right-4 pointer-events-auto hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full text-xs border backdrop-blur-md transition-all duration-200 opacity-60 hover:opacity-100 bg-neutral-900/40 text-amber-300 border-amber-500/20">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
        <span>Needle & Silk Thread Interactive</span>
      </div>
    </div>
  );
};
