"use client";

/* ============================================================
   widget-layout/index.tsx — レイアウト編集機能の公開バレル。
   ============================================================ */

export {
  WidgetLayoutEditButton,
  WidgetEditModeToggle,
  WidgetEditorHeader,
  WidgetEditToolbar,
  WidgetLayoutResetDialog,
  WidgetLayoutSaveToast,
  WidgetEditorSkeleton,
  type EditMode,
  type LayoutToast,
} from "./chrome";
export { RowAwareWidgetEditor } from "./desktop";
export { MobileWidgetLayoutEditor } from "./mobile";
export { TdwStyles } from "./glyph";

import * as React from "react";

/** viewport < 768px を mobile とみなす。SSR は false 初期。 */
export function useIsMobile(breakpoint = 768): boolean {
  const [mobile, setMobile] = React.useState(false);
  React.useEffect(() => {
    const onR = () => setMobile(window.innerWidth < breakpoint);
    onR();
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, [breakpoint]);
  return mobile;
}
