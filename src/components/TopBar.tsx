import React from 'react';
import { LogOut, Menu } from 'lucide-react';
import type { WorkspaceTab } from '../types/libralix';
import { BrandMark } from './BrandMark';

interface TopBarProps {
  activeTab: WorkspaceTab;
  userName: string;
  userPhotoUrl: string | null;
  onOpenMobileMenu: () => void;
  onSignOut: () => void;
}

const TAB_TITLES: Record<WorkspaceTab, string> = {
  overview: 'Overview',
  tasks: 'Tasks',
  research: 'Research',
  schedule: 'Schedule',
  inbox: 'Inbox Helper',
  notes: 'Notes',
  decisions: 'Decisions',
  profile: 'Profile & Tools',
};

export function TopBar({
  activeTab,
  userName,
  userPhotoUrl,
  onOpenMobileMenu,
  onSignOut,
}: TopBarProps) {
  return (
    <header className="w-full bg-[#FFF5F9] border-b border-[#F5C2D7] px-6 py-3.5 flex items-center justify-between gap-8">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 -ml-2 rounded-lg text-[#6D3B54] hover:text-[#381325] hover:bg-[#FFE0EC] cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2.5 text-sm min-w-0">
          <BrandMark className="w-6 h-6 lg:hidden" />
          <span className="font-semibold text-[#381325] whitespace-nowrap shrink-0">libralix</span>
          <span className="text-[#DF84A8]" aria-hidden="true">
            /
          </span>
          <h1 className="font-medium text-[#6D3B54] truncate">{TAB_TITLES[activeTab]}</h1>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {userPhotoUrl ? (
            <img
              src={userPhotoUrl}
              alt={userName || 'Account avatar'}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-full border border-[#EAA3C0] object-cover shrink-0"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[#FFDCE9] border border-[#DF84A8] text-[#381325] text-xs font-semibold flex items-center justify-center shrink-0">
              {(userName || 'U').slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="hidden sm:inline text-sm font-medium text-[#4D1E35] truncate max-w-[160px]">
            {userName || 'Signed-in User'}
          </span>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="px-3 py-1.5 text-xs font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </header>
  );
}
