
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Share2, X, Copy, Check } from 'lucide-react';
import { FieldBoundary, Point, ABLine } from '../types';

interface Props {
  boundaries: FieldBoundary[];
  activeBoundaryId: string | null;
  visibleBoundaryIds: Set<string>;
  abLine: ABLine | null;
  tractorPos: Point;
  machineWidth: number;
  onHeadingChange?: (newHeading: number) => void;
}

const FieldCanvas: React.FC<Props> = ({ boundaries, activeBoundaryId, visibleBoundaryIds, abLine, tractorPos, machineWidth, onHeadingChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isAdjustingHeading, setIsAdjustingHeading] = useState(false);
  const [isHoveringHandle, setIsHoveringHandle] = useState(false);
  const [handleScreenPos, setHandleScreenPos] = useState<{ x: number, y: number } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const activeBoundary = boundaries.find(b => b.id === activeBoundaryId);

  // Handle position logic: placed on the active line, ahead of the tractor
  const getHandlePosition = useCallback(() => {
    if (!abLine) return null;
    const headingRad = (abLine.heading * Math.PI) / 180;
    const uPerpX = Math.cos(headingRad);
    const uPerpY = Math.sin(headingRad);
    
    // Project tractor onto the grid
    const tractorPerpDist = tractorPos.x * uPerpX + tractorPos.y * uPerpY;
    const currentIndex = Math.round(tractorPerpDist / abLine.spacing);
    const lineOriginX = currentIndex * abLine.spacing * uPerpX;
    const lineOriginY = currentIndex * abLine.spacing * uPerpY;
    
    // Direction vector of the line
    const dirX = Math.sin(headingRad);
    const dirY = -Math.cos(headingRad);
    
    // Find projection of tractor on this specific line
    const t = (tractorPos.x - lineOriginX) * dirX + (tractorPos.y - lineOriginY) * dirY;
    
    // Place handle 40 units ahead of tractor projection
    const handleDist = t - 40; 
    
    return {
      x: lineOriginX + handleDist * dirX,
      y: lineOriginY + handleDist * dirY
    };
  }, [abLine, tractorPos]);

  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const canvasWidth = containerRef.current.clientWidth;
    const canvasHeight = containerRef.current.clientHeight;
    
    return {
      x: (screenX - rect.left - (canvasWidth / 2 + offset.x)) / zoom,
      y: (screenY - rect.top - (canvasHeight / 2 + offset.y)) / zoom
    };
  }, [offset, zoom]);

  const worldToScreen = useCallback((worldX: number, worldY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const canvasWidth = containerRef.current.clientWidth;
    const canvasHeight = containerRef.current.clientHeight;
    
    return {
      x: (worldX * zoom) + (canvasWidth / 2 + offset.x),
      y: (worldY * zoom) + (canvasHeight / 2 + offset.y)
    };
  }, [offset, zoom]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity;
    setZoom(z => {
      const newZoom = z * (1 + delta);
      return Math.max(0.05, Math.min(newZoom, 50));
    });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const handlePos = getHandlePosition();
    
    if (handlePos) {
      const dx = worldPos.x - handlePos.x;
      const dy = worldPos.y - handlePos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Threshold for handle click (20px in screen space)
      if (dist * zoom < 20) {
        setIsAdjustingHeading(true);
        return;
      }
    }

    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);

    // Update hover state for cursor
    const handlePos = getHandlePosition();
    if (handlePos) {
      const dx = worldPos.x - handlePos.x;
      const dy = worldPos.y - handlePos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isHovering = dist * zoom < 20;
      setIsHoveringHandle(isHovering);
      
      if (isHovering || isAdjustingHeading) {
        setHandleScreenPos(worldToScreen(handlePos.x, handlePos.y));
      } else {
        setHandleScreenPos(null);
      }
    }

    if (isAdjustingHeading && onHeadingChange) {
      const dx = worldPos.x - tractorPos.x;
      const dy = worldPos.y - tractorPos.y;
      let newHeading = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (newHeading < 0) newHeading += 360;
      onHeadingChange(newHeading);
      return;
    }

    if (!isDragging) return;

    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsAdjustingHeading(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      if (containerRef.current) {
        canvas.width = containerRef.current.clientWidth;
        canvas.height = containerRef.current.clientHeight;
      }
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      
      ctx.translate(canvas.width / 2 + offset.x, canvas.height / 2 + offset.y);
      ctx.scale(zoom, zoom);

      // 1. Draw All Visible Boundaries
      boundaries.forEach(b => {
        const isActive = b.id === activeBoundaryId;
        const isVisible = visibleBoundaryIds.has(b.id) || isActive;

        if (isVisible && b.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(b.points[0].x, b.points[0].y);
          b.points.forEach((p, i) => { if (i > 0) ctx.lineTo(p.x, p.y); });
          ctx.closePath();
          
          if (isActive) {
            ctx.fillStyle = 'rgba(34, 197, 94, 0.05)';
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 1.5 / zoom;
          } else {
            ctx.fillStyle = 'rgba(161, 161, 170, 0.03)';
            ctx.strokeStyle = 'rgba(113, 113, 122, 0.4)';
            ctx.lineWidth = 1 / zoom;
          }
          
          ctx.fill();
          ctx.stroke();
        }
      });

      // 2. Path Guidance & Grid (Always based on current tractor/abLine context)
      if (abLine) {
        const headingRad = (abLine.heading * Math.PI) / 180;
        const uPerpX = Math.cos(headingRad);
        const uPerpY = Math.sin(headingRad);
        const tractorPerpDist = tractorPos.x * uPerpX + tractorPos.y * uPerpY;
        const currentIndex = Math.round(tractorPerpDist / abLine.spacing);

        const perpX = uPerpX * abLine.spacing;
        const perpY = uPerpY * abLine.spacing;
        const lineLen = 3000;
        const dirX = Math.sin(headingRad) * lineLen;
        const dirY = -Math.cos(headingRad) * lineLen;

        for (let i = -60; i <= 60; i++) {
          const shiftX = perpX * i;
          const shiftY = perpY * i;
          
          ctx.beginPath();
          ctx.moveTo(shiftX - dirX, shiftY - dirY);
          ctx.lineTo(shiftX + dirX, shiftY + dirY);

          if (i === currentIndex) {
            ctx.strokeStyle = isAdjustingHeading ? '#fbbf24' : 'rgba(59, 130, 246, 0.9)';
            ctx.lineWidth = (isAdjustingHeading ? 5 : 3) / zoom;
            ctx.setLineDash([]);
          } else if (i > currentIndex && i <= currentIndex + 3) {
            ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
            ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([15 / zoom, 10 / zoom]);
          } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1 / zoom;
            ctx.setLineDash([5 / zoom, 20 / zoom]);
          }
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // 3. Rotation HUD (Around Tractor)
        if (isAdjustingHeading) {
          ctx.save();
          ctx.translate(tractorPos.x, tractorPos.y);
          
          // Background compass ring
          ctx.beginPath();
          ctx.arc(0, 0, 45 / zoom, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.2)';
          ctx.lineWidth = 10 / zoom;
          ctx.stroke();

          // Degree marks
          for (let i = 0; i < 360; i += 15) {
            const rad = (i * Math.PI) / 180;
            const inner = 40 / zoom;
            const outer = 50 / zoom;
            ctx.beginPath();
            ctx.moveTo(Math.sin(rad) * inner, -Math.cos(rad) * inner);
            ctx.lineTo(Math.sin(rad) * outer, -Math.cos(rad) * outer);
            ctx.strokeStyle = i % 90 === 0 ? '#fbbf24' : 'rgba(251, 191, 36, 0.4)';
            ctx.lineWidth = (i % 90 === 0 ? 2 : 1) / zoom;
            ctx.stroke();
          }

          // Numeric degree label
          ctx.fillStyle = '#fbbf24';
          ctx.font = `bold ${14 / zoom}px 'JetBrains Mono', monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(`${abLine.heading.toFixed(1)}°`, 0, -65 / zoom);

          ctx.restore();
        }

        // 4. Rotation Handle
        const handlePos = getHandlePosition();
        if (handlePos) {
          ctx.beginPath();
          ctx.arc(handlePos.x, handlePos.y, 8 / zoom, 0, Math.PI * 2);
          ctx.fillStyle = isAdjustingHeading ? '#fbbf24' : isHoveringHandle ? '#60a5fa' : '#3b82f6';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2 / zoom;
          ctx.stroke();

          // Handle Glow
          if (isHoveringHandle || isAdjustingHeading) {
            ctx.beginPath();
            ctx.arc(handlePos.x, handlePos.y, 12 / zoom, 0, Math.PI * 2);
            ctx.strokeStyle = isAdjustingHeading ? 'rgba(251, 191, 36, 0.4)' : 'rgba(59, 130, 246, 0.4)';
            ctx.lineWidth = 4 / zoom;
            ctx.stroke();
          }

          // Connector to Handle (visual guide)
          ctx.beginPath();
          ctx.moveTo(tractorPos.x, tractorPos.y);
          ctx.lineTo(handlePos.x, handlePos.y);
          ctx.setLineDash([4 / zoom, 4 / zoom]);
          ctx.strokeStyle = isAdjustingHeading ? 'rgba(251, 191, 36, 0.3)' : 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1 / zoom;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // 5. Draw Tractor
      ctx.save();
      ctx.translate(tractorPos.x, tractorPos.y);
      if (abLine) ctx.rotate((abLine.heading * Math.PI) / 180);

      ctx.fillStyle = '#ef4444';
      const tractorW = 6 / zoom;
      const tractorH = 10 / zoom;
      ctx.fillRect(-tractorW / 2, -tractorH / 2, tractorW, tractorH);

      ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
      const impW = machineWidth;
      ctx.fillRect(-impW / 2, 2 / zoom, impW, 2 / zoom);
      
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(-impW / 2, 2 / zoom, impW, 2 / zoom);

      ctx.beginPath();
      ctx.moveTo(0, -tractorH / 2);
      ctx.lineTo(0, -tractorH / 2 - 4 / zoom);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();

      ctx.restore();
      ctx.restore();
    };

    draw();

    return () => window.removeEventListener('resize', resizeCanvas);
  }, [boundaries, activeBoundaryId, visibleBoundaryIds, abLine, tractorPos, zoom, offset, machineWidth, isAdjustingHeading, isHoveringHandle, getHandlePosition]);

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const centerOnTractor = () => {
    setOffset({
      x: -tractorPos.x * zoom,
      y: -tractorPos.y * zoom
    });
  };

  const getShareLink = () => {
    if (!abLine) return '';
    const config = {
      heading: abLine.heading,
      spacing: abLine.spacing,
      name: activeBoundary?.name || 'Traçado AgroVision'
    };
    const base64 = btoa(JSON.stringify(config));
    return `${window.location.origin}${window.location.pathname}#share=${base64}`;
  };

  const handleCopy = () => {
    const link = getShareLink();
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full bg-zinc-950 overflow-hidden border border-zinc-800 rounded-xl select-none ${isAdjustingHeading ? 'cursor-alias' : isHoveringHandle ? 'cursor-pointer' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
      
      {/* Rotation Handle Tooltip */}
      {handleScreenPos && isHoveringHandle && !isAdjustingHeading && (
        <div 
          className="absolute pointer-events-none px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md shadow-2xl animate-in fade-in zoom-in-95 duration-100 z-30"
          style={{ 
            left: handleScreenPos.x, 
            top: handleScreenPos.y - 25, 
            transform: 'translate(-50%, -100%)' 
          }}
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 whitespace-nowrap">
            Ajustar Rumo da Linha AB
          </p>
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-full w-2 h-2 bg-zinc-900 border-r border-b border-zinc-700 rotate-45"></div>
        </div>
      )}

      <div 
        className="absolute top-4 right-4 flex flex-col gap-2 z-20"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button onClick={() => setZoom(z => Math.min(z * 1.5, 50))} className="w-10 h-10 bg-zinc-900/80 backdrop-blur-md border border-zinc-700 rounded-lg flex items-center justify-center hover:bg-zinc-800 text-white font-bold shadow-lg transition-colors">+</button>
        <button onClick={() => setZoom(z => Math.max(z / 1.5, 0.05))} className="w-10 h-10 bg-zinc-900/80 backdrop-blur-md border border-zinc-700 rounded-lg flex items-center justify-center hover:bg-zinc-800 text-white font-bold shadow-lg transition-colors">-</button>
        <button onClick={resetView} className="w-10 h-10 bg-zinc-900/80 backdrop-blur-md border border-zinc-700 rounded-lg flex items-center justify-center hover:bg-zinc-800 text-white text-[10px] font-black shadow-lg transition-colors">RST</button>
        <button onClick={centerOnTractor} className="w-10 h-10 bg-zinc-900/80 backdrop-blur-md border border-zinc-700 rounded-lg flex items-center justify-center hover:bg-zinc-800 text-white shadow-lg transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 12h3m12 0h3M12 3v3m0 12v3"/></svg>
        </button>
        <button 
          onClick={() => setShowShareModal(true)}
          disabled={!abLine}
          className="w-10 h-10 bg-blue-600 border border-blue-500 rounded-lg flex items-center justify-center hover:bg-blue-500 text-white shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Compartilhar Configuração"
        >
          <Share2 size={20} />
        </button>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-zinc-800">
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-400">Compartilhar Traçado</h3>
              <button onClick={() => setShowShareModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex flex-col items-center gap-6">
              <div className="bg-white p-3 rounded-xl shadow-inner">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(getShareLink())}`} 
                  alt="QR Code do Traçado"
                  className="w-40 h-40"
                />
              </div>
              
              <div className="w-full flex flex-col gap-2">
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest text-center">Link de Acesso</p>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={getShareLink()} 
                    className="flex-1 bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-[10px] font-mono text-zinc-400 truncate outline-none"
                  />
                  <button 
                    onClick={handleCopy}
                    className={`p-2 rounded-lg border transition-all ${copied ? 'bg-green-600 border-green-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}`}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              <div className="text-center">
                <p className="text-[11px] text-zinc-400 font-medium">
                  Este link contém as coordenadas, rumo ({abLine?.heading.toFixed(1)}°) e espaçamento ({abLine?.spacing}m) do traçado atual.
                </p>
              </div>
            </div>
            
            <div className="p-6 pt-0">
              <button 
                onClick={() => setShowShareModal(false)}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-[11px] font-black uppercase tracking-[0.1em] transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 flex gap-4 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800/50 text-[10px] font-mono text-zinc-400 shadow-xl flex gap-3">
          <span>POS: <span className="text-zinc-200">{tractorPos.x.toFixed(1)}, {tractorPos.y.toFixed(1)}</span></span>
          <span className="border-l border-zinc-800 pl-3">ZOOM: <span className="text-zinc-200">{zoom.toFixed(2)}x</span></span>
          <span className="border-l border-zinc-800 pl-3">PASS: <span className="text-zinc-200">{abLine ? Math.round((tractorPos.x * Math.cos((abLine.heading * Math.PI)/180) + tractorPos.y * Math.sin((abLine.heading * Math.PI)/180)) / abLine.spacing) : 0}</span></span>
        </div>
      </div>

      <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-sm px-3 py-1 rounded text-[9px] font-bold text-zinc-500 uppercase tracking-widest border border-zinc-800/30">
        Arraste o círculo azul para rotacionar • Arraste o mapa para mover
      </div>
    </div>
  );
};

export default FieldCanvas;
