"use client";

import { useEffect, useRef, useState } from "react";

type Props = { file: File; onCancel: () => void; onApply: (portraitDataUrl: string) => void };

export function PortraitCropper({ file, onCancel, onApply }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState("");
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => setSource(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }, [file]);

  useEffect(() => {
    if (!source) return;
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      const targetAspect = canvas.width / canvas.height;
      const imageAspect = image.naturalWidth / image.naturalHeight;
      const baseWidth = imageAspect > targetAspect ? image.naturalHeight * targetAspect : image.naturalWidth;
      const baseHeight = imageAspect > targetAspect ? image.naturalHeight : image.naturalWidth / targetAspect;
      const sourceWidth = baseWidth / zoom;
      const sourceHeight = baseHeight / zoom;
      const sourceX = (image.naturalWidth - sourceWidth) * (positionX / 100);
      const sourceY = (image.naturalHeight - sourceHeight) * (positionY / 100);
      context.fillStyle = "#eee7d8";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    };
    image.src = source;
  }, [positionX, positionY, source, zoom]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return <div className="portrait-crop-backdrop" role="presentation">
    <section className="portrait-cropper" role="dialog" aria-modal="true" aria-labelledby="portrait-crop-title">
      <header><div><span className="eyebrow">Портрет персонажа</span><h3 id="portrait-crop-title">Выберите область изображения</h3></div><button type="button" aria-label="Закрыть кадрирование" onClick={onCancel}>×</button></header>
      <div className="portrait-crop-preview"><canvas ref={canvasRef} width={560} height={660}/></div>
      <div className="portrait-crop-controls">
        <label>По горизонтали<input aria-label="Положение портрета по горизонтали" type="range" min="0" max="100" value={positionX} onChange={(event) => setPositionX(Number(event.target.value))}/></label>
        <label>По вертикали<input aria-label="Положение портрета по вертикали" type="range" min="0" max="100" value={positionY} onChange={(event) => setPositionY(Number(event.target.value))}/></label>
        <label>Масштаб<input aria-label="Масштаб портрета" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}/></label>
      </div>
      <footer><button type="button" className="secondary" onClick={onCancel}>Отмена</button><button type="button" className="primary" disabled={!source} onClick={() => { const canvas = canvasRef.current; if (canvas) onApply(canvas.toDataURL("image/jpeg", .88)); }}>Применить портрет</button></footer>
    </section>
  </div>;
}
