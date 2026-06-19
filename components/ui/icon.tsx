import { type CSSProperties } from "react";
import {
  icons as lucideIcons,
  type LucideProps,
} from "lucide-react";

/**
 * Name-based lucide wrapper, mirroring the prototype's <Icon name="..." />.
 * `name` is a PascalCase lucide icon key (e.g. "LayoutDashboard", "ArrowUp").
 */
export type IconName = keyof typeof lucideIcons;

export interface IconProps extends Omit<LucideProps, "ref"> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 18, strokeWidth = 2, ...rest }: IconProps) {
  const Cmp = lucideIcons[name];
  if (!Cmp) return null;
  return <Cmp size={size} strokeWidth={strokeWidth} {...rest} />;
}
