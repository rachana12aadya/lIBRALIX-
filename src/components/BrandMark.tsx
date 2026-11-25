import React from 'react';

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = 'w-8 h-8' }: BrandMarkProps) {
  return (
    <span
      className={`${className} rounded-lg border border-[#EAA3C0] bg-[#FAD0E1] overflow-hidden inline-flex items-center justify-center shrink-0`}
    >
      <img
        src="/assets/aistudio/Screenshot_2026-11-22_191655_11d347bd.png"
        alt="libralix logo"
        referrerPolicy="no-referrer"
        className="w-full h-full object-contain mix-blend-multiply brightness-150 contrast-200"
      />
    </span>
  );
}
