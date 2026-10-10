import { type ReactNode } from "react";
import PillNavButton from "../core/PillNavButton";

export interface NavItemButtonProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: string;
  badgeColor?: string;
}

export default function NavItemButton({
  active,
  onClick,
  icon,
  label,
  badge,
  badgeColor,
}: NavItemButtonProps) {
  return (
    <PillNavButton
      active={active}
      onClick={onClick}
      variant="nav"
      icon={icon}
      label={label}
      badge={
        badge ? (
          <span
            className={`rounded px-1.5 py-0.2 text-[9px] font-semibold ${
              badgeColor || "bg-stone-800 text-stone-300"
            }`}
          >
            {badge}
          </span>
        ) : undefined
      }
    />
  );
}
