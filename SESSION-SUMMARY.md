# RaiseRing — Build Session Summary
**Date:** March 23-24, 2026
**Session Length:** ~5 hours

---

## What We Built

**RaiseRing** — an AI-powered call time manager web app that replaces the $1,500-$5,000/month human call time staffer on political campaigns and non-profit fundraising teams.

**Live at:** https://raisering.vercel.app

---

## Product Research & Strategy

Before writing any code, we:

- Analyzed **5 call time manager job descriptions** (DASS, ADLCC, Keisha for Governor, DCCC, CallTime 101 article)
- Read **4 additional guides** on call time best practices, rolodexing, prospect list building, and phonebanking
- Identified the core workflow: rolodex → call lists → briefing cards → make calls → take notes → follow up → track pledges → report to finance director
- Mapped every function to what AI can automate vs. what requires a human
- Researched the **FEC donor data rules** — decided not to use FEC data (legal risk too high for a software product, trend toward stricter enforcement)
- Conducted a **full competitive analysis**: CallTime.AI, Numero, Pingdex, Findraiser.AI, Colloquy/Chemeria, NGP VAN, Virtuous Momentum, Gravyty, Gong, Nooks
- **Key finding:** No product on the market combines call transcription + AI note-taking + automated follow-up + performance coaching + multi-caller dashboards. The call itself is a black box in every existing tool.
- Wrote a **product spec**, **business plan**, and **build plan**

## Key Product Decisions

- **Multi-caller architecture from day one** — supports board call nights, party committee oversight, finance committee campaigns
- **Both political campaigns and non-profits** — same core product, flexible terminology
- **No FEC data** — legal risk too high. AI recommends ask amounts from candidate-provided info only.
- **Twilio Voice for browser-to-phone calling** (next phase) — both audio streams captured for transcription
- **Candidate sends their own follow-ups** — AI drafts, pre-fills SMS/email. No email infrastructure needed.
- **Named the product "RaiseRing"** — with "RingLeader Call Time Tools" planned for v2/platform brand

## What Was Built (Code)

### Pages (all functional, deployed):
- `/signup` — 2-step account creation (personal info + org type)
- `/login` — email/password authentication
- `/onboarding` — guided contact import flow:
  - Google Contacts (manual export for now, OAuth later)
  - iPhone/Mac Contacts (step-by-step vCard export instructions)
  - CSV/Spreadsheet upload
  - Manual entry (add contacts one by one)
  - Email contacts (coming soon placeholder)
- `/dashboard` — real stats from Supabase (contacts, calls, talk time, pledges, pipeline)
- `/contacts` — searchable contact list with desktop table + mobile cards, delete
- `/contacts/new` — add contact form with occupation, employer, wealth tier, ask amount, notes
- `/contacts/import` — full CSV/vCard import with column auto-detection and mapping
- `/call` — **the core product:**
  - Briefing card (name, phone, occupation, employer, ask amount, notes)
  - Personalized call script (opening, pitch, the ask, fallback ask, non-monetary ask, close)
  - Call timer with live duration tracking
  - Outcome logging (pledged, declined, callback, voicemail, no answer, wrong number, event RSVP)
  - Pledge amount capture
  - AI-drafted follow-up messages
  - "Send as Text" / "Send as Email" (opens native SMS/email with pre-filled message)
  - Session stats (calls made, talk time, total pledged)
  - Session complete summary with $/hour calculation
- `/sessions` — session list with status badges, start/join buttons
- `/sessions/new` — create session with contact selection, Google Calendar integration
- `/pledges` — outstanding/fulfilled/overdue tracking with mark status
- `/analytics` — placeholder for performance metrics (next phase)

### Technical Infrastructure:
- **Next.js 16** with App Router, TypeScript, Tailwind CSS
- **Supabase** — PostgreSQL database with Row Level Security, real-time subscriptions enabled
- **Auth** — email/password signup, JWT token refresh via proxy middleware
- **Database schema** — organizations, users, contacts, sessions, session_callers, session_contacts, calls, pledges (all with RLS policies)
- **Vercel** — deployed with auto-deploy from GitHub
- **Responsive design** — dark sidebar nav on desktop, mobile hamburger menu
- **Role-based navigation** — admin sees everything, caller sees call + contacts, director sees dashboard + analytics

### Data Flow (all persisted to Supabase):
- Contacts → imported or manually added → stored in database
- Calls → recorded with outcome, duration, notes, pledge amount → stored in database
- Pledges → created from calls → trackable as outstanding/fulfilled/overdue
- Dashboard → real stats computed from database
- Contact notes → appended with call history after each call

## Business Plan Highlights

- **Pricing:** $99-$599/month (campaigns), $149-$799/month (non-profits)
- **Unit economics:** ~75% gross margin at Team tier ($299/mo)
- **Year 1 target:** 15 paying customers, ~$13K revenue (validation phase)
- **Year 3 conservative:** $480K/year (50 campaigns + 75 non-profits)
- **Year 3 aggressive:** $2.16M/year (with party committee distribution deal)
- **Go-to-market:** Sell to Finance Directors via DPA network → word of mouth → non-profit expansion → party committee deals for 2028 cycle

## What's Next

| Priority | Feature | Impact |
|---|---|---|
| 1 | **Twilio Voice** — browser-to-phone calling | Candidates call from the app, both sides captured |
| 2 | **Deepgram transcription** — real-time transcript during calls | The core differentiator — AI hears both sides |
| 3 | **Claude API processing** — AI reads transcripts | Auto-extract outcomes, notes, draft personalized follow-ups |
| 4 | **Google Contacts OAuth** — one-click import | Removes friction from onboarding |
| 5 | **Analytics & coaching** — performance insights | $/hour, connect rate, ask adherence, coaching nudges |
| 6 | **Real-time director dashboard** — live multi-caller view | Board call night / committee oversight |

## Files & Resources

- **Product spec:** `product-spec-ai-call-time-agent.md`
- **Business plan:** `business-plan-concept.md`
- **Build plan:** `~/.claude/plans/tranquil-marinating-eagle.md`
- **Database schema:** `supabase/schema.sql`
- **GitHub:** https://github.com/pushconsultingfirm-pixel/raisering
- **Live app:** https://raisering.vercel.app
- **Supabase project:** https://jkqwsbxfsmfqbdjeetoo.supabase.co
