import React from 'react';
import { Menu, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface RealHeaderProps {
  title: string;
  subtitle?: string;
  onOpenMobileMenu?: () => void;
  rightAction?: React.ReactNode;
}

export const RealHeader: React.FC<RealHeaderProps> = ({
  title,
  onOpenMobileMenu,
  rightAction
}) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
      <div className="flex items-center gap-3">
        {onOpenMobileMenu && (
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={onOpenMobileMenu}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-secondary lg:hidden cursor-pointer"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-base font-semibold tracking-tight text-balance text-foreground">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {rightAction}
        <button
          type="button"
          aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
          title={theme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
        >
          {theme === 'dark' ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>
      </div>
    </header>
  );
};
