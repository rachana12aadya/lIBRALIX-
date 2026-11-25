import React, { useState } from 'react';
import { Check, Scale, Trash2 } from 'lucide-react';
import type { DecisionAnalysis, UserProfile } from '../types/libralix';
import { analyzeDecision } from '../services/agentApi';

interface DecisionsViewProps {
  profile: UserProfile | null;
  decisions: DecisionAnalysis[];
  onCreateDecision: (input: {
    question: string;
    pros: string[];
    cons: string[];
    recommendation: string;
  }) => Promise<void>;
  onMarkDecided: (decisionId: string) => Promise<void>;
  onDeleteDecision: (decisionId: string) => Promise<void>;
}

export function DecisionsView({
  profile,
  decisions,
  onCreateDecision,
  onMarkDecided,
  onDeleteDecision,
}: DecisionsViewProps) {
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!question.trim()) {
      setErrorMsg('Enter the decision or choice you are evaluating.');
      return;
    }
    setLoading(true);
    try {
      const result = await analyzeDecision({
        question: question.trim(),
        context: context.trim(),
        userContext: profile,
      });
      await onCreateDecision(result);
      setQuestion('');
      setContext('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to analyze decision.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-[#381325]">Decision Helper</h2>
        <p className="mt-1 text-sm text-[#6D3B54]">
          Describe a choice you are weighing. libralix compiles clear pros, cons, and a practical recommendation.
        </p>

        <form onSubmit={(e) => void handleAnalyze(e)} className="mt-4 space-y-3">
          <div>
            <label htmlFor="decision-question" className="block text-xs font-medium text-[#6D3B54] mb-1">
              What decision are you weighing?
            </label>
            <input
              id="decision-question"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Enter your decision question..."
              className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
            />
          </div>

          <div>
            <label htmlFor="decision-context" className="block text-xs font-medium text-[#6D3B54] mb-1">
              Constraints or context (optional)
            </label>
            <textarea
              id="decision-context"
              rows={2}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Budget, timeline, team size, or priorities..."
              className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] disabled:opacity-60 rounded-lg flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Scale className="w-4 h-4" aria-hidden="true" />
              <span>{loading ? 'Weighing options...' : 'Compile Pros & Cons'}</span>
            </button>
          </div>
        </form>

        {errorMsg && (
          <p role="alert" className="mt-3 text-xs text-rose-700">
            {errorMsg}
          </p>
        )}
      </section>

      {decisions.length === 0 ? (
        <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-10 text-center">
          <Scale className="w-7 h-7 text-[#9B637E] mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-[#4D1E35]">No decisions saved yet</p>
          <p className="mt-1 text-xs text-[#9B637E]">
            Enter a question above to compare pros and cons side by side.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {decisions.map((decision) => (
            <article key={decision.id} className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-[#381325]">{decision.question}</h3>
                  <p className="mt-1 text-xs text-[#6D3B54]">
                    {decision.status === 'decided' ? 'Decision finalized' : 'Open for review'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {decision.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => void onMarkDecided(decision.id)}
                      className="px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 rounded-md flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Mark Decided</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void onDeleteDecision(decision.id)}
                    aria-label={`Delete decision "${decision.question}"`}
                    className="p-1.5 text-[#9B637E] hover:text-rose-700 rounded-md hover:bg-rose-100 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-emerald-50/80 border border-emerald-200">
                  <h4 className="text-xs font-semibold text-emerald-700">Pros</h4>
                  <ul className="mt-2 space-y-1.5 list-disc list-inside text-sm text-[#4D1E35]">
                    {decision.pros.map((pro, idx) => (
                      <li key={idx}>{pro}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-rose-50/90 border border-rose-200">
                  <h4 className="text-xs font-semibold text-rose-700">Cons</h4>
                  <ul className="mt-2 space-y-1.5 list-disc list-inside text-sm text-[#4D1E35]">
                    {decision.cons.map((con, idx) => (
                      <li key={idx}>{con}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-[#F5C2D7]">
                <h4 className="text-xs font-semibold text-[#6D3B54]">Suggested Direction</h4>
                <p className="mt-1 text-sm text-[#4D1E35] leading-relaxed">
                  {decision.recommendation}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
