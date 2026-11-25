import React, { useState } from 'react';
import { FileText, Plus, Search, Trash2 } from 'lucide-react';
import type { NoteItem } from '../types/libralix';
import { filterNotesByQuery } from '../utils/planner';
import { validateNoteInput } from '../utils/validation';

interface NotesViewProps {
  notes: NoteItem[];
  onCreateNote: (input: { title: string; content: string; topic: string }) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
}

export function NotesView({ notes, onCreateNote, onDeleteNote }: NotesViewProps) {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const visibleNotes = filterNotesByQuery(notes, searchQuery);

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const check = validateNoteInput({ title, content, topic });
    if (!check.ok) {
      setErrorMsg(check.error);
      return;
    }
    setSaving(true);
    try {
      await onCreateNote(check.data);
      setTitle('');
      setTopic('');
      setContent('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save note.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-[#381325]">Personal Notes</h2>
        <p className="mt-1 text-sm text-[#6D3B54]">
          Capture ideas, meeting notes, and research summaries in your searchable knowledge base.
        </p>

        <form onSubmit={(e) => void handleAddNote(e)} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8">
              <label htmlFor="note-title-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Note title
              </label>
              <input
                id="note-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give this note a clear title..."
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>

            <div className="sm:col-span-4">
              <label htmlFor="note-topic-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
                Topic (optional)
              </label>
              <input
                id="note-topic-input"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Strategy, Reading"
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="note-content-input" className="block text-xs font-medium text-[#6D3B54] mb-1">
              Note content
            </label>
            <textarea
              id="note-content-input"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your note..."
              className="w-full px-3.5 py-2.5 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] disabled:opacity-60 rounded-lg flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>{saving ? 'Saving...' : 'Save Note'}</span>
            </button>
          </div>
        </form>

        {errorMsg && (
          <p role="alert" className="mt-3 text-xs text-rose-700">
            {errorMsg}
          </p>
        )}
      </section>

      <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#F5C2D7]">
          <h3 className="text-base font-semibold text-[#381325]">
            Saved Notes{' '}
            <span className="text-[#9B637E] font-normal tabular-nums">({visibleNotes.length})</span>
          </h3>
          <div className="relative w-full sm:w-72">
            <Search
              className="w-4 h-4 text-[#9B637E] absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search saved notes"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
            />
          </div>
        </div>

        {visibleNotes.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="w-7 h-7 text-[#9B637E] mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-[#4D1E35]">
              {notes.length === 0 ? 'No notes saved yet' : 'No notes match your search'}
            </p>
            <p className="mt-1 text-xs text-[#9B637E]">
              {notes.length === 0
                ? 'Write your first note above or save a research brief.'
                : 'Try a different keyword or clear the search box.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F5C2D7]">
            {visibleNotes.map((note) => (
              <li key={note.id} className="py-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-[#381325]">{note.title}</h4>
                    {note.topic && (
                      <>
                        <span className="text-[#DF84A8]" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs text-[#6D3B54]">{note.topic}</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-[#4D1E35] whitespace-pre-line leading-relaxed">
                    {note.content}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onDeleteNote(note.id)}
                  aria-label={`Delete note "${note.title}"`}
                  className="p-1.5 text-[#9B637E] hover:text-rose-700 rounded-md hover:bg-rose-100 cursor-pointer shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
