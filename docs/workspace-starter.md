# Workspace starter kit

A worked example for filling in a new Founder Ops workspace on day one.

Copy the blocks below into the app, replacing the Lumo Learn specifics with your own.
The example is complete rather than illustrative — a workspace filled in to roughly this
depth produces usable drafts; one with three vague approved claims produces vague drafts.

**Prerequisites:** the workspace exists, you are its owner, and `npm run seed:claims` has
been run (it seeds the forbidden list and brand voice, and leaves approved claims empty
on purpose — that part is yours to write).

**Order matters.** Do §1 → §2 → §3 → §4, then run the check in §5. Generation refuses
until §2 has at least one approved claim.

---

## 1. Knowledge documents

Go to **Knowledge → New**. Create one document per area below. Categories are free text;
these six are a sensible starting set.

The body is read by the bots as product truth, so write it as flat statements of fact,
not marketing copy. Dates, numbers, and names are what make a draft specific instead of
generic — include them, and include only what you can verify.

### `product` — What Lumo Learn is

```
Lumo Learn is a mobile study app for Pakistani students in grades 9 to 12,
covering the Federal Board and Punjab Board syllabi.

The core loop: a student picks a chapter, works through 10 to 15 practice
questions, and the app schedules the ones they got wrong to reappear on a
spaced-repetition interval (1 day, 3 days, 7 days, 21 days).

Subjects live today: Mathematics, Physics, Chemistry, Biology.
Not covered: languages, Islamiat, Pakistan Studies.

Platforms: Android 8.0+ and iOS 15+. No web version.
Offline: downloaded chapters work without a connection; progress syncs when
the device is next online.

Built by a team of four in Lahore. First public release March 2025.
```

### `pricing` — What it costs

```
Free tier: one subject, full access, no time limit, no card required.
Plus: PKR 600/month or PKR 5,400/year, all four subjects.
Family: PKR 900/month, up to three student accounts.

Payment: JazzCash, Easypaisa, and card. No auto-renewal on the mobile wallets —
the student or parent renews manually each period.
Refunds: full refund within 14 days of a charge, requested in-app.
Schools: institutional pricing is negotiated per school, no public rate card.
```

### `audience` — Who uses it

```
Two people decide, and they are not the same person.

The student (14-18) chooses whether to keep using it. They care about getting
through a chapter before a test and about not feeling stupid while doing it.
They open the app in 15-30 minute sessions, usually at night.

The parent (35-55) pays. They care about whether it is worth PKR 600 a month
and whether it will pull their child's marks up. They are sceptical of
education apps because most promise grades.

Teachers are a referral source, not a buyer. Roughly 30% of Plus signups say a
teacher mentioned the app.
```

### `differentiation` — Why this and not the alternatives

```
Alternatives students actually use: YouTube lecture channels, PDF past-paper
dumps in WhatsApp groups, and in-person academies at PKR 3,000-8,000/month.

Against YouTube: video is passive. Lumo Learn is practice-first — a student
answers before they are shown anything.
Against past-paper PDFs: a PDF does not know which questions you got wrong.
Against academies: roughly a fifth of the cost, and no commute, but no live
human to ask. We do not claim to replace a teacher or an academy.

What we do not have: live tutoring, doubt-solving chat, or a question bank for
Sindh Board. Say so plainly when asked.
```

### `objections` — What people push back on, and the honest answer

```
"Does it guarantee better marks?"
No. It gives structured practice and tracks what a student keeps getting wrong.
Results depend on the student. Never answer this question with a number.

"Is it approved by the board?"
No. It is aligned to the Federal and Punjab Board syllabi. It is not
accredited, endorsed, or approved by any board, and saying otherwise is a
legal problem as well as a false claim.

"My child will just use it to avoid studying."
The app is practice, not content consumption — there is nothing to watch
passively.

"Too expensive."
The free tier is a full subject with no time limit. Compare against an academy,
not against free YouTube.

"Will it work without good internet?"
Downloaded chapters work offline. The download needs a connection once.
```

### `proof` — What we can actually evidence

```
Everything in this document is verifiable on request. Nothing else may be
presented as evidence.

- 12,000 registered accounts as of August 2026.
- 3,100 monthly active students, defined as one completed session in 30 days.
- Median 4 sessions per active student per week.
- 4.4 stars on Google Play across 380 ratings.
- 18 schools using the institutional tier.

We have no controlled study of grade improvement. We therefore have no claim
about grade improvement. Internal retention numbers are not marketing claims —
do not put them in public copy.
```

> **Set the verified date.** Each document records `last_verified_at`. Set it when you
> save, and re-save when you have re-checked the numbers. A price that changed three
> months ago and a date that says so is recoverable; a stale price with no date is how a
> wrong number reaches a parent.

---

## 2. Approved claims

**Knowledge → Claims → Approved claims.** One claim per line.

This is the only list the bots may make positive statements from. It starts empty because
an invented "fact" placed here becomes verified truth for every future draft.

**A good approved claim is:** one sentence, specific, checkable today, and about what the
product *is or does* — never about what a student will *achieve*.

| Instead of | Write |
|---|---|
| Improves exam results | Schedules questions a student got wrong for review after 1, 3, 7, and 21 days |
| Trusted by thousands | 12,000 registered accounts as of August 2026 |
| Affordable | PKR 600 per month for all four subjects; one subject is free with no time limit |
| Works anywhere | Downloaded chapters work with no connection; progress syncs when the device is next online |
| Loved by teachers | Around 30% of Plus subscribers report hearing about the app from a teacher |

### Starter list

```
Lumo Learn is a practice-first study app for Pakistani students in grades 9 to 12
Covers the Federal Board and Punjab Board syllabi for Mathematics, Physics, Chemistry, and Biology
A student answers practice questions first, rather than watching a lecture
Questions answered incorrectly return for review after 1, 3, 7, and 21 days
Downloaded chapters work offline; progress syncs when the device is next online
The free tier includes one full subject with no time limit and no card required
Plus costs PKR 600 per month or PKR 5,400 per year for all four subjects
A Family plan covers up to three student accounts for PKR 900 per month
Payment is available through JazzCash, Easypaisa, or card
Any charge can be fully refunded within 14 days, requested in the app
Available on Android 8.0 and above and on iOS 15 and above
12,000 students have registered an account as of August 2026
Rated 4.4 stars across 380 ratings on Google Play
18 schools use the institutional tier
```

Before adding a line, ask: *could I show someone the evidence for this today?* If not, it
belongs in a research report as a Hypothesis, not here.

---

## 3. Forbidden claims

**Knowledge → Claims → Forbidden claims.** The seed gives you the list below. Extend it —
it is deliberately conservative, and it should grow every time you reject a draft.

Seeded already:

```
guaranteed admission
guaranteed results
guaranteed grades
guaranteed rank
guaranteed score improvement
100% success rate
100% pass rate
#1 in Pakistan
best in Pakistan
the only platform that
replaces your teacher
no studying required
instant results
accredited by
endorsed by the government
approved by the board
```

Add what is specific to your product and your market. For Lumo Learn:

```
board approved
government approved
officially recognised
raise your marks by
improve your grades by
top of your class
straight A's
A+ guaranteed
cheaper than any other app
better than an academy
replaces coaching
no need for a tutor
scientifically proven
clinically proven
AI teacher
personal tutor
```

**Two rules for this list:**

1. **Forbidden beats approved.** If a phrase is on both lists, it is forbidden. Getting a
   prohibition slightly too broad costs a rewrite; getting it too narrow costs a false
   promise to a family.
2. **Add the phrase, not the intent.** The list is matched against generated text, so
   write the words a draft would actually contain — `raise your marks by`, not
   *avoid outcome promises*.

---

## 4. Brand voice

**Knowledge → Claims → Brand voice.** A few lines of prose, not a list. The seed sets a
reasonable default; sharpen it with things only your product would say.

```
Plain, warm, and concrete. Write to a student or a parent, not to an investor.

Prefer specifics over superlatives: what the product does, not how great it is.
A number a parent can check beats an adjective every time.

Never imply an outcome the product cannot control. Effort, results, and
admission decisions belong to the student and their institution.

Respect the parent's scepticism — they have been promised grades before. Do not
argue with it; answer it with what the product actually does.

Never talk down to a student. No "finally, studying made easy", no shaming
about marks, no fake urgency.

Urdu and English both appear in our market. Write in clear English; use an Urdu
word only where it is genuinely the natural one, never as decoration.

If a fact is not in the knowledge base, say it is unknown rather than
estimating.
```

---

## 5. Check the workspace before you trust it

Five minutes, once, and it tells you whether the setup took.

1. **Open Help.** The top panel shows your claim counts. If it says *no approved claims*,
   §2 did not save.
2. **Run a content draft** — Content → topic `why spaced repetition works`, platform
   `Instagram Reels`, audience `parents`, tone `warm, plain`. It should return within a
   minute.
3. **Read the draft against §3.** Search it for `guarantee`, `best`, `approved`, and
   `proven`. A hit means the forbidden list needs the exact phrase that got through.
4. **Read it against §2.** Every factual statement should trace to an approved claim. A
   plausible fact you never wrote down is the failure mode this setup exists to prevent —
   reject the draft and decide whether the fact is true enough to add in §2.
5. **Check Audit.** The run should appear with its token cost. If it does not, the run
   failed rather than completed.

Reject the first draft even if it is good. It puts a rejection with notes into the record
on day one, and confirms the queue works before you depend on it.

---

## Adapting this for a different product

The six documents in §1 generalise: **product**, **pricing**, **audience**,
**differentiation**, **objections**, **proof**. The sixth is the one people skip and the
one that matters most — if a claim is not evidenced in `proof`, it does not belong in §2.

Two questions worth answering before you write anything:

- **What will you never say, even if it is true?** That is §3, and it is easier to write
  before you are attached to a draft that breaks it.
- **What would embarrass you if a bot said it to a customer?** Add the phrase to §3 now.
