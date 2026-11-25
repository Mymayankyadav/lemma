# Exam mode tonight: start here

This kit lets you run exam mode in Claude **today**, with your existing Lemma connector and no code change or deploy. The full plan, covering the backend, UI, tutor chat and tests, is in `lemma-exam-mode-plan.zip`.

## About 20 minutes per subject, tonight

1. Fill one column of the worksheet (`02-prompt-pack.md` H) for each exam subject: date and time, duration, marks, format, sources and hours left.
2. In a Claude chat with the Lemma connector, paste **A** with that subject's values. Claude does the following:
   - resumes the project and notes your course bookmark;
   - moves the project's deadline to the exam, which clears the "deadline passed / Hold" state your projects show today;
   - adds the exam as a deadline;
   - saves your bookmark;
   - drafts the blueprint from your syllabus and past papers and asks you one question;
   - saves it as a source page.
3. Paste **B** (the exam prompt) when Claude asks. It is stored as the project's prompt, so every new chat on that subject starts in exam mode.
4. Study in blocks. Start each one with **D**:
   - "next", "hint", "skip" or "recap" during a block;
   - "save for later" for card ideas;
   - "I have N minutes" to update the time.
5. After each paper, paste **F**. Claude asks whether it took place, switches exam mode off, returns you to your course bookmark, and goes through your saved card ideas with you.

## Three rules that protect your study history

- **Exam probes never mark a course checkpoint as demonstrated.** Claude logs them as attempts with concept, level, outcome, hints and novelty. They still count in your normal history when you return to the course.
- **Skipped or unanswered means unknown, not wrong.** Reading a recap is exposure only.
- **No new cards mid-prep** unless you say "draft it now". Ideas are saved and written after the exam.

## When N240 is deployed

Paste **I** from the prompt pack. Claude moves your blueprint into a real exam sitting, and `resume` then shows an EXAM block with the planner (`get(what=exam)`).
