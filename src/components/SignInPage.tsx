import React, { useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Compass, FolderKanban, Scale, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { BrandMark } from './BrandMark';

interface SignInPageProps {
  redirectNotice?: string | null;
  onDraftTaskCaptured?: (draft: string) => void;
}

export function SignInPage({ redirectNotice, onDraftTaskCaptured }: SignInPageProps) {
  const { signInWithGoogle, signingIn, authError, clearAuthError } = useAuth();
  const [quickTaskDraft, setQuickTaskDraft] = useState('');
  const [taskRedirectPrompt, setTaskRedirectPrompt] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const signInBtnRef = useRef<HTMLButtonElement | null>(null);

  const activeNotice = authError || taskRedirectPrompt || redirectNotice;

  function handleQuickTaskChange(value: string) {
    setQuickTaskDraft(value);
    if (value.trim().length > 0) {
      setTaskRedirectPrompt('Please sign in with Google first to save and organize your tasks.');
      onDraftTaskCaptured?.(value);
    } else {
      setTaskRedirectPrompt(null);
    }
  }

  function handleQuickTaskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (quickTaskDraft.trim().length > 0) {
      onDraftTaskCaptured?.(quickTaskDraft);
    }
    setTaskRedirectPrompt('Sign in with Google to enter libralix and save your task.');
    signInBtnRef.current?.focus();
  }

  return (
    <div className="min-h-screen bg-[#FFEAF2] text-[#381325] flex flex-col">
      <header className="w-full border-b border-[#F5C2D7] bg-[#FFF5F9]">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between gap-8">
          <a
            href="/signin"
            onClick={(e) => e.preventDefault()}
            className="flex items-center gap-3 text-xl font-bold tracking-tight text-[#381325] whitespace-nowrap shrink-0"
          >
            <BrandMark className="w-8 h-8" />
            <span>libralix</span>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#6D3B54]">
            <a href="#capabilities" className="hover:text-[#381325] transition-colors whitespace-nowrap shrink-0">
              Capabilities
            </a>
            <a href="#privacy" className="hover:text-[#381325] transition-colors whitespace-nowrap shrink-0">
              Cloud Sync
            </a>
            <a
              href="/api/presentation-pdf?download=1"
              download="libralix_class_presentation.pdf"
              className="text-[#4D1E35] hover:text-[#2B0B1B] underline underline-offset-4 decoration-[#DF84A8] transition-colors whitespace-nowrap shrink-0"
            >
              Class Slides (PDF)
            </a>
          </nav>
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={signingIn}
              className="px-4 py-2 text-sm font-semibold text-[#2B0B1B] bg-[#F49AC1] rounded-lg hover:bg-[#EC7FB0] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {signingIn ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6 lg:py-8 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between bg-[#FFF5F9] border border-[#F5C2D7] rounded-2xl p-6 lg:p-8">
            <div>
              <p className="text-xs font-medium text-[#6D3B54] tracking-wide">
                Personal Productivity &amp; Research Assistant
              </p>
              <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#381325] text-balance leading-tight">
                Your daily chief-of-staff for focused work and deep research.
              </h1>
              <p className="mt-3 text-sm sm:text-base text-[#6D3B54] leading-relaxed">
                libralix researches topics with cited sources, organizes tasks and schedules,
                triages Gmail and WhatsApp messages, and weighs decisions—saved privately in your account.
              </p>

              <div className="mt-5">
                {activeNotice && (
                  <div
                    role="alert"
                    className="mb-3 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-300 text-xs sm:text-sm text-amber-900 flex items-start justify-between gap-3"
                  >
                    <span>{activeNotice}</span>
                    {authError && (
                      <button
                        type="button"
                        onClick={clearAuthError}
                        className="text-xs font-medium text-amber-700 hover:underline shrink-0 cursor-pointer"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                )}

                <button
                  ref={signInBtnRef}
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  disabled={signingIn}
                  className="w-full py-3 px-5 rounded-xl bg-white hover:bg-[#FFF9FB] border border-[#EAA3C0] shadow-xs disabled:opacity-60 text-[#2B0B1B] font-semibold text-sm flex items-center justify-center gap-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F49AC1] cursor-pointer"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>{signingIn ? 'Connecting with Google...' : 'Sign in with Google'}</span>
                </button>

                <form onSubmit={handleQuickTaskSubmit} className="mt-3.5">
                  <label htmlFor="signin-task-preview" className="block text-xs font-medium text-[#6D3B54] mb-1">
                    Start with a task (requires Google sign-in)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="signin-task-preview"
                      type="text"
                      value={quickTaskDraft}
                      onChange={(e) => handleQuickTaskChange(e.target.value)}
                      placeholder="Add a new task..."
                      className="flex-1 px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1] focus:border-transparent"
                    />
                    <button
                      type="submit"
                      aria-label="Continue to sign in with task"
                      className="px-3.5 py-2 text-sm font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Start</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-[#F5C2D7]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="capabilities">
                <div className="p-3.5 rounded-xl bg-[#FFE0EC] border border-[#F5C2D7]">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#381325]">
                    <Compass className="w-4 h-4 text-[#B5306B] shrink-0" aria-hidden="true" />
                    <span>Web Research</span>
                  </div>
                  <p className="mt-1 text-xs text-[#6D3B54] leading-relaxed">
                    Searches multiple sources and prepares clear, cited summaries.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FFE0EC] border border-[#F5C2D7]">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#381325]">
                    <FolderKanban className="w-4 h-4 text-[#B5306B] shrink-0" aria-hidden="true" />
                    <span>Gmail &amp; WhatsApp Triage</span>
                  </div>
                  <p className="mt-1 text-xs text-[#6D3B54] leading-relaxed">
                    Summarizes incoming messages, drafts replies, and extracts tasks.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FFE0EC] border border-[#F5C2D7]">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#381325]">
                    <CheckCircle2 className="w-4 h-4 text-[#B5306B] shrink-0" aria-hidden="true" />
                    <span>Personal Memory</span>
                  </div>
                  <p className="mt-1 text-xs text-[#6D3B54] leading-relaxed">
                    Remembers your work hours, goals, and preferences across sessions.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FFE0EC] border border-[#F5C2D7]">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#381325]">
                    <Scale className="w-4 h-4 text-[#B5306B] shrink-0" aria-hidden="true" />
                    <span>Decision Helper</span>
                  </div>
                  <p className="mt-1 text-xs text-[#6D3B54] leading-relaxed">
                    Compiles balanced pros and cons and suggests next steps.
                  </p>
                </div>
              </div>

              <p id="privacy" className="mt-4 flex items-center gap-2 text-xs text-[#9B637E]">
                <ShieldCheck className="w-4 h-4 text-[#6D3B54] shrink-0" aria-hidden="true" />
                <span>Your tasks, notes, and research are stored privately in your Firestore cloud account.</span>
              </p>
            </div>
          </div>

          <div className="lg:col-span-6 flex">
            <div className="w-full rounded-2xl border border-[#F5C2D7] bg-[#FAD0E1] overflow-hidden flex items-center justify-center">
              {!imgFailed ? (
                <img
                  src="/assets/aistudio/Screenshot_2026-11-22_191655_11d347bd.png"
                  alt="libralix Libra emblem"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full max-h-[580px] object-cover object-center mix-blend-multiply brightness-125 contrast-150"
                />
              ) : (
                <div className="w-full h-64 lg:h-full bg-[#FFF5F9] flex flex-col items-center justify-center p-8 text-center">
                  <Compass className="w-10 h-10 text-[#B5306B] mb-3" aria-hidden="true" />
                  <p className="text-base font-semibold text-[#381325]">libralix Workspace</p>
                  <p className="mt-1 text-sm text-[#6D3B54] max-w-xs">
                    Sign in with Google to unlock your cloud-synced productivity workspace.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
