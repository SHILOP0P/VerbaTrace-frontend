import { cssClass } from "../lib/css-styles";
import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import type {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  ReactNode,
  SelectHTMLAttributes
} from "react";

export function Logo({ onClick }: { onClick?: () => void }) {
  const content = (
    <>
      <span className="logo-mark">
        <i />
        <i />
        <i />
        <i />
      </span>
      {/* Named so the narrowest headers can drop the wordmark and keep the mark:
          there the name and the buttons did not both fit and overlapped. */}
      <span className="logo-word">VerbaTrace</span>
    </>
  );

  if (onClick) {
    return (
      <button className="logo logo-button" type="button" onClick={onClick} aria-label="VerbaTrace">
        {content}
      </button>
    );
  }

  return (
    <div className="logo" aria-label="VerbaTrace">
      {content}
    </div>
  );
}

type SelectControlOption = {
  color?: string;
  disabled: boolean;
  key: string;
  label: string;
  value: string;
};

type SelectControlProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "size"> & {
  children: ReactNode;
  menuClassName?: string;
};

export function SelectControl({
  children,
  className,
  defaultValue,
  disabled,
  id,
  menuClassName,
  name,
  onChange,
  value,
  ...props
}: SelectControlProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(() => String(defaultValue ?? ""));
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  const options = useMemo(() => collectSelectOptions(children), [children]);
  const currentValue = value !== undefined ? String(value) : internalValue || options[0]?.value || "";
  const selectedOption = options.find((option) => option.value === currentValue) ?? options[0];
  const ariaLabel = props["aria-label"] ?? props.title ?? selectedOption?.label ?? "Выберите значение";

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      setPortalRoot(null);
      return;
    }
    const host = document.createElement("span");
    host.className = "app-shell select-menu-portal-root";
    document.body.appendChild(host);
    setPortalRoot(host);
    return () => {
      host.remove();
      setPortalRoot(null);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nav = document.querySelector('.mobile-bottom-nav')?.getBoundingClientRect();
      const bottom = nav && nav.height > 0 ? Math.min(window.innerHeight - 8, nav.top - 8) : window.innerHeight - 8;
      const desired = Math.min(320, menuRef.current?.scrollHeight || options.length * 40 + 12);
      const below = Math.max(0, bottom - rect.bottom - 6), above = Math.max(0, rect.top - 14);
      const useBelow = below >= Math.min(desired, 160) || below >= above;
      const maxHeight = Math.max(60, Math.min(320, useBelow ? below : above));
      const height = Math.min(desired, maxHeight);
      const width = Math.min(rect.width, window.innerWidth - 16);
      setMenuPosition({ top: useBelow ? rect.bottom + 6 : Math.max(8, rect.top - height - 6), left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width, maxHeight });
    }

    updateMenuPosition();
    const observer = new ResizeObserver(updateMenuPosition);
    if (menuRef.current) observer.observe(menuRef.current);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      observer.disconnect();
    };
  }, [open, portalRoot, options.length]);
  useLayoutEffect(() => {
    if (!open || !portalRoot) return;
    const selected = menuRef.current?.querySelector<HTMLButtonElement>('button[aria-selected="true"]:not(:disabled)');
    const first = menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    (selected ?? first)?.focus({preventScroll: true});
  }, [open, portalRoot]);

  function selectValue(nextValue: string) {
    if (disabled) return;

    if (value === undefined) {
      setInternalValue(nextValue);
    }

    onChange?.({
      currentTarget: { name, value: nextValue },
      target: { name, value: nextValue }
    } as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    triggerRef.current?.focus({preventScroll: true});
  }

  return (
    <span
      className={`select-control custom-select ${open ? "open" : ""} ${disabled ? "disabled" : ""} ${className ?? ""}`}
      ref={rootRef}
    >
      <button
        className="select-trigger"
        type="button"
        id={controlId}
        ref={triggerRef}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-describedby={props["aria-describedby"]}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="select-value">
          {selectedOption?.color && (
            <i
              className={["select-option-color", cssClass({ "--select-option-color": selectedOption.color } as CSSProperties)].filter(Boolean).join(" ")}

            />
          )}
          <span>{selectedOption?.label ?? "Не выбрано"}</span>
        </span>
      </button>
      {name && <input type="hidden" name={name} value={currentValue} />}
      {open && portalRoot && createPortal(
        <span
          className={[`select-menu select-menu-portal ${menuClassName ?? ""}`, cssClass({
            left: menuPosition.left,
            top: menuPosition.top,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
            overflowY: "auto",
            pointerEvents: "auto",
            position: "fixed",
            zIndex: 10001
          })].filter(Boolean).join(" ")}
          role="listbox"
          onKeyDown={event => {
            const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
            }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
          }}
          aria-labelledby={controlId}
          ref={menuRef}

        >
          {options.map((option) => (
            <button
              className={option.value === currentValue ? "active" : ""}
              disabled={option.disabled}
              key={option.key}
              role="option"
              type="button"
              aria-selected={option.value === currentValue}
              onClick={() => selectValue(option.value)}
            >
              {option.color && (
                <i
                  className={["select-option-color", cssClass({ "--select-option-color": option.color } as CSSProperties)].filter(Boolean).join(" ")}

                />
              )}
              <span>{option.label}</span>
            </button>
          ))}
        </span>,
        portalRoot
      )}
    </span>
  );
}

function collectSelectOptions(children: ReactNode): SelectControlOption[] {
  return Children.toArray(children).flatMap((child, index) => {
    if (!isValidElement(child)) return [];

    const optionProps = child.props as {
      "data-color"?: string;
      children?: ReactNode;
      disabled?: boolean;
      label?: string;
      value?: number | string;
    };
    const label = optionProps.label ?? textFromReactNode(optionProps.children);
    const optionValue = optionProps.value ?? label;

    return [{
      color: optionProps["data-color"],
      disabled: Boolean(optionProps.disabled),
      key: child.key?.toString() ?? `${optionValue}-${index}`,
      label,
      value: String(optionValue)
    }];
  });
}

function textFromReactNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromReactNode).join("");
  return "";
}

export function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function FileDropZone({
  file,
  icon,
  accept,
  buttonLabel,
  emptyLabel,
  onFile
}: {
  file: File | null;
  icon: React.ReactNode;
  accept: string;
  buttonLabel: string;
  emptyLabel: string;
  onFile: (file: File | null) => void;
}) {
  const [dragActive, setDragActive] = useState(false);

  function handleDrag(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(event.type === "dragenter" || event.type === "dragover");
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      onFile(droppedFile);
    }
  }

  return (
    <label
      className={`file-dropzone ${dragActive ? "dragging" : ""}`}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept={accept}
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      <span className="file-dropzone-icon">{icon}</span>
      <span className="file-dropzone-copy">
        <strong>{file?.name ?? emptyLabel}</strong>
        <small>{file ? "Файл готов к загрузке" : "Можно выбрать через проводник или перетащить файл"}</small>
      </span>
      <span className="ghost-button file-dropzone-button">{buttonLabel}</span>
    </label>
  );
}
