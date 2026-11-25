import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { sortByCreatedAtDesc } from '../utils/planner';
import type {
  DecisionAnalysis,
  InboxTriageItem,
  NoteItem,
  ResearchBrief,
  ScheduleEvent,
  TaskItem,
  TaskPriority,
  TaskStatus,
  ToolIntegration,
  UserProfile,
} from '../types/libralix';
import {
  ALLOWED_EVENT_CATEGORIES,
  ALLOWED_TASK_PRIORITIES,
  ALLOWED_TASK_SOURCES,
  ALLOWED_TASK_STATUSES,
  ALLOWED_TOOL_TYPES,
  ALLOWED_TRIAGE_PRIORITIES,
  BLUEPRINT_LIMITS,
  clampString,
  clampStringArray,
  generateSafeId,
} from '../utils/validation';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const inFlightEnsureUser = new Map<string, Promise<void>>();

export async function ensureUserDocument(params: {
  uid: string;
  displayName: string;
  email: string;
}): Promise<void> {
  const existingPromise = inFlightEnsureUser.get(params.uid);
  if (existingPromise) {
    return existingPromise;
  }

  const task = (async () => {
    const userPath = `users/${params.uid}`;
    const privatePath = `users/${params.uid}/private/info`;

    try {
      const userRef = doc(db, 'users', params.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        await setDoc(userRef, {
          uid: params.uid,
          displayName: clampString(params.displayName, BLUEPRINT_LIMITS.displayNameMax),
          role: '',
          workHours: '09:00 - 17:00',
          focusPreferences: '',
          ongoingProjects: '',
          learnedContext: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, userPath);
    }

    if (params.email) {
      try {
        const privateRef = doc(db, 'users', params.uid, 'private', 'info');
        const privateSnap = await getDoc(privateRef);
        if (!privateSnap.exists()) {
          await setDoc(privateRef, {
            uid: params.uid,
            email: clampString(params.email, BLUEPRINT_LIMITS.emailMax),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, privatePath);
      }
    }
  })().finally(() => {
    inFlightEnsureUser.delete(params.uid);
  });

  inFlightEnsureUser.set(params.uid, task);
  return task;
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      onData(snapshot.exists() ? (snapshot.data() as UserProfile) : null);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<
    Pick<
      UserProfile,
      'displayName' | 'role' | 'workHours' | 'focusPreferences' | 'ongoingProjects' | 'learnedContext'
    >
  >
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.displayName !== undefined) {
      clean.displayName = clampString(updates.displayName, BLUEPRINT_LIMITS.displayNameMax);
    }
    if (updates.role !== undefined) {
      clean.role = clampString(updates.role, BLUEPRINT_LIMITS.roleMax);
    }
    if (updates.workHours !== undefined) {
      clean.workHours = clampString(updates.workHours, BLUEPRINT_LIMITS.workHoursMax);
    }
    if (updates.focusPreferences !== undefined) {
      clean.focusPreferences = clampString(
        updates.focusPreferences,
        BLUEPRINT_LIMITS.focusPreferencesMax
      );
    }
    if (updates.ongoingProjects !== undefined) {
      clean.ongoingProjects = clampString(
        updates.ongoingProjects,
        BLUEPRINT_LIMITS.ongoingProjectsMax
      );
    }
    if (updates.learnedContext !== undefined) {
      clean.learnedContext = clampString(
        updates.learnedContext,
        BLUEPRINT_LIMITS.learnedContextMax
      );
    }
    await updateDoc(doc(db, 'users', uid), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

function subscribeUserCollection<T extends { createdAt?: unknown }>(
  uid: string,
  subcollection: string,
  onData: (items: T[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/${subcollection}`;
  const q = query(collection(db, 'users', uid, subcollection), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as T);
      onData(sortByCreatedAtDesc(items));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

// Tasks
export function subscribeTasks(
  uid: string,
  onData: (items: TaskItem[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return subscribeUserCollection<TaskItem>(uid, 'tasks', onData, onError);
}

export async function createTask(
  uid: string,
  input: {
    title: string;
    notes: string;
    priority: TaskPriority;
    status?: TaskStatus;
    dueDate: string;
    source: TaskItem['source'];
  }
): Promise<string> {
  const id = generateSafeId('task');
  const path = `users/${uid}/tasks/${id}`;
  try {
    const safePriority = ALLOWED_TASK_PRIORITIES.includes(input.priority)
      ? input.priority
      : 'medium';
    const safeStatus = ALLOWED_TASK_STATUSES.includes(input.status as TaskStatus)
      ? (input.status as TaskStatus)
      : 'todo';
    const safeSource = ALLOWED_TASK_SOURCES.includes(input.source) ? input.source : 'manual';
    await setDoc(doc(db, 'users', uid, 'tasks', id), {
      uid,
      title: clampString(input.title, BLUEPRINT_LIMITS.taskTitleMax) || 'Untitled task',
      notes: clampString(input.notes ?? '', BLUEPRINT_LIMITS.taskNotesMax),
      priority: safePriority,
      status: safeStatus,
      dueDate: clampString(input.dueDate ?? '', BLUEPRINT_LIMITS.dueDateMax),
      source: safeSource,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTaskStatus(
  uid: string,
  taskId: string,
  status: TaskStatus
): Promise<void> {
  const path = `users/${uid}/tasks/${taskId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateTaskPriority(
  uid: string,
  taskId: string,
  priority: TaskPriority
): Promise<void> {
  const path = `users/${uid}/tasks/${taskId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), {
      priority,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTask(uid: string, taskId: string): Promise<void> {
  const path = `users/${uid}/tasks/${taskId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'tasks', taskId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Research Briefs
export function subscribeResearch(
  uid: string,
  onData: (items: ResearchBrief[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return subscribeUserCollection<ResearchBrief>(uid, 'research', onData, onError);
}

export async function createResearchBrief(
  uid: string,
  input: {
    query: string;
    summary: string;
    keyFindings: string[];
    sources: string[];
  }
): Promise<string> {
  const id = generateSafeId('brief');
  const path = `users/${uid}/research/${id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'research', id), {
      uid,
      query: clampString(input.query, BLUEPRINT_LIMITS.researchQueryMax) || 'Research brief',
      summary:
        clampString(input.summary, BLUEPRINT_LIMITS.researchSummaryMax) ||
        'No research output was returned.',
      keyFindings: clampStringArray(
        input.keyFindings,
        BLUEPRINT_LIMITS.researchFindingsMaxItems,
        BLUEPRINT_LIMITS.researchFindingItemMax
      ),
      sources: clampStringArray(
        input.sources,
        BLUEPRINT_LIMITS.researchSourcesMaxItems,
        BLUEPRINT_LIMITS.researchSourceItemMax
      ),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteResearchBrief(uid: string, briefId: string): Promise<void> {
  const path = `users/${uid}/research/${briefId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'research', briefId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Schedule Events
export function subscribeEvents(
  uid: string,
  onData: (items: ScheduleEvent[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return subscribeUserCollection<ScheduleEvent>(uid, 'events', onData, onError);
}

export async function createEvent(
  uid: string,
  input: Omit<ScheduleEvent, 'id' | 'uid' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = generateSafeId('event');
  const path = `users/${uid}/events/${id}`;
  try {
    const safeCategory = ALLOWED_EVENT_CATEGORIES.includes(input.category)
      ? input.category
      : 'deep_work';
    await setDoc(doc(db, 'users', uid, 'events', id), {
      uid,
      title: clampString(input.title, BLUEPRINT_LIMITS.eventTitleMax) || 'Focus block',
      date: clampString(input.date, 10),
      startTime: clampString(input.startTime, 5),
      endTime: clampString(input.endTime, 5),
      category: safeCategory,
      notes: clampString(input.notes ?? '', BLUEPRINT_LIMITS.eventNotesMax),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteEvent(uid: string, eventId: string): Promise<void> {
  const path = `users/${uid}/events/${eventId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'events', eventId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Notes
export function subscribeNotes(
  uid: string,
  onData: (items: NoteItem[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return subscribeUserCollection<NoteItem>(uid, 'notes', onData, onError);
}

export async function createNote(
  uid: string,
  input: { title: string; content: string; topic: string }
): Promise<string> {
  const id = generateSafeId('note');
  const path = `users/${uid}/notes/${id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'notes', id), {
      uid,
      title: clampString(input.title, BLUEPRINT_LIMITS.noteTitleMax),
      content: clampString(input.content, BLUEPRINT_LIMITS.noteContentMax),
      topic: clampString(input.topic, BLUEPRINT_LIMITS.noteTopicMax),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateNote(
  uid: string,
  noteId: string,
  input: { title: string; content: string; topic: string }
): Promise<void> {
  const path = `users/${uid}/notes/${noteId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'notes', noteId), {
      title: clampString(input.title, BLUEPRINT_LIMITS.noteTitleMax),
      content: clampString(input.content, BLUEPRINT_LIMITS.noteContentMax),
      topic: clampString(input.topic, BLUEPRINT_LIMITS.noteTopicMax),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteNote(uid: string, noteId: string): Promise<void> {
  const path = `users/${uid}/notes/${noteId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'notes', noteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Decisions
export function subscribeDecisions(
  uid: string,
  onData: (items: DecisionAnalysis[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return subscribeUserCollection<DecisionAnalysis>(uid, 'decisions', onData, onError);
}

export async function createDecision(
  uid: string,
  input: {
    question: string;
    pros: string[];
    cons: string[];
    recommendation: string;
  }
): Promise<string> {
  const id = generateSafeId('decision');
  const path = `users/${uid}/decisions/${id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'decisions', id), {
      uid,
      question:
        clampString(input.question, BLUEPRINT_LIMITS.decisionQuestionMax) || 'Decision analysis',
      pros: clampStringArray(
        input.pros,
        BLUEPRINT_LIMITS.decisionListMaxItems,
        BLUEPRINT_LIMITS.decisionItemMax
      ),
      cons: clampStringArray(
        input.cons,
        BLUEPRINT_LIMITS.decisionListMaxItems,
        BLUEPRINT_LIMITS.decisionItemMax
      ),
      recommendation:
        clampString(input.recommendation, BLUEPRINT_LIMITS.decisionRecommendationMax) ||
        'Weigh the highest-impact trade-offs before deciding.',
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function markDecisionDecided(uid: string, decisionId: string): Promise<void> {
  const path = `users/${uid}/decisions/${decisionId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'decisions', decisionId), {
      status: 'decided',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteDecision(uid: string, decisionId: string): Promise<void> {
  const path = `users/${uid}/decisions/${decisionId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'decisions', decisionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Inbox Triage
export function subscribeTriage(
  uid: string,
  onData: (items: InboxTriageItem[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return subscribeUserCollection<InboxTriageItem>(uid, 'triage', onData, onError);
}

export async function createTriageItem(
  uid: string,
  input: Omit<InboxTriageItem, 'id' | 'uid' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = generateSafeId('triage');
  const path = `users/${uid}/triage/${id}`;
  try {
    const safePriority = ALLOWED_TRIAGE_PRIORITIES.includes(input.priority)
      ? input.priority
      : 'normal';
    await setDoc(doc(db, 'users', uid, 'triage', id), {
      uid,
      sender: clampString(input.sender ?? '', BLUEPRINT_LIMITS.triageSenderMax),
      subject:
        clampString(input.subject ?? '', BLUEPRINT_LIMITS.triageSubjectMax) || 'No subject',
      originalSnippet:
        clampString(input.originalSnippet ?? '', BLUEPRINT_LIMITS.triageSnippetMax) ||
        'No content',
      summary:
        clampString(input.summary ?? '', BLUEPRINT_LIMITS.triageSummaryMax) ||
        'Summary unavailable.',
      suggestedReply: clampString(input.suggestedReply ?? '', BLUEPRINT_LIMITS.triageReplyMax),
      priority: safePriority,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function archiveTriageItem(uid: string, triageId: string): Promise<void> {
  const path = `users/${uid}/triage/${triageId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'triage', triageId), {
      status: 'archived',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTriageItem(uid: string, triageId: string): Promise<void> {
  const path = `users/${uid}/triage/${triageId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'triage', triageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Tool Integrations
export function subscribeIntegrations(
  uid: string,
  onData: (items: ToolIntegration[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return subscribeUserCollection<ToolIntegration>(uid, 'integrations', onData, onError);
}

export async function createIntegration(
  uid: string,
  input: Omit<ToolIntegration, 'id' | 'uid' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = generateSafeId('tool');
  const path = `users/${uid}/integrations/${id}`;
  try {
    const safeToolType = ALLOWED_TOOL_TYPES.includes(input.toolType) ? input.toolType : 'webhook';
    await setDoc(doc(db, 'users', uid, 'integrations', id), {
      uid,
      toolName: clampString(input.toolName, BLUEPRINT_LIMITS.toolNameMax) || 'External Tool',
      toolType: safeToolType,
      endpointUrl: clampString(input.endpointUrl ?? '', BLUEPRINT_LIMITS.endpointUrlMax),
      syncEnabled: Boolean(input.syncEnabled),
      notes: clampString(input.notes ?? '', BLUEPRINT_LIMITS.toolNotesMax),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function toggleIntegrationSync(
  uid: string,
  integrationId: string,
  syncEnabled: boolean
): Promise<void> {
  const path = `users/${uid}/integrations/${integrationId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'integrations', integrationId), {
      syncEnabled,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteIntegration(uid: string, integrationId: string): Promise<void> {
  const path = `users/${uid}/integrations/${integrationId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'integrations', integrationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
