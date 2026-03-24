'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/types';
import type { Contact } from '@/lib/types';

interface CallScriptProps {
  contact: Contact;
  callerName?: string;
  campaignName?: string;
}

interface ScriptSection {
  label: string;
  text: string;
  highlight?: boolean;
  subtle?: boolean;
}

function generateScript(contact: Contact, callerName: string, campaignName: string): Record<string, ScriptSection> {
  const firstName = contact.name.split(' ')[0];
  const askAmount = contact.manual_ask_override ?? contact.ai_recommended_ask;
  const fallbackAsk = askAmount ? Math.round(askAmount * 0.5) : null;

  // Build connection point from notes
  let connectionPoint = '';
  if (contact.notes) {
    // TODO: Replace with Claude API to generate personalized talking points from notes
    connectionPoint = contact.notes;
  }

  const sections = {
    opening: {
      label: 'Opening',
      text: `Hi ${firstName}, this is ${callerName} — ${
        connectionPoint
          ? `I'm not sure if you remember, but we connected recently. ${connectionPoint}`
          : `I'm reaching out because I'm running for office`
      }. Do you have a couple of minutes to talk?`,
    },
    pitch: {
      label: 'Why I\'m Running',
      text: `I'm running with ${campaignName} because I believe we need leadership that [key issue]. ${
        contact.occupation
          ? `As someone in ${contact.occupation.toLowerCase()}, I think this is something that directly affects your community.`
          : `I think this is something that affects all of us.`
      }`,
    },
    ask: {
      label: 'The Ask',
      text: askAmount
        ? `We're building real momentum, and I need the support of people like you to keep it going. Would you be willing to contribute ${formatCurrency(askAmount)} to our campaign?`
        : `We're building real momentum, and I need the support of people like you. Would you be willing to make a contribution to our campaign?`,
      highlight: true,
    },
    fallback: {
      label: 'If They Decline',
      text: fallbackAsk
        ? `I completely understand. Would ${formatCurrency(fallbackAsk)} be more doable? Every dollar makes a difference in this race.`
        : `I completely understand. Any amount would make a real difference. Even $50 or $100 helps us reach more voters.`,
      subtle: true,
    },
    nonMonetary: {
      label: 'Non-Monetary Ask',
      text: `If a contribution isn't possible right now, there are other ways to help — would you be willing to host a meet-and-greet, introduce me to others in your network, or put a yard sign up?`,
      subtle: true,
    },
    close: {
      label: 'Close',
      text: `Thank you so much for your time, ${firstName}. ${
        askAmount
          ? `If you're ready, I can take your contribution right now, or I'll send you a link right after we hang up.`
          : `I really appreciate you listening, and I hope I can count on your support.`
      }`,
    },
  };

  return sections;
}

export default function CallScript({ contact, callerName = '[Your Name]', campaignName = '[Campaign]' }: CallScriptProps) {
  const [expanded, setExpanded] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const script = generateScript(contact, callerName, campaignName);
  const sections = Object.entries(script);

  return (
    <div className="mt-4 rounded-md border border-indigo-200 bg-indigo-50/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className="text-sm font-semibold text-indigo-800">Call Script</span>
        <svg
          className={`h-4 w-4 text-indigo-500 transition ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-indigo-200 px-4 pb-4">
          {sections.map(([key, section]) => (
            <div
              key={key}
              className={`mt-3 rounded-md p-3 cursor-pointer transition ${
                activeSection === key
                  ? 'bg-white shadow-sm ring-1 ring-indigo-300'
                  : section.highlight
                    ? 'bg-indigo-100/70 hover:bg-indigo-100'
                    : section.subtle
                      ? 'bg-white/50 hover:bg-white/80'
                      : 'bg-white/70 hover:bg-white'
              }`}
              onClick={() => setActiveSection(activeSection === key ? null : key)}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold uppercase tracking-wide ${
                  section.highlight ? 'text-indigo-700' : section.subtle ? 'text-gray-400' : 'text-indigo-600'
                }`}>
                  {section.label}
                </span>
                {section.highlight && (
                  <span className="inline-flex rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                    Key moment
                  </span>
                )}
              </div>
              <p className={`mt-1.5 text-sm leading-relaxed ${
                section.subtle ? 'text-gray-500 italic' : 'text-gray-800'
              }`}>
                {section.text}
              </p>
            </div>
          ))}

          <p className="mt-3 text-center text-[11px] text-indigo-400">
            Tap any section to highlight it during the call. Script is a guide — be natural.
          </p>
        </div>
      )}
    </div>
  );
}
