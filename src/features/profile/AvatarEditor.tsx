import { cssClass, cssStyle } from "../../shared/lib/css-styles";
import { MousePointer2, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeDismiss } from "../../shared/ui/dismissible-layer";

type Point = { x: number; y: number };

export function AvatarEditor({ file, busy, onCancel, onSave }: { file: File; busy: boolean; onCancel: () => void; onSave: (file: File) => Promise<void> }) {
  const [source, setSource] = useState("");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const dragStart = useRef<{ pointer: Point; position: Point } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  function minimumZoom(nextRotation = rotation) {
    const radians = (nextRotation * Math.PI) / 180;
    return Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians));
  }

  function clampPosition(nextPosition: Point, previewSize: number, zoomValue = zoom): Point {
    const image = imageRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) return nextPosition;
    const cover = Math.max(previewSize / image.naturalWidth, previewSize / image.naturalHeight) * zoomValue;
    const radians = (rotation * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const cropHalfSize = (previewSize / 2) * (Math.abs(cosine) + Math.abs(sine));
    const maxX = Math.max(0, (image.naturalWidth * cover) / 2 - cropHalfSize);
    const maxY = Math.max(0, (image.naturalHeight * cover) / 2 - cropHalfSize);
    const localX = Math.max(-maxX, Math.min(maxX, cosine * nextPosition.x + sine * nextPosition.y));
    const localY = Math.max(-maxY, Math.min(maxY, -sine * nextPosition.x + cosine * nextPosition.y));
    return { x: cosine * localX - sine * localY, y: sine * localX + cosine * localY };
  }

  useEscapeDismiss(!busy, onCancel);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSource(url);
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const previousOverflow = cssStyle(document.body).overflow;
    const previousOverscrollBehavior = cssStyle(document.body).overscrollBehavior;
    const previousDocumentOverflow = cssStyle(document.documentElement).overflow;
    const previousDocumentOverscrollBehavior = cssStyle(document.documentElement).overscrollBehavior;
    cssStyle(document.body).overflow = "hidden";
    cssStyle(document.body).overscrollBehavior = "none";
    cssStyle(document.documentElement).overflow = "hidden";
    cssStyle(document.documentElement).overscrollBehavior = "none";
    return () => {
      cssStyle(document.body).overflow = previousOverflow;
      cssStyle(document.body).overscrollBehavior = previousOverscrollBehavior;
      cssStyle(document.documentElement).overflow = previousDocumentOverflow;
      cssStyle(document.documentElement).overscrollBehavior = previousDocumentOverscrollBehavior;
    };
  }, []);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!event.deltaY || busy) return;
      const step = event.deltaY > 0 ? -0.08 : 0.08;
      const nextZoom = Math.min(3, Math.max(minimumZoom(), zoom + step));
      setZoom(nextZoom);
      setPosition((current) => clampPosition(current, preview.getBoundingClientRect().width, nextZoom));
    };
    preview.addEventListener("wheel", onWheel, { passive: false });
    return () => preview.removeEventListener("wheel", onWheel);
  }, [busy, rotation, zoom]);

  function movePreview(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || busy) return;
    const { pointer, position: initialPosition } = dragStart.current;
    setPosition(clampPosition({ x: initialPosition.x + event.clientX - pointer.x, y: initialPosition.y + event.clientY - pointer.y }, event.currentTarget.getBoundingClientRect().width));
  }

  function setRotationSafely(nextRotation: number) {
    setRotation(nextRotation);
    setZoom((current) => Math.max(current, minimumZoom(nextRotation)));
    setPosition({ x: 0, y: 0 });
  }

  async function save() {
    const image = imageRef.current;
    if (!image || !image.naturalWidth || !image.naturalHeight) return;

    const size = 512;
    const previewSize = image.parentElement?.getBoundingClientRect().width || 240;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return;

    const cover = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
    const positionScale = size / previewSize;
    context.translate(size / 2 + position.x * positionScale, size / 2 + position.y * positionScale);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(image, (-image.naturalWidth * cover) / 2, (-image.naturalHeight * cover) / 2, image.naturalWidth * cover, image.naturalHeight * cover);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (blob) await onSave(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
  }

  return createPortal(
    <div className="confirm-dialog-layer" role="presentation" onPointerDown={(event) => { if (!busy && event.target === event.currentTarget) onCancel(); }}>
      <section className="confirm-dialog avatar-editor" role="dialog" aria-modal="true" aria-label="Редактирование аватара">
        <div className="confirm-dialog-content">
          <div className="confirm-dialog-head"><h2>Настройте аватар</h2></div>
          <p>Перетащите фотографию, настройте масштаб и поворот. В профиль попадёт круглая область предпросмотра.</p>
          <div
            ref={previewRef}
            className="avatar-crop-preview"
            onPointerDown={(event) => {
              if (busy) return;
              dragStart.current = { pointer: { x: event.clientX, y: event.clientY }, position };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={movePreview}
            onPointerUp={() => { dragStart.current = null; }}
            onPointerCancel={() => { dragStart.current = null; }}
          >
            <img ref={imageRef} src={source} alt="Предпросмотр" draggable={false} className={cssClass({ transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${zoom})` })} />
          </div>
          <p className="avatar-editor-zoom-hint"><MousePointer2 size={16} />Наведите курсор на фото и прокрутите колесо, чтобы изменить масштаб.</p>
          <div className="avatar-editor-control">
            <div className="avatar-editor-control-head"><span><RotateCcw size={18} />Поворот</span><output>{rotation}°</output></div>
            <input aria-label="Поворот аватара" type="range" min="-180" max="180" step="1" value={rotation} onChange={(event) => setRotationSafely(Number(event.target.value))} />
          </div>
          <div className="confirm-dialog-actions"><button className="primary-button small" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Сохраняю…" : "Сохранить аватар"}</button><button className="ghost-button small" type="button" disabled={busy} onClick={onCancel}>Отмена</button></div>
        </div>
      </section>
    </div>,
    document.body
  );
}
