import React from 'react';

export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

export interface BadgeProps {
  children: React.ReactNode;
  tone?: 'green' | 'gray' | 'amber' | 'red' | 'purple' | 'blue';
  variant?: string;
  dot?: boolean;
  className?: string;
}

export function Badge({ children, tone = 'gray', variant, dot = false, className }: BadgeProps) {
  let activeTone = tone;
  if (variant) {
    if (variant === 'success') activeTone = 'green';
    else if (variant === 'warning') activeTone = 'amber';
    else if (variant === 'error' || variant === 'red') activeTone = 'red';
    else if (variant === 'purple') activeTone = 'purple';
    else if (variant === 'blue' || variant === 'sky') activeTone = 'blue';
  }

  const tones = {
    green: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    gray: 'bg-secondary text-secondary-foreground border border-border',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border border-amber-500/30',
    red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 border border-red-500/30',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400 border border-purple-500/30',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400 border border-blue-500/30'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[activeTone] || tones.gray,
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export interface PageIntroProps {
  children?: React.ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
  icon?: React.ElementType;
  className?: string;
}

export function PageIntro({ children, eyebrow, title, description, icon: Icon, className }: PageIntroProps) {
  if (eyebrow || title || description || Icon) {
    return (
      <div className={cn('mb-6 flex items-start gap-3.5', className)}>
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div>
          {eyebrow && (
            <span className="text-xs font-semibold uppercase tracking-wider text-primary mb-1 block">
              {eyebrow}
            </span>
          )}
          {title && <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed max-w-3xl">
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    );
  }

  return (
    <p className={cn('mb-6 max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty', className)}>
      {children}
    </p>
  );
}

export interface PanelProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Panel({ title, description, action, className, children }: PanelProps) {
  return (
    <section className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
