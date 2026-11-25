import React from 'react';
import {
  Calendar,
  CheckSquare,
  Compass,
  Download,
  FileText,
  Home,
  Inbox,
  Scale,
  UserCog,
  X,
} from 'lucide-react';
import type { WorkspaceTab } from '../types/libralix';
import { BrandMark } from './BrandMark';

interface SidebarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  counts: {
    openTasks: number;
    openTriage: number;
    openDecisions: number;
  };
}

const NAV_ITEMS: Array<{
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'research', label: 'Research', icon: Compass },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'inbox', label: 'Inbox Helper', icon: Inbox },
  { id: 'notes', label: 'Notes', icon: FileText },
  { id: 'decisions', label: 'Decisions', icon: Scale },
  { id: 'profile', label: 'Profile & Tools', icon: UserCog },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
  counts,
}: SidebarProps) {
  function getCountForTab(id: WorkspaceTab): number | null {
    if (id === 'tasks' && counts.openTasks > 0) return counts.openTasks;
    if (id === 'inbox' && counts.openTriage > 0) return counts.openTriage;
    if (id === 'decisions' && counts.openDecisions > 0) return counts.openDecisions;
    return null;
  }

  const navContent = (
    <div className="flex flex-col h-full bg-[#FFF5F9] border-r border-[#F5C2D7] w-64">
      <div className="px-5 py-4 border-b border-[#F5C2D7] flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <BrandMark className="w-8 h-8" />
          <span className="text-xl font-bold tracking-tight text-[#381325] whitespace-nowrap shrink-0">
            libralix
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-lg text-[#6D3B54] hover:text-[#381325] hover:bg-[#FFE0EC] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Workspace navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          const count = getCountForTab(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                onCloseMobile();
              }}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#FFDCE9] text-[#381325] border border-[#DF84A8]'
                  : 'text-[#6D3B54] hover:text-[#381325] hover:bg-[#FFE0EC] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${active ? 'text-[#B5306B]' : 'text-[#9B637E]'}`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {count !== null && (
                <span className="text-xs font-mono tabular-nums text-[#6D3B54]">{count}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-[#F5C2D7]">
        <a
          href="/api/presentation-pdf?download=1"
          download="libralix_class_presentation.pdf"
          className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-[#6D3B54] hover:text-[#381325] hover:bg-[#FFE0EC] transition-colors"
        >
          <Download className="w-4 h-4 shrink-0 text-[#9B637E]" aria-hidden="true" />
          <span>Class Presentation (PDF)</span>
        </a>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#2B0B1B]/45"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-50 flex">{navContent}</div>
        </div>
      )}
    </>
  );
}
