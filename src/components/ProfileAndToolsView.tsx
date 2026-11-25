import React, { useEffect, useState } from 'react';
import { Link2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import type {
  NoteItem,
  ResearchBrief,
  TaskItem,
  ToolIntegration,
  ToolType,
  UserProfile,
} from '../types/libralix';
import { validateToolInput } from '../utils/validation';
import { synthesizeUserMemory, testToolWebhookSync } from '../services/agentApi';

interface ProfileAndToolsViewProps {
  profile: UserProfile | null;
  tasks: TaskItem[];
  researchBriefs: ResearchBrief[];
  notes: NoteItem[];
  integrations: ToolIntegration[];
  onSaveProfile: (updates: {
    displayName: string;
    role: string;
    workHours: string;
    focusPreferences: string;
    ongoingProjects: string;
    learnedContext: string;
  }) => Promise<void>;
  onCreateIntegration: (
    input: Omit<ToolIntegration, 'id' | 'uid' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onToggleIntegration: (id: string, syncEnabled: boolean) => Promise<void>;
  onDeleteIntegration: (id: string) => Promise<void>;
}

export function ProfileAndToolsView({
  profile,
  tasks,
  researchBriefs,
  notes,
  integrations,
  onSaveProfile,
  onCreateIntegration,
  onToggleIntegration,
  onDeleteIntegration,
}: ProfileAndToolsViewProps) {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [role, setRole] = useState(profile?.role ?? '');
  const [workHours, setWorkHours] = useState(profile?.workHours ?? '09:00 - 17:00');
  const [focusPreferences, setFocusPreferences] = useState(profile?.focusPreferences ?? '');
  const [ongoingProjects, setOngoingProjects] = useState(profile?.ongoingProjects ?? '');
  const [learnedContext, setLearnedContext] = useState(profile?.learnedContext ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [refreshingMemory, setRefreshingMemory] = useState(false);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [toolName, setToolName] = useState('');
  const [toolType, setToolType] = useState<ToolType>('calendar');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [toolNotes, setToolNotes] = useState('');
  const [savingTool, setSavingTool] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? '');
      setRole(profile.role ?? '');
      setWorkHours(profile.workHours ?? '09:00 - 17:00');
      setFocusPreferences(profile.focusPreferences ?? '');
      setOngoingProjects(profile.ongoingProjects ?? '');
      setLearnedContext(profile.learnedContext ?? '');
    }
  }, [profile]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileStatus(null);
    setSavingProfile(true);
    try {
      await onSaveProfile({
        displayName,
        role,
        workHours,
        focusPreferences,
        ongoingProjects,
        learnedContext,
      });
      setProfileStatus('Saved your profile and memory preferences.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleRefreshMemory() {
    setProfileError(null);
    setProfileStatus(null);
    const activityLines = [
      ...tasks.slice(0, 8).map((t) => `Task (${t.priority}, ${t.status}): ${t.title}`),
      ...researchBriefs.slice(0, 5).map((r) => `Research: ${r.query}`),
      ...notes.slice(0, 5).map((n) => `Note (${n.topic || 'General'}): ${n.title}`),
    ];
    if (activityLines.length === 0) {
      setProfileError('Add a few tasks, notes, or research briefs first so libralix can learn from them.');
      return;
    }

    setRefreshingMemory(true);
    try {
      const res = await synthesizeUserMemory({
        recentActivity: activityLines.join('\n'),
        currentMemory: learnedContext,
      });
      setLearnedContext(res.learnedContext);
      await onSaveProfile({
        displayName,
        role,
        workHours,
        focusPreferences,
        ongoingProjects,
        learnedContext: res.learnedContext,
      });
      setProfileStatus('Updated personal memory from your recent workspace activity.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not update memory.');
    } finally {
      setRefreshingMemory(false);
    }
  }

  async function handleAddTool(e: React.FormEvent) {
    e.preventDefault();
    setToolError(null);
    setToolStatus(null);
    const check = validateToolInput({
      toolName,
      toolType,
      endpointUrl,
      syncEnabled: true,
      notes: toolNotes,
    });
    if (!check.ok) {
      setToolError(check.error);
      return;
    }
    setSavingTool(true);
    try {
      await onCreateIntegration(check.data);
      setToolName('');
      setEndpointUrl('');
      setToolNotes('');
      setToolStatus(`Connected "${check.data.toolName}".`);
    } catch (err) {
      setToolError(err instanceof Error ? err.message : 'Unable to add tool connection.');
    } finally {
      setSavingTool(false);
    }
  }

  async function handleTestSync(tool: ToolIntegration) {
    setToolError(null);
    setToolStatus(null);
    if (!tool.endpointUrl) {
      setToolError('Add an https:// webhook or sync endpoint URL to test this connection.');
      return;
    }
    try {
      const res = await testToolWebhookSync({
        toolName: tool.toolName,
        endpointUrl: tool.endpointUrl,
      });
      setToolStatus(
        res.ok
          ? `Sync test succeeded for "${tool.toolName}" (HTTP ${res.status}).`
          : `Endpoint responded with HTTP ${res.status}.`
      );
    } catch (err) {
      setToolError(err instanceof Error ? err.message : 'Sync test failed.');
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#381325]">Your Profile &amp; Memory</h2>
            <p className="mt-1 text-sm text-[#6D3B54]">
              libralix uses these details across sessions to tailor research, schedules, and recommendations.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefreshMemory()}
            disabled={refreshingMemory}
            className="px-4 py-2 text-xs font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] disabled:opacity-60 rounded-lg flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#B5306B]" aria-hidden="true" />
            <span>{refreshingMemory ? 'Updating...' : 'Update Memory from Activity'}</span>
          </button>
        </div>

        <form onSubmit={(e) => void handleSaveProfile(e)} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="profile-name" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Name
              </label>
              <input
                id="profile-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>

            <div>
              <label htmlFor="profile-role" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Role or focus
              </label>
              <input
                id="profile-role"
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Product Lead, Researcher"
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>

            <div>
              <label htmlFor="profile-hours" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Typical work hours
              </label>
              <input
                id="profile-hours"
                type="text"
                value={workHours}
                onChange={(e) => setWorkHours(e.target.value)}
                placeholder="09:00 - 17:00"
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] font-mono tabular-nums placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="profile-prefs" className="block text-xs font-medium text-[#6D3B54] mb-1">
              Work habits &amp; preferences
            </label>
            <input
              id="profile-prefs"
              type="text"
              value={focusPreferences}
              onChange={(e) => setFocusPreferences(e.target.value)}
              placeholder="e.g. Deep work in the morning, short concise briefs"
              className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
            />
          </div>

          <div>
            <label htmlFor="profile-projects" className="block text-xs font-medium text-[#6D3B54] mb-1">
              Current projects
            </label>
            <textarea
              id="profile-projects"
              rows={2}
              value={ongoingProjects}
              onChange={(e) => setOngoingProjects(e.target.value)}
              placeholder="List active projects or goals..."
              className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
            />
          </div>

          <div>
            <label htmlFor="profile-learned" className="block text-xs font-medium text-[#6D3B54] mb-1">
              Saved memory summary
            </label>
            <textarea
              id="profile-learned"
              rows={3}
              value={learnedContext}
              onChange={(e) => setLearnedContext(e.target.value)}
              placeholder="libralix records key patterns here when you update memory."
              className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="px-5 py-2 text-sm font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] disabled:opacity-60 rounded-lg flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>{savingProfile ? 'Saving...' : 'Save Profile'}</span>
            </button>
          </div>
        </form>

        {profileError && (
          <p role="alert" className="mt-3 text-xs text-rose-700">
            {profileError}
          </p>
        )}
        {profileStatus && (
          <p role="status" className="mt-3 text-xs text-emerald-700">
            {profileStatus}
          </p>
        )}
      </section>

      <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-[#381325]">Connected Tools &amp; Webhooks</h2>
        <p className="mt-1 text-sm text-[#6D3B54]">
          Connect external calendars, project boards, or automation webhooks to sync workflows.
        </p>

        <form onSubmit={(e) => void handleAddTool(e)} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-4">
              <label htmlFor="tool-name-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Tool name
              </label>
              <input
                id="tool-name-input"
                type="text"
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                placeholder="e.g. Work Calendar, Jira, Linear"
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="tool-type-select" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Tool type
              </label>
              <select
                id="tool-type-select"
                value={toolType}
                onChange={(e) => setToolType(e.target.value as ToolType)}
                className="w-full px-3 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              >
                <option value="calendar">Calendar</option>
                <option value="project_management">Project Board</option>
                <option value="email">Email</option>
                <option value="webhook">Webhook</option>
              </select>
            </div>

            <div className="sm:col-span-5">
              <label htmlFor="tool-url-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Sync or webhook URL (optional)
              </label>
              <input
                id="tool-url-input"
                type="url"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label htmlFor="tool-notes-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Connection notes (optional)
              </label>
              <input
                id="tool-notes-input"
                type="text"
                value={toolNotes}
                onChange={(e) => setToolNotes(e.target.value)}
                placeholder="What should sync with this tool?"
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>

            <button
              type="submit"
              disabled={savingTool}
              className="px-5 py-2 text-sm font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] disabled:opacity-60 rounded-lg flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>{savingTool ? 'Adding...' : 'Add Connection'}</span>
            </button>
          </div>
        </form>

        {toolError && (
          <p role="alert" className="mt-3 text-xs text-rose-700">
            {toolError}
          </p>
        )}
        {toolStatus && (
          <p role="status" className="mt-3 text-xs text-emerald-700">
            {toolStatus}
          </p>
        )}

        {integrations.length === 0 ? (
          <div className="mt-6 py-8 text-center border border-dashed border-[#EAA3C0] rounded-lg">
            <Link2 className="w-6 h-6 text-[#9B637E] mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-[#4D1E35]">No external tools connected</p>
            <p className="mt-1 text-xs text-[#9B637E]">
              Add a calendar, project tool, or webhook above to track connected workflows.
            </p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-[#F5C2D7]">
            {integrations.map((tool) => (
              <li key={tool.id} className="py-3.5 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#381325]">{tool.toolName}</p>
                  <p className="text-xs text-[#6D3B54] mt-0.5">
                    <span className="capitalize">{tool.toolType.replace('_', ' ')}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{tool.syncEnabled ? 'Sync enabled' : 'Sync paused'}</span>
                    {tool.endpointUrl ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono truncate">{tool.endpointUrl}</span>
                      </>
                    ) : null}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {tool.endpointUrl && (
                    <button
                      type="button"
                      onClick={() => void handleTestSync(tool)}
                      className="px-2.5 py-1.5 text-xs font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-md cursor-pointer"
                    >
                      Test Sync
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void onToggleIntegration(tool.id, !tool.syncEnabled)}
                    className="px-2.5 py-1.5 text-xs font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-md cursor-pointer"
                  >
                    {tool.syncEnabled ? 'Pause' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteIntegration(tool.id)}
                    aria-label={`Remove connection "${tool.toolName}"`}
                    className="p-1.5 text-[#9B637E] hover:text-rose-700 rounded-md hover:bg-rose-100 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
