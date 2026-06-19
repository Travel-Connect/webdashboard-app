"use client";

/* ============================================================
   dropdown.tsx — portal dropdown + filter trigger button + menu item.
   Ported from docs/.../shell.jsx (Dropdown / FilterButton / MenuItem).
   ============================================================ */

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@/components/ui/icon";

export interface DropdownProps {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: number;
}

const subscribeNoop = () => () => {};

export function Dropdown({ trigger, children, align = "left", width = 260 }: DropdownProps) {
  const [open, setOpen] = useState(false);
  // true after hydration on the client; false during SSR (portal target absent).
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, maxH: 600 });

  const place = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = align === "right" ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const top = r.bottom + 6;
    setPos({ top, left, maxH: Math.max(160, window.innerHeight - top - 12) });
  }, [align, width]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, place]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {trigger(open, () => setOpen((o) => !o))}
      {open &&
        mounted &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width,
              zIndex: 1000,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
              boxShadow: "var(--shadow-pop)",
              overflow: "hidden",
              overflowY: "auto",
              maxHeight: pos.maxH,
            }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export interface FilterButtonProps {
  icon?: IconName;
  label?: ReactNode;
  value: ReactNode;
  open: boolean;
  onClick: () => void;
}
export function FilterButton({ icon, label, value, open, onClick }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 34,
        padding: "0 10px",
        background: open ? "var(--surface-3)" : "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        color: "var(--text)",
        fontSize: 13,
        fontWeight: 500,
        maxWidth: 240,
      }}
    >
      {icon && <Icon name={icon} size={15} style={{ color: "var(--text-2)", flexShrink: 0 }} />}
      {label && <span style={{ color: "var(--text-3)", flexShrink: 0 }}>{label}</span>}
      <span
        style={{
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
      <Icon name="ChevronDown" size={14} style={{ color: "var(--text-3)", flexShrink: 0 }} />
    </button>
  );
}

export interface MenuItemProps {
  active?: boolean;
  onClick?: () => void;
  icon?: IconName;
  children?: ReactNode;
  right?: ReactNode;
  danger?: boolean;
  style?: CSSProperties;
}
export function MenuItem({ active, onClick, icon, children, right, danger, style }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "9px 12px",
        border: "none",
        background: active ? "var(--primary-weak)" : "transparent",
        color: danger ? "var(--danger)" : active ? "var(--primary-ink)" : "var(--text)",
        fontSize: 13.5,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--surface-3)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {icon && <Icon name={icon} size={15} style={{ color: "var(--text-2)", flexShrink: 0 }} />}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </span>
      {right}
    </button>
  );
}
