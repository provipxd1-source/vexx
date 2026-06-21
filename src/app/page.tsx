'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { io, Socket } from 'socket.io-client';
import { translations, Language } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  Pen,
  Eraser,
  Trash2,
  Undo2,
  Save,
  Sun,
  Moon,
  Languages,
  Palette,
  Users,
  Image as ImageIcon,
} from 'lucide-react';

interface DrawingData {
  id: string;
  title: string;
  author: string;
  imageData: string;
  width: number;
  height: number;
  createdAt: string;
}

interface StrokePoint {
  x: number;
  y: number;
  color: string;
  size: number;
  tool: 'pen' | 'eraser';
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

const COLOR_PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#D9D9D9', '#EFEFEF', '#F3F3F3', '#FFFFFF',
  '#980000', '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#4A86E8', '#0000FF', '#9900FF', '#FF00FF',
  '#E6B8AF', '#F4CCCC', '#FCE5CD', '#FFF2CC', '#D9EAD3', '#D0E0E3', '#C9DAF8', '#CFE2F3', '#D9D2E9', '#EAD1DC',
  '#DD7E6B', '#EA9999', '#F9CB9C', '#FFE599', '#B6D7A8', '#A2C4C9', '#A4C2F4', '#9FC5E8', '#B4A7D6', '#D5A6BD',
  '#CC4125', '#E06666', '#F6B26B', '#FFD966', '#93C47D', '#76A5AF', '#6D9EEB', '#6FA8DC', '#8E7CC3', '#C27BA0',
  '#A61C00', '#CC0000', '#E69138', '#F1C232', '#6AA84F', '#45818E', '#3C78D8', '#3D85C6', '#674EA7', '#A64D79',
  '#85200C', '#990000', '#B45F06', '#BF9000', '#38761D', '#134F5C', '#1155CC', '#0B5394', '#351C75', '#741B47',
  '#5B0F00', '#660000', '#783F04', '#7F6000', '#274E13', '#0C343D', '#1C4587', '#073763', '#20124D', '#4C1130',
];

export default function Home() {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);

  const [lang, setLang] = useState<Language>('vi');
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(4);
  const [drawings, setDrawings] = useState<DrawingData[]>([]);
  const [onlineCount, setOnlineCount] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveAuthor, setSaveAuthor] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('draw');
  const [viewImage, setViewImage] = useState<string | null>(null);

  const t = translations[lang];

  useEffect(() => {
    setMounted(true);
  }, []);

  const userIdRef = useRef(
    Math.random().toString(36).substring(2, 10) + Date.now().toString(36)
  );
  const sessionIdRef = useRef('global-room');

  // Connect to WebSocket (optional - graceful degrade)
  useEffect(() => {
    let socket: Socket | null = null;
    try {
      socket = io('/?XTransformPort=3003', {
        transports: ['websocket', 'polling'],
        timeout: 5000,
      });
    } catch {
      // WebSocket not available (e.g. on Vercel) - drawing still works
    }

    if (!socket) return;

    socket.on('connect', () => {
      console.log('Connected to draw service');
      socket.emit('join-session', { sessionId: sessionIdRef.current });
    });

    socket.on('session-joined', (data: { userCount: number }) => {
      setOnlineCount(data.userCount);
    });

    socket.on('user-count', (data: { count: number }) => {
      setOnlineCount(data.count);
    });

    socket.on('draw-stroke', (data: {
      type: 'start' | 'draw' | 'end';
      x: number; y: number;
      color: string; size: number;
      tool: 'pen' | 'eraser';
      userId: string;
      sessionId: string;
    }) => {
      if (data.userId === userIdRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (data.type === 'start') {
        ctx.beginPath();
        ctx.moveTo(data.x, data.y);
        ctx.lineWidth = data.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (data.tool === 'eraser') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = theme === 'dark' ? '#1e1e2e' : '#FFFFFF';
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = data.color;
        }
      } else if (data.type === 'draw') {
        ctx.lineTo(data.x, data.y);
        ctx.stroke();
      } else if (data.type === 'end') {
        ctx.closePath();
        ctx.globalCompositeOperation = 'source-over';
      }
    });

    socket.on('clear-canvas', (data: { userId: string; sessionId: string }) => {
      if (data.userId === userIdRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      fillCanvasBg(ctx, canvas.width, canvas.height);
    });

    socketRef.current = socket;

    return () => {
      try { socket?.disconnect(); } catch { /* ignore */ }
    };
  }, []);

  const getCanvasBg = useCallback(() => {
    return theme === 'dark' ? '#1e1e2e' : '#FFFFFF';
  }, [theme]);

  const fillCanvasBg = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = getCanvasBg();
    ctx.fillRect(0, 0, w, h);
  }, [getCanvasBg]);

  // Init canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mounted) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    fillCanvasBg(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStackRef.current = [imgData];
  }, [mounted, fillCanvasBg]);

  const saveUndoState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStackRef.current.push(imageData);
    if (undoStackRef.current.length > 30) {
      undoStackRef.current.shift();
    }
  }, []);

  // Repaint canvas when theme changes
  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    fillCanvasBg(ctx, canvas.width, canvas.height);
  }, [theme, mounted, fillCanvasBg]);

  const getCanvasPoint = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      let clientX: number, clientY: number;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const drawLine = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }, strokeColor: string, strokeSize: number, strokeTool: 'pen' | 'eraser') => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.lineWidth = strokeSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (strokeTool === 'eraser') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = getCanvasBg();
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = strokeColor;
      }

      ctx.stroke();
      ctx.closePath();
      ctx.globalCompositeOperation = 'source-over';
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      isDrawingRef.current = true;
      const point = getCanvasPoint(e);
      lastPointRef.current = point;

      const socket = socketRef.current;
      if (socket) {
        socket.emit('draw-stroke', {
          type: 'start',
          x: point.x,
          y: point.y,
          color,
          size: brushSize,
          tool,
          sessionId: sessionIdRef.current,
          userId: userIdRef.current,
        });
      }
    },
    [getCanvasPoint, color, brushSize, tool]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const point = getCanvasPoint(e);
      if (lastPointRef.current) {
        drawLine(lastPointRef.current, point, color, brushSize, tool);

        const socket = socketRef.current;
        if (socket) {
          socket.emit('draw-stroke', {
            type: 'draw',
            x: point.x,
            y: point.y,
            color,
            size: brushSize,
            tool,
            sessionId: sessionIdRef.current,
            userId: userIdRef.current,
          });
        }
      }
      lastPointRef.current = point;
    },
    [getCanvasPoint, drawLine, color, brushSize, tool]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    saveUndoState();

    const socket = socketRef.current;
    if (socket) {
      socket.emit('draw-stroke', {
        type: 'end',
        x: 0,
        y: 0,
        color,
        size: brushSize,
        tool,
        sessionId: sessionIdRef.current,
        userId: userIdRef.current,
      });
    }
  }, [color, brushSize, tool, saveUndoState]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fillWhite(ctx, canvas.width, canvas.height);
    saveUndoState();

    const socket = socketRef.current;
    if (socket) {
      socket.emit('clear-canvas', {
        sessionId: sessionIdRef.current,
        userId: userIdRef.current,
      });
    }
  }, [fillCanvasBg, saveUndoState]);

  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (undoStackRef.current.length > 1) {
      undoStackRef.current.pop();
      const prevState = undoStackRef.current[undoStackRef.current.length - 1];
      ctx.putImageData(prevState, 0, 0);
    }
  }, []);

  const fetchDrawings = useCallback(() => {
    try {
      const stored = localStorage.getItem('drawtogether_drawings');
      if (stored) {
        setDrawings(JSON.parse(stored));
      }
    } catch {
      // localStorage not available
    }
  }, []);

  const handleSave = async () => {
    if (!saveTitle.trim() || !saveAuthor.trim()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);

    try {
      const imageData = canvas.toDataURL('image/png');
      const newDrawing: DrawingData = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        title: saveTitle.trim(),
        author: saveAuthor.trim(),
        imageData,
        width: canvas.width,
        height: canvas.height,
        createdAt: new Date().toISOString(),
      };

      // Save to localStorage
      const stored = localStorage.getItem('drawtogether_drawings');
      const existing: DrawingData[] = stored ? JSON.parse(stored) : [];
      const updated = [newDrawing, ...existing].slice(0, 50);
      localStorage.setItem('drawtogether_drawings', JSON.stringify(updated));

      setDrawings(updated);
      toast({ title: t.saved });
      setSaveDialogOpen(false);
      setSaveTitle('');
      setSaveAuthor('');
    } catch {
      toast({ title: t.errorSave, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchDrawings();
  }, [fetchDrawings]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const canvasBg = getCanvasBg();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen flex flex-col bg-background">
        {/* Header */}
        <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 via-amber-400 to-emerald-400 flex items-center justify-center shrink-0">
                <Palette className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">{t.siteTitle}</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">{t.siteSubtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="secondary" className="hidden sm:flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {onlineCount} {t.onlineCount}
              </Badge>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}
                  >
                    <Languages className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t.language}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{theme === 'dark' ? t.lightMode : t.darkMode}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 sm:mb-6 w-full sm:w-auto grid grid-cols-2 sm:inline-grid">
              <TabsTrigger value="draw" className="gap-2">
                <Pen className="w-4 h-4" />
                {t.drawTab}
              </TabsTrigger>
              <TabsTrigger value="gallery" className="gap-2">
                <ImageIcon className="w-4 h-4" />
                {t.galleryTab}
              </TabsTrigger>
            </TabsList>

            {/* DRAW TAB */}
            <TabsContent value="draw">
              <div className="flex flex-col gap-3 sm:gap-4">
                {/* Toolbar - Always on top */}
                <div className="bg-card border border-border rounded-xl p-3 sm:p-4 space-y-3">
                  {/* Row 1: Tools + Brush Size + Save */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant={tool === 'pen' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTool('pen')}
                      className="gap-1.5"
                    >
                      <Pen className="w-4 h-4" />
                      {t.pen}
                    </Button>
                    <Button
                      variant={tool === 'eraser' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTool('eraser')}
                      className="gap-1.5"
                    >
                      <Eraser className="w-4 h-4" />
                      {t.eraser}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleUndo} className="gap-1.5">
                      <Undo2 className="w-4 h-4" />
                      {t.undo}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleClear} className="gap-1.5 text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                      {t.clearCanvas}
                    </Button>

                    <div className="w-px h-6 bg-border mx-1 hidden sm:block" />

                    {/* Brush Size - inline */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{t.brushSize}:</span>
                      <input
                        type="range"
                        min="1"
                        max="50"
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        className="w-20 sm:w-28 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <span className="text-xs text-muted-foreground font-mono w-8">{brushSize}px</span>
                      <div
                        className="rounded-full transition-all shrink-0"
                        style={{
                          width: Math.max(4, Math.min(brushSize, 20)),
                          height: Math.max(4, Math.min(brushSize, 20)),
                          backgroundColor: tool === 'eraser' ? 'var(--muted-foreground)' : color,
                        }}
                      />
                    </div>

                    <div className="flex-1" />

                    {/* Save Button */}
                    <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="gap-1.5" onClick={() => setSaveDialogOpen(true)}>
                          <Save className="w-4 h-4" />
                          {t.save}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t.saveDialogTitle}</DialogTitle>
                          <DialogDescription>{t.saveDialogDesc}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                          <div className="space-y-2">
                            <Label>{t.titlePlaceholder.replace('...', '')}</Label>
                            <Input
                              value={saveTitle}
                              onChange={(e) => setSaveTitle(e.target.value)}
                              placeholder={t.titlePlaceholder}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{t.authorPlaceholder.replace('...', '')}</Label>
                            <Input
                              value={saveAuthor}
                              onChange={(e) => setSaveAuthor(e.target.value)}
                              placeholder={t.authorPlaceholder}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                            {t.cancel}
                          </Button>
                          <Button onClick={handleSave} disabled={saving || !saveTitle.trim() || !saveAuthor.trim()}>
                            {saving ? '...' : <><Save className="w-4 h-4 mr-1" />{t.saveDrawing}</>}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {/* Row 2: Color Palette - horizontal scrollable */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold shrink-0">{t.colors}</span>
                      <div className="flex-1 overflow-x-auto pb-1">
                        <div className="flex gap-1 min-w-max">
                          {COLOR_PALETTE.map((c) => (
                            <button
                              key={c}
                              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md border-2 transition-all hover:scale-110 shrink-0 ${
                                color === c
                                  ? 'border-foreground scale-110 ring-2 ring-primary/30'
                                  : 'border-border hover:border-foreground/50'
                              }`}
                              style={{ backgroundColor: c }}
                              onClick={() => {
                                setColor(c);
                                setTool('pen');
                              }}
                              aria-label={`Color ${c}`}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-border">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => {
                            setColor(e.target.value);
                            setTool('pen');
                          }}
                          className="w-7 h-7 sm:w-8 sm:h-8 rounded cursor-pointer border-2 border-border"
                        />
                        <span className="text-[10px] sm:text-xs text-muted-foreground font-mono hidden sm:inline">{color}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Canvas */}
                <Card className="overflow-hidden border-border">
                  <CardContent className="p-2 sm:p-3">
                    <div className="relative w-full" style={{ paddingBottom: `${(CANVAS_HEIGHT / CANVAS_WIDTH) * 100}%` }}>
                      <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full rounded-lg cursor-crosshair touch-none shadow-lg"
                        style={{ backgroundColor: canvasBg }}
                        onMouseDown={handlePointerDown}
                        onMouseMove={handlePointerMove}
                        onMouseUp={handlePointerUp}
                        onMouseLeave={handlePointerUp}
                        onTouchStart={handlePointerDown}
                        onTouchMove={handlePointerMove}
                        onTouchEnd={handlePointerUp}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* GALLERY TAB */}
            <TabsContent value="gallery">
              <div className="mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold">{t.recentArtworks}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {drawings.length === 0 ? t.noArtworks : `${drawings.length} artworks`}
                </p>
              </div>

              {drawings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mb-4 opacity-40" />
                  <p className="text-lg font-medium">{t.noArtworks}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {drawings.map((drawing) => (
                    <Card key={drawing.id} className="overflow-hidden group hover:shadow-lg transition-shadow border-border">
                      <CardContent className="p-0">
                        <div className="relative">
                          <img
                            src={drawing.imageData}
                            alt={drawing.title}
                            className="w-full aspect-[4/3] object-contain bg-secondary/50"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 transition-opacity gap-1.5"
                              onClick={() => setViewImage(drawing.imageData)}
                            >
                              <ImageIcon className="w-4 h-4" />
                              {t.viewFull}
                            </Button>
                          </div>
                        </div>
                        <div className="p-4">
                          <h3 className="font-semibold text-sm sm:text-base truncate">{drawing.title}</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t.artworkBy} {drawing.author}
                          </p>
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            {new Date(drawing.createdAt).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </main>

        {/* Footer */}
        <footer className="border-t border-border bg-card/50 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>DrawTogether &copy; {new Date().getFullYear()}</span>
            <Badge variant="secondary" className="flex items-center gap-1 sm:hidden">
              <Users className="w-3 h-3" />
              {onlineCount}
            </Badge>
          </div>
        </footer>

        {/* Full Image View Dialog */}
        <Dialog open={!!viewImage} onOpenChange={(open) => !open && setViewImage(null)}>
          <DialogContent className="max-w-4xl p-2">
            {viewImage && (
              <img
                src={viewImage}
                alt="Full view"
                className="w-full rounded-lg"
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}