/* PLAN-01 P3: checkpoint screen for a published plan. Kept hidden through P5. */
const StudyView = (() => {
  const ready = false;
  const entries = [
    {type:'attempt', title:'Proof attempt', label:'Your unfinished proof', button:'Save proof attempt'},
    {type:'hint', title:'Hint received', label:'A hint you actually used', button:'Record hint'},
    {type:'feedback', title:'Feedback', label:'Feedback on your reasoning', button:'Save feedback'},
    {type:'mastery_evidence', title:'Evidence', label:'Observable evidence, not a mastery claim', button:'Record evidence'},
    {type:'session_note', title:'Next action', label:'Where to resume next time', button:'Save next action'}
  ];
  function render(params = {}) {
    const owner = typeof LemmaAccount !== 'undefined' ? LemmaAccount.user?.id : null;
    const workspace = App.workspaceRevision;
    const root = h('section', {class:'page study-page', 'aria-label':'Study checkpoint'});
    const message = h('p', {class:'study-message', role:'status',
      text:'Loading the latest approved checkpoint…'});
    const content = h('div', {class:'study-content'});
    root.append(
      h('header', {class:'study-header'},
        h('button', {type:'button',class:'link-btn',text:'Back to Today',
          onclick:() => App.go('home')}),
        h('h1', {text:'Study checkpoint'})),message,content);
    if (!owner) {
      message.textContent='Sign in to open an approved study checkpoint.';
      return root;
    }
    const valid = () => root.isConnected && !App.workspaceBlocked &&
      App.workspaceRevision === workspace && !!owner && LemmaAccount.user?.id === owner;
    function field(label,value) {
      return h('div', {class:'study-detail'},
        h('span', {class:'study-detail-label',text:label}),
        h('p', {text:value || 'Nothing recorded yet'}));
    }
    function amendmentSection(context) {
      const section = h('section', {class:'study-amendment', 'aria-label':'Plan amendment'});
      const status = h('p', {class:'study-amendment-status',role:'status',
        text:'Checking for a local amendment…'});
      const details = h('div', {class:'study-amendment-details'});
      const buttons = h('div', {class:'study-amendment-actions'});
      const reviewButton = h('button', {type:'button',class:'btn',
        text:'Review pending amendment'});
      let preview = null, busy = false;
      const changeLine = (label,items) => h('p', {
        text:label + ': ' + (items?.length ? items.join(', ') : 'None')
      });
      function drawDiff(review) {
        const d = review.diff;
        fill(details,
          h('p', {text:'Draft proposed against approved revision ' +
            review.expectedRevision + ' · local draft revision ' +
            review.expectedLocalRevision}),
          h('p', {text:'Reason: ' + (review.changeSummary || 'Not supplied')}),
          changeLine('Added checkpoint IDs',d.added),
          changeLine('Removed checkpoint IDs',d.removed),
          changeLine('Unchanged checkpoint IDs',d.unchanged),
          changeLine('Top-level plan fields changed',d.planFieldsChanged),
          h('p', {text:d.reordered ? 'Unchanged checkpoints were reordered.' :
            'Relative order of unchanged checkpoints is preserved.'}),
          ...d.modified.map(item => h('p', {text:item.checkpointId +
            ' — fields: ' + (item.fields.join(', ') || 'none') +
            '; added prerequisites: ' + (item.addedPrerequisites.join(', ') || 'none') +
            '; removed prerequisites: ' + (item.removedPrerequisites.join(', ') || 'none')})),
          h('p', {class:'study-amendment-warning',
            text:d.requiresReassessment.length ?
              'Requires explicit reassessment: ' + d.requiresReassessment.join(', ') +
              '. Previous evidence is preserved; mastery is not carried over automatically.' :
              'No mastery criteria changed. Existing evidence remains preserved.'}));
      }
      function approvedControls() {
        const submit = h('button', {type:'button',class:'btn btn-primary',
          text:'Submit previously approved amendment'});
        submit.addEventListener('click',async () => {
          if (!valid() || busy) return;
          busy=true;submit.disabled=true;
          status.textContent='Submitting the unchanged, student-approved revision…';
          try {
            const receipt=await StudyPlan.submitApprovedPlanDraft(context.planId);
            if (!valid()) return;
            if (receipt.status==='confirmed') {
              status.textContent='Approved plan revision ' + receipt.revision +
                ' confirmed. Return to Today to reload the published checkpoint.';
              fill(details);fill(buttons);
            } else if (receipt.status==='queued') {
              status.textContent='Approved intent remains on this device. ' +
                'Retry explicitly when online; no revision is confirmed yet.';
            } else if (receipt.status==='conflict') {
              status.textContent='The published revision or context changed. ' +
                'This amendment needs a new student review; it was not applied.';
              fill(buttons);
            } else throw new Error('Unexpected amendment receipt');
          } catch (error) {
            if (valid()) status.textContent='Publication not confirmed: ' +
              (error?.message || 'request failed') +
              '. Retry this same approved intent without changing its request ID.';
          } finally {busy=false;submit.disabled=false;}
        });
        fill(buttons,submit);
      }
      reviewButton.addEventListener('click',async () => {
        if (!valid() || busy) return;
        busy=true;reviewButton.disabled=true;preview=null;
        fill(details);fill(buttons);
        status.textContent='Reading the exact published plan revision for comparison…';
        try {
          const reviewed=await StudyPlan.reviewPendingAmendment(context.planId);
          if (!valid()) return;
          if (!reviewed) {
            status.textContent='No pending unapproved amendment exists.';
          } else if (reviewed.status!=='review') {
            status.textContent=reviewed.status==='stale' ?
              'The published plan changed since this draft. Review and restart required; nothing was approved.' :
              'The accepted context changed. Review and restart required; nothing was approved.';
          } else {
            preview=reviewed;
            drawDiff(reviewed);
            status.textContent='Inspect the differences before deciding. ' +
              'Nothing has been approved or submitted.';
            const approve=h('button', {type:'button',class:'btn btn-primary',
              text:'Approve these displayed changes'});
            approve.addEventListener('click',async () => {
              if (!valid() || busy || !preview) return;
              busy=true;approve.disabled=true;
              status.textContent='Rechecking the reviewed revision and unchanged draft…';
              try {
                const current=await StudyPlan.reviewPendingAmendment(context.planId);
                if (!valid()) return;
                if (!current || current.status!=='review' ||
                    current.expectedRevision!==preview.expectedRevision ||
                    current.expectedLocalRevision!==preview.expectedLocalRevision ||
                    current.draftId!==preview.draftId ||
                    JSON.stringify(current.diff)!==JSON.stringify(preview.diff)) {
                  status.textContent='The amendment changed. Review it again before approval.';
                  fill(buttons);
                  preview=null;
                  return;
                }
                await StudyPlan.approvePlanDraft(context.planId,
                  preview.expectedLocalRevision,true);
                if (!valid()) return;
                preview=null;
                fill(details);
                status.textContent='Student approval saved on this device. ' +
                  'No plan has been published yet. Submission requires another click.';
                approvedControls();
              } catch (error) {
                if (valid()) status.textContent='Approval not confirmed: ' +
                  (error?.message || 'request failed') +
                  '. Reopen the review before deciding.';
              } finally {busy=false;approve.disabled=false;}
            });
            fill(buttons,approve);
          }
        } catch (error) {
          if (valid()) status.textContent='Could not review the amendment: ' +
            (error?.message || 'try again when connected');
        } finally {busy=false;reviewButton.disabled=false;}
      });
      section.append(h('h3', {text:'Plan amendments'}),
        h('p', {class:'study-note',
          text:'Tutors propose; only you may approve. Reviewing never writes a plan revision.'}),
        status,details,buttons,reviewButton);
      if (typeof StudyPlan.readPlanDraft==='function') {
        Promise.resolve().then(() => StudyPlan.readPlanDraft(context.planId))
          .then(row => {
            if (!valid()) return;
            if (row?.status==='approved_pending') {
              reviewButton.hidden=true;
              status.textContent='A previously student-approved amendment is waiting. ' +
                'Submission is a separate, explicit action.';
              approvedControls();
            } else if (row?.status==='needs_review') {
              reviewButton.hidden=true;
              status.textContent='This amendment has a stale revision conflict. ' +
                'No automatic rebase, retry or approval is allowed.';
            } else status.textContent=row ?
              'A local unapproved amendment is available to review.' :
              'No pending local amendment.';
          }).catch(error => {
            if (valid()) status.textContent='Local amendment status unavailable: ' +
              (error?.message || 'read failed');
          });
      } else status.textContent='Amendment review is unavailable in this build.';
      return section;
    }
    function show(context) {
      const cp = context.checkpoint;
      const detail = h('div', {class:'study-summary'},
        h('p', {class:'study-revision',text:'Published plan revision ' + context.planRevision}),
        h('h2', {text:cp.title || cp.id}),
        field('Objective',cp.objective),
        field('Checkpoint status',cp.status.replaceAll('_',' ')),
        field('Latest proof attempt',context.lastAttempt?.payload?.text || ''),
        field('Current hint level',String(context.hintLevel || 0)),
        field('Latest feedback',context.lastFeedback?.text || ''),
        field('Latest evidence',context.lastEvidence?.text || ''),
        field('Next action',context.nextAction?.text || ''),
        h('p', {class:'study-sources',text:context.sourceRefs?.length
          ? 'Sources: ' + context.sourceRefs.join(' · ')
          : 'No source references attached to this checkpoint.'}));
      const forms = h('div', {class:'study-form-list'});
      for (const entry of entries) {
        const input = h('textarea', {class:'input study-input',rows:3,
          'aria-label':entry.label,placeholder:entry.label,'maxlength':4000});
        const feedback = h('p', {class:'study-write-status',role:'status'});
        const button = h('button', {type:'button',class:'btn btn-primary',text:entry.button});
        let pending = null, saving = false;
        button.addEventListener('click', async () => {
          if (!valid() || saving) return;
          const text = input.value.trim();
          if (!text) { feedback.textContent='Enter an actual observation before saving.'; return; }
          if (pending && pending.text !== text) {
            feedback.textContent='Previous save is unconfirmed. Restore its exact text to retry; no new event was sent.';
            return;
          }
          if (!pending) {
            const payload = {text};
            if (entry.type === 'hint') payload.level = (context.hintLevel || 0) + 1;
            pending = {text, payload, eventId:crypto.randomUUID()};
          }
          const attempt = pending;
          saving = true; button.disabled = true;input.readOnly = true;
          feedback.textContent='Saving evidence…';
          try {
            const receipt = await StudyPlan.recordEvent({
              planId:context.planId,checkpointId:cp.id,
              expectedPlanRevision:context.planRevision,type:entry.type,
              payload:attempt.payload,eventId:attempt.eventId,source:'student'
            });
            if (!valid()) return;
            if (receipt?.eventId !== attempt.eventId) throw new Error('Receipt mismatch');
            if (entry.type === 'hint') {
              context.hintLevel = attempt.payload.level;
            }
            if (entry.type === 'attempt') context.lastAttempt={payload:attempt.payload};
            if (entry.type === 'feedback') context.lastFeedback=attempt.payload;
            if (entry.type === 'mastery_evidence') context.lastEvidence=attempt.payload;
            if (entry.type === 'session_note') context.nextAction=attempt.payload;
            pending = null;
            input.value = '';
            feedback.textContent='Saved as append-only study evidence. No mastery or plan approval was changed.';
            // Keep summary in sync without discarding another in-progress input.
            const labels = {'attempt':'Latest proof attempt','hint':'Current hint level',
              'feedback':'Latest feedback','mastery_evidence':'Latest evidence',
              'session_note':'Next action'};
            for (const item of detail.querySelectorAll('.study-detail')) {
              if (item.firstChild?.textContent !== labels[entry.type]) continue;
              item.lastChild.textContent = entry.type === 'hint' ?
                String(context.hintLevel) : attempt.text;
            }
          } catch (error) {
            if (valid()) feedback.textContent =
              'Not confirmed: ' + (error?.message || 'Study write failed') +
              '. Retry without changing this text to reuse the same event ID.';
          } finally {
            saving=false;button.disabled=false;input.readOnly=false;
          }
        });
        forms.append(h('section', {class:'study-form'},
          h('h3', {text:entry.title}),
          h('label', {class:'study-field-label',text:entry.label}),
          input,button,feedback));
      }
      fill(content,detail,
        h('p', {class:'study-note',text:
          'Only an explicit Save adds an event. Reading this screen never demonstrates mastery.'}),
        forms,amendmentSection(context));
    }
    Promise.resolve().then(async () => {
      if (!valid()) return;
      try {
        if (typeof StudyPlan === 'undefined' ||
            typeof StudyPlan.activeContext !== 'function')
          throw new Error('Study module unavailable');
        const context = await StudyPlan.activeContext();
        if (!valid()) return;
        if (!context?.checkpoint) {
          message.textContent='No published study checkpoint is available. Drafts are not approved plans.';
          return;
        }
        if ((params.planId && params.planId !== context.planId) ||
            (params.checkpointId && params.checkpointId !== context.checkpoint.id)) {
          message.textContent='The approved checkpoint changed. Return to Today and reopen Study.';
          return;
        }
        message.textContent='This is the current approved checkpoint.';
        show(context);
      } catch (error) {
        if (valid()) message.textContent='Cannot read approved study context: ' +
          (error?.message || 'try again when connected');
      }
    });
    return root;
  }
  return {ready,render};
})();
