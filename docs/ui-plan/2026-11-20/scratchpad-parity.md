# Tutor scratch pad

The compact drawing toolbar and dotted paper sit below the answer in the chat. The supplied screenshot shows the drawing area and tools above the paper. The November mockup shows pen width, accent and resize controls. [Scratch pad screenshot](evidence-v1/liked-scratch-pad.jpg), [November mockup](mockups/05-tutor-scratch.html)

- A finger, stylus or mouse draws. Adding a second touch cancels the provisional stroke. Three or more fingers scroll the conversation. Remaining contacts finish that gesture without leaving ink. **Hand** pans the paper.
- Drag the separator up to give the paper more room or down to give the conversation more room. The arrow keys and **Scratch pad actions** resize the pane. Home and End select its minimum and maximum heights.
- **Undo stroke**, **Redo stroke** and **Clear scratch pad** operate on whole strokes. One eraser drag is one undo step. Pen width and accent live under **Pen settings** and save with the drawing draft.
- **Insert drawing** saves a cropped PNG and editable stroke data to IndexedDB before adding one image reference at the answer’s saved selection. The editor returns to the keyboard. If that image save fails, the drawing remains editable for another attempt.
- Select an editable inline drawing to reopen its strokes. **Update drawing** replaces that occurrence in the answer. The image reference is an atomic editor element, so typing, removal and text undo treat it as one item. **Discard drawing edits** returns to the inserted drawing. Camera and gallery photos use the same inline order and share the three-attachment limit.
- **Send** submits the learner’s prose and referenced images in answer order. Finish or discard any unfinished drawing before sending. An offline queued answer keeps its text and images fixed until submission succeeds or the learner chooses **Keep as draft**.

The Chromium suite uses DevTools touch events for one- and three-finger input and covers stylus input, resizing, erasing, history, save failure, inline editing, legacy draft recovery, reload and answer order. It also exercises narrow viewports and enlarged text. The tests simulate touch and stylus input in Chromium. [Scratch pad browser tests](../../../tests/e2e/v7-tutor-scratchpad.spec.ts), [Inline answer browser tests](../../../tests/e2e/v7-tutor-inline-editor.spec.ts)

For single-glyph entry, the keyboard’s **Draw symbol** beta offers choices that insert as text. [Keyboard and drawing beta](keyboard-research.md)
