import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SignInPage } from './components/SignInPage';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { OverviewView } from './components/OverviewView';
import { TasksView } from './components/TasksView';
import { ResearchView } from './components/ResearchView';
import { ScheduleView } from './components/ScheduleView';
import { InboxTriageView } from './components/InboxTriageView';
import { NotesView } from './components/NotesView';
import { DecisionsView } from './components/DecisionsView';
import { ProfileAndToolsView } from './components/ProfileAndToolsView';
import {
  archiveTriageItem,
  createDecision,
  createEvent,
  createIntegration,
  createNote,
  createResearchBrief,
  createTask,
  createTriageItem,
  deleteDecision,
  deleteEvent,
  deleteIntegration,
  deleteNote,
  deleteResearchBrief,
  deleteTask,
  deleteTriageItem,
  markDecisionDecided,
  subscribeDecisions,
  subscribeEvents,
  subscribeIntegrations,
  subscribeNotes,
  subscribeResearch,
  subscribeTasks,
  subscribeTriage,
  subscribeUserProfile,
  toggleIntegrationSync,
  updateTaskPriority,
  updateTaskStatus,
  updateUserProfile,
} from './services/firestoreService';
import type {
  DecisionAnalysis,
  InboxTriageItem,
  NoteItem,
  ResearchBrief,
  ScheduleEvent,
  TaskItem,
  ToolIntegration,
  UserProfile,
  WorkspaceTab,
} from './types/libralix';

const TAB_PATHS: Record<WorkspaceTab, string> = {
  overview: '/',
  tasks: '/tasks',
  research: '/research',
  schedule: '/schedule',
  inbox: '/inbox',
  notes: '/notes',
  decisions: '/decisions',
  profile: '/profile',
};

function tabFromPathname(pathname: string): WorkspaceTab {
  const entry = (Object.entries(TAB_PATHS) as Array<[WorkspaceTab, string]>).find(
    ([, p]) => p === pathname
  );
  return entry ? entry[0] : 'overview';
}

function WorkspaceShell() {
  const { user, loading, signOutUser } = useAuth();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() =>
    tabFromPathname(window.location.pathname)
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingTaskDraft, setPendingTaskDraft] = useState('');
  const [redirectNotice, setRedirectNotice] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [researchBriefs, setResearchBriefs] = useState<ResearchBrief[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [decisions, setDecisions] = useState<DecisionAnalysis[]>([]);
  const [triageItems, setTriageItems] = useState<InboxTriageItem[]>([]);
  const [integrations, setIntegrations] = useState<ToolIntegration[]>([]);

  // Enforce Sign-In page first and redirect protected routes to /signin when signed out
  useEffect(() => {
    if (loading) return;
    if (!user) {
      if (window.location.pathname !== '/signin') {
        if (window.location.pathname !== '/') {
          setRedirectNotice('Please sign in with Google before using libralix.');
        }
        window.history.replaceState(null, '', '/signin');
      }
    } else if (window.location.pathname === '/signin') {
      window.history.replaceState(null, '', TAB_PATHS[activeTab]);
    }
  }, [user, loading, activeTab]);

  // Listen to browser back/forward navigation
  useEffect(() => {
    function handlePopState() {
      if (!user) {
        window.history.replaceState(null, '', '/signin');
        return;
      }
      setActiveTab(tabFromPathname(window.location.pathname));
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user]);

  // Attach Firestore subscriptions strictly when authenticated
  useEffect(() => {
    setSyncError(null);
    if (!user) {
      setProfile(null);
      setTasks([]);
      setResearchBriefs([]);
      setEvents([]);
      setNotes([]);
      setDecisions([]);
      setTriageItems([]);
      setIntegrations([]);
      return;
    }

    const onError = (err: Error) => {
      setSyncError(err.message);
    };

    const unsubs = [
      subscribeUserProfile(user.uid, setProfile, onError),
      subscribeTasks(user.uid, setTasks, onError),
      subscribeResearch(user.uid, setResearchBriefs, onError),
      subscribeEvents(user.uid, setEvents, onError),
      subscribeNotes(user.uid, setNotes, onError),
      subscribeDecisions(user.uid, setDecisions, onError),
      subscribeTriage(user.uid, setTriageItems, onError),
      subscribeIntegrations(user.uid, setIntegrations, onError),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user]);

  function handleSelectTab(tab: WorkspaceTab) {
    if (!user) {
      setRedirectNotice('Please sign in with Google first.');
      window.history.replaceState(null, '', '/signin');
      return;
    }
    setActiveTab(tab);
    const nextPath = TAB_PATHS[tab];
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath);
    }
  }

  function handleRequireSignIn(draftTask?: string) {
    if (draftTask) {
      setPendingTaskDraft(draftTask);
    }
    setRedirectNotice('Please sign in with Google to enter and save tasks.');
    if (window.location.pathname !== '/signin') {
      window.history.replaceState(null, '', '/signin');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFEAF2] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-xl font-bold tracking-tight text-[#381325]">libralix</p>
          <p className="mt-2 text-sm text-[#6D3B54]">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <SignInPage
        redirectNotice={redirectNotice}
        onDraftTaskCaptured={(draft) => setPendingTaskDraft(draft)}
      />
    );
  }

  const openTasksCount = tasks.filter((t) => t.status !== 'done').length;
  const openTriageCount = triageItems.filter((i) => i.status === 'open').length;
  const openDecisionsCount = decisions.filter((d) => d.status === 'open').length;

  return (
    <div className="min-h-screen bg-[#FFEAF2] text-[#381325] flex">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        counts={{
          openTasks: openTasksCount,
          openTriage: openTriageCount,
          openDecisions: openDecisionsCount,
        }}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeTab={activeTab}
          userName={profile?.displayName || user.displayName || ''}
          userPhotoUrl={user.photoURL}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onSignOut={() => void signOutUser()}
        />

        <main className="flex-1 p-5 sm:p-8 overflow-y-auto">
          {syncError && (
            <div
              role="alert"
              className="max-w-5xl mx-auto mb-6 px-4 py-3 rounded-lg bg-rose-100 border border-rose-300 text-sm text-rose-800 flex items-center justify-between gap-4"
            >
              <span>Could not sync with Firestore: {syncError}</span>
              <button
                type="button"
                onClick={() => setSyncError(null)}
                className="text-xs font-medium underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {activeTab === 'overview' && (
            <OverviewView
              isAuthenticated={Boolean(user)}
              userName={profile?.displayName || user.displayName || ''}
              profile={profile}
              tasks={tasks}
              researchBriefs={researchBriefs}
              events={events}
              notes={notes}
              decisions={decisions}
              triageItems={triageItems}
              integrations={integrations}
              onRequireSignIn={handleRequireSignIn}
              onAddQuickTask={async (title) => {
                await createTask(user.uid, {
                  title,
                  notes: '',
                  priority: 'medium',
                  dueDate: '',
                  source: 'manual',
                });
                setPendingTaskDraft('');
              }}
              onNavigateTab={handleSelectTab}
              initialTaskDraft={pendingTaskDraft}
            />
          )}

          {activeTab === 'tasks' && (
            <TasksView
              isAuthenticated={Boolean(user)}
              uid={user.uid}
              profile={profile}
              tasks={tasks}
              onRequireSignIn={handleRequireSignIn}
              onCreateTask={async (input) => {
                await createTask(user.uid, input);
              }}
              onUpdateStatus={async (taskId, status) => {
                await updateTaskStatus(user.uid, taskId, status);
              }}
              onUpdatePriority={async (taskId, priority) => {
                await updateTaskPriority(user.uid, taskId, priority);
              }}
              onDeleteTask={async (taskId) => {
                await deleteTask(user.uid, taskId);
              }}
            />
          )}

          {activeTab === 'research' && (
            <ResearchView
              profile={profile}
              briefs={researchBriefs}
              onSaveBrief={async (brief) => {
                await createResearchBrief(user.uid, brief);
              }}
              onDeleteBrief={async (briefId) => {
                await deleteResearchBrief(user.uid, briefId);
              }}
              onSaveToNotes={async (note) => {
                await createNote(user.uid, note);
              }}
              onCreateTaskFromBrief={async (task) => {
                await createTask(user.uid, task);
              }}
            />
          )}

          {activeTab === 'schedule' && (
            <ScheduleView
              profile={profile}
              events={events}
              tasks={tasks}
              onCreateEvent={async (input) => {
                await createEvent(user.uid, input);
              }}
              onDeleteEvent={async (eventId) => {
                await deleteEvent(user.uid, eventId);
              }}
            />
          )}

          {activeTab === 'inbox' && (
            <InboxTriageView
              profile={profile}
              items={triageItems}
              integrations={integrations}
              onCreateTriage={async (input) => {
                await createTriageItem(user.uid, input);
              }}
              onArchiveTriage={async (triageId) => {
                await archiveTriageItem(user.uid, triageId);
              }}
              onDeleteTriage={async (triageId) => {
                await deleteTriageItem(user.uid, triageId);
              }}
              onAddExtractedTask={async (task) => {
                await createTask(user.uid, task);
              }}
              onRecordIntegration={async (input) => {
                await createIntegration(user.uid, input);
              }}
            />
          )}

          {activeTab === 'notes' && (
            <NotesView
              notes={notes}
              onCreateNote={async (input) => {
                await createNote(user.uid, input);
              }}
              onDeleteNote={async (noteId) => {
                await deleteNote(user.uid, noteId);
              }}
            />
          )}

          {activeTab === 'decisions' && (
            <DecisionsView
              profile={profile}
              decisions={decisions}
              onCreateDecision={async (input) => {
                await createDecision(user.uid, input);
              }}
              onMarkDecided={async (decisionId) => {
                await markDecisionDecided(user.uid, decisionId);
              }}
              onDeleteDecision={async (decisionId) => {
                await deleteDecision(user.uid, decisionId);
              }}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileAndToolsView
              profile={profile}
              tasks={tasks}
              researchBriefs={researchBriefs}
              notes={notes}
              integrations={integrations}
              onSaveProfile={async (updates) => {
                await updateUserProfile(user.uid, updates);
              }}
              onCreateIntegration={async (input) => {
                await createIntegration(user.uid, input);
              }}
              onToggleIntegration={async (id, syncEnabled) => {
                await toggleIntegrationSync(user.uid, id, syncEnabled);
              }}
              onDeleteIntegration={async (id) => {
                await deleteIntegration(user.uid, id);
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <WorkspaceShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
