/* PLAN-01: checkpoint screen and explicit first-plan workflow. */
const StudyView = (() => {
  const ready = true;
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
    function initialPlanSection(hasPlan=false) {
      const section=h('section',{class:'study-initial','aria-label':'First study plan'});
      const status=h('p',{class:'study-initial-status',role:'status'});
      const drafts=h('div',{class:'study-amendment-actions'});
      const actions=h('div',{class:'study-amendment-actions'});
      const preview=h('div',{class:'study-initial-preview'});
      const input=(label,limit,tag='input')=>h(tag,{class:'input study-input',
        'aria-label':label,placeholder:label,maxlength:limit,rows:tag==='textarea'?8:null});
      const title=input('Plan title',200),objective=input('Plan objective',4000,'textarea');
      const contextId=input('Accepted context ID',36),contextRevision=input('Accepted context revision',15);
      const snapshot=input('Plan snapshot JSON',100000,'textarea');
      const source=input('Planning model or source (optional)',200);
      const fields=[title,objective,contextId,contextRevision,snapshot,source];
      const editor=h('div',{class:'study-initial-editor'},...fields.map(node=>
        h('label',{class:'study-field-label'},node.getAttribute('aria-label'),node)));
      const save=h('button',{type:'button',class:'btn',text:'Save unapproved plan draft'});
      let row=null,review=null,busy=false,planId=crypto.randomUUID();
      for(const f of fields)f.addEventListener('input',()=>{
        review=null;fill(preview);fill(actions);
        status.textContent='Edits are not saved. Save and review again before approving.';
      });
      function showRow(next) {
        row=next;review=null;planId=next.planId;
        title.value=next.title;objective.value=next.objective;
        contextId.value=next.contextId || '';contextRevision.value=String(next.contextRevision || '');
        snapshot.value=JSON.stringify(next.snapshot,null,2);source.value=next.source || '';
        for(const f of fields)f.disabled=next.status!=='draft';
        save.hidden=next.status!=='draft';fill(preview);fill(actions);
        if(next.status==='draft') {
          const read=h('button',{type:'button',class:'btn',text:'Review saved plan'});
          read.addEventListener('click',()=>run(async()=>{
            review=await StudyPlan.reviewInitialPlanDraft(planId);
            if(!valid())return;
            fill(preview,h('h3',{text:review.title}),
              h('p',{text:review.objective}),
              h('p',{text:'Accepted context '+review.contextId+' · revision '+review.contextRevision}),
              h('p',{text:review.snapshot.checkpoints.length+' checkpoints · all start without mastery'}),
              h('pre',{class:'study-plan-json',text:JSON.stringify(review.snapshot,null,2)}));
            const approve=h('button',{type:'button',class:'btn btn-primary',text:'Approve this reviewed plan'});
            approve.addEventListener('click',()=>run(async()=>{
              const approved=await StudyPlan.approveInitialPlanDraft(planId,review,true);
              if(!valid())return;
              showRow(approved);status.textContent='Approval saved on this device. Submit separately to publish.';
            }));
            fill(actions,approve);status.textContent='Review every checkpoint, task and criterion above. Nothing is approved or published.';
          }));
          fill(actions,read);status.textContent='Unapproved draft saved on this device. Review before approving.';
        } else if(next.status==='approved_pending') {
          const submit=h('button',{type:'button',class:'btn btn-primary',text:'Submit approved plan'});
          submit.addEventListener('click',()=>run(async()=>{
            const receipt=await StudyPlan.submitApprovedPlanDraft(planId);
            if(!valid())return;
            if(receipt.status==='confirmed') {
              fill(actions,h('button',{type:'button',class:'btn btn-primary',text:'Open published checkpoint',
                onclick:()=>{if(valid())App.go('study');}}));
              status.textContent='Published revision '+receipt.revision+' confirmed. Open your checkpoint to begin.';
            } else if(receipt.status==='queued')status.textContent='Offline: approved intent preserved. Submit explicitly when connected.';
            else {
              fill(actions);status.textContent='The plan or accepted context changed. This approval cannot be reused; preserve it and start a new draft.';
            }
          }));
          fill(actions,submit);status.textContent='Previously approved intent recovered. Submission requires your click.';
        } else status.textContent='This rejected approval is preserved. Start a new draft against the accepted context; it needs fresh review.';
      }
      async function run(task) {
        if(!valid()||busy)return;
        busy=true;for(const button of section.querySelectorAll('button'))button.disabled=true;
        for(const f of fields)f.readOnly=true;
        try {await task();}
        catch(error){if(valid()){
          review=null;fill(preview);
          status.textContent='Not confirmed: '+(error?.message||'request failed')+'. Saved drafts and approvals are preserved.';
        }}
        finally {
          busy=false;
          if(valid()){
            for(const button of section.querySelectorAll('button'))button.disabled=false;
            for(const f of fields)f.readOnly=false;
          }
        }
      }
      async function refresh() {
        const list=await StudyPlan.listInitialPlanDrafts();
        if(!valid())return;
        fill(drafts,...list.map(item=>h('button',{type:'button',class:'btn',
          text:'Resume draft: '+item.title,onclick:()=>run(async()=>{
            const saved=await StudyPlan.readPlanDraft(item.planId);
            if(!valid())return;
            if(!saved)throw Error('Draft changed; reload Study');showRow(saved);
          })})));
      }
      save.addEventListener('click',()=>run(async()=>{
        if(!/^[1-9]\d*$/.test(contextRevision.value.trim()))throw Error('Enter a positive accepted context revision');
        let parsed;
        try {parsed=JSON.parse(snapshot.value);}catch(_){throw Error('Plan snapshot must be valid JSON');}
        const saved=await StudyPlan.saveInitialPlanDraft({planId,expectedRevision:0,
          expectedLocalRevision:row?.localRevision||0,title:title.value.trim(),
          objective:objective.value.trim(),contextId:contextId.value.trim(),
          contextRevision:Number(contextRevision.value),snapshot:parsed,
          source:source.value.trim(),changeSummary:'Initial plan proposed for student review'});
        if(!valid())return;showRow(saved);await refresh();
      }));
      const start=h('button',{type:'button',class:'btn',text:'Start another draft',onclick:()=>{
        if(!valid()||busy)return;
        row=null;review=null;planId=crypto.randomUUID();
        for(const f of fields){f.value='';f.disabled=false;}
        save.hidden=false;fill(preview);fill(actions);
        status.textContent='A new unapproved draft. Existing drafts and approvals are preserved.';
      }});
      const example={checkpoints:[{checkpoint_id:'proof-1',title:'Your first lemma',
        objective:'State the precise goal',prerequisite_checkpoint_ids:[],source_refs:[],
        learning_tasks:['Attempt the proof'],mastery_criterion:'Justify every implication',
        assessment_prompt:'Give a complete proof',status:'not_started'}]};
      section.append(h('h2',{text:hasPlan?'Local plan drafts':'Create your first study plan'}),
        h('p',{text:'Use your accepted context from Settings and a plan from your chosen planning session. Saving keeps a local draft; review, approval and publication are separate decisions.'}),
        drafts,editor,h('details',{},h('summary',{text:'Plan snapshot format'}),
          h('pre',{class:'study-plan-json',text:JSON.stringify(example,null,2)})),
        save,start,status,preview,actions);
      Promise.resolve().then(refresh).catch(error=>{if(valid())status.textContent=error.message;});
      return section;
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
      // A stale approval is not reusable. Inspection is read-only; restart
      // requires a separate student click and leaves a new UNAPPROVED draft.
      function conflictControls() {
        const inspect=h('button',{type:'button',class:'btn',
          text:'Inspect rejected amendment'});
        inspect.addEventListener('click',async () => {
          if (!valid() || busy) return;
          busy=true;inspect.disabled=true;
          fill(details);fill(buttons);
          status.textContent='Comparing the rejected amendment against the latest approved plan…';
          try {
            const reviewed=await StudyPlan.reviewConflictedAmendment(context.planId);
            if (!valid()) return;
            if (!reviewed || reviewed.status!=='review_conflict')
              throw new Error('No rejected amendment remains');
            const changed=diff => [
              ...diff.added.map(id=>id+' (added)'),
              ...diff.removed.map(id=>id+' (removed)'),
              ...diff.modified.map(x=>x.checkpointId+' (changed)')
            ];
            fill(details,
              h('p',{text:'Originally approved against revision '+reviewed.originalRevision+
                '; current published revision '+reviewed.currentRevision+'.'}),
              h('p',{text:'Original request: '+reviewed.originalRequestId}),
              h('p',{text:'Proposal reason: '+reviewed.changeSummary}),
              changeLine('Changes made on server after original proposal',
                changed(reviewed.serverChanges)),
              changeLine('Changes requested by the rejected proposal',
                changed(reviewed.proposedChanges)),
              changeLine('Proposed changes compared with current published plan',
                changed(reviewed.latestComparison)),
              changeLine('Overlapping checkpoint edits needing special care',
                reviewed.overlapIds),
              changeLine('Checkpoint criteria requiring reassessment',
                reviewed.latestComparison.requiresReassessment),
              h('p',{class:'study-amendment-warning',
                text:'Restart preserves the old approved request and evidence in an archive. '+
                  'The replacement is unapproved and must be reviewed and approved again.'}));
            status.textContent='Review server changes and overlapping checkpoints. '+
              'Nothing has been restarted, approved or published.';
            const restart=h('button',{type:'button',class:'btn btn-primary',
              text:'Restart as unapproved draft'});
            restart.addEventListener('click',async () => {
              if (!valid() || busy) return;
              busy=true;restart.disabled=true;
              status.textContent='Rechecking current revision before explicitly restarting…';
              try {
                const row=await StudyPlan.restartConflictedAmendment(
                  context.planId,reviewed,true);
                if (!valid()) return;
                if (row?.status!=='draft') throw new Error('Restart was not saved');
                fill(details);fill(buttons);
                reviewButton.hidden=false;
                status.textContent='Original approved request archived. A fresh unapproved '+
                  'draft is saved. Use Review pending amendment to inspect it again; '+
                  'nothing has been approved or published.';
              } catch (error) {
                if (valid()) {
                  fill(details);
                  status.textContent='Restart not confirmed: '+
                    (error?.message || 'request failed')+
                    '. Inspect the conflict again before retrying.';
                  conflictControls();
                }
              } finally {busy=false;restart.disabled=false;}
            });
            fill(buttons,restart);
          } catch (error) {
            if (valid()) {
              status.textContent='Conflict inspection unavailable: '+
                (error?.message || 'try again when connected');
              fill(buttons,inspect);
            }
          } finally {busy=false;inspect.disabled=false;}
        });
        fill(buttons,inspect);
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
            if (row?.expectedRevision===0) {
              reviewButton.hidden=true;
              status.textContent='An initial plan submission is preserved locally. Use Resume local plan drafts below to confirm its receipt.';
            } else if (row?.status==='approved_pending') {
              reviewButton.hidden=true;
              status.textContent='A previously student-approved amendment is waiting. ' +
                'Submission is a separate, explicit action.';
              approvedControls();
            } else if (row?.status==='needs_review') {
              reviewButton.hidden=true;
              status.textContent='This amendment has a stale revision conflict. ' +
                'No automatic rebase, retry or approval is allowed.';
              conflictControls();
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
        cp.learningTasks?.length?field('Learning tasks',cp.learningTasks.join('\n')):null,
        cp.assessmentPrompt?field('Assessment prompt',cp.assessmentPrompt):null,
        cp.masteryCriterion?field('Mastery criterion',cp.masteryCriterion):null,
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
      const unconfirmedSaves=new Set();
      if(Array.isArray(context.checkpoints)&&context.checkpoints.length>1) {
        const choose=h('select',{class:'input','aria-label':'Approved checkpoint'},
          ...context.checkpoints.map(item=>h('option',{value:item.id,
            selected:item.id===cp.id,text:item.title+' · '+item.status.replaceAll('_',' ')})));
        choose.addEventListener('change',()=>{
          if(!valid())return;
          if(unconfirmedSaves.size || [...forms.querySelectorAll('textarea')].some(input=>input.value.trim())) {
            choose.value=cp.id;
            message.textContent='Save or clear typed observations before changing checkpoint. Unconfirmed saves must be retried first.';
            return;
          }
          App.go('study',{planId:context.planId,checkpointId:choose.value});
        });
        detail.prepend(h('label',{class:'study-field-label'},'Choose an approved checkpoint',choose));
      }
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
            unconfirmedSaves.add(entry.type);
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
            unconfirmedSaves.delete(entry.type);
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
        let continueButton=null;
        if (entry.type==='attempt' &&
            typeof context.lastAttempt?.payload?.text==='string' &&
            context.lastAttempt.payload.text.length) {
          continueButton=h('button',{type:'button',class:'btn',
            text:'Continue saved proof'});
          continueButton.addEventListener('click',() => {
            if (!valid() || saving) return;
            if (pending) {
              feedback.textContent='An earlier save is unconfirmed. '+
                'Retry that exact text before continuing a different proof.';
              return;
            }
            if (input.value.trim()) {
              feedback.textContent='Unsubmitted text is already here. '+
                'Clear it yourself before restoring the saved proof.';
              return;
            }
            const saved=context.lastAttempt.payload.text;
            if (saved.length > 4000) {
              feedback.textContent='Saved proof exceeds the editor limit. '+
                'Review it above before writing a new attempt.';
              return;
            }
            input.value=saved;
            if (typeof input.focus==='function') input.focus();
            feedback.textContent='Saved proof restored for editing. '+
              'No new event has been recorded.';
          });
        }
        forms.append(h('section', {class:'study-form'},
          h('h3', {text:entry.title}),
          h('label', {class:'study-field-label',text:entry.label}),
          input,continueButton,button,feedback));
      }
      // The tutor lane owns readiness and consent; never expose the entry
      // until its real cross-model acceptance has enabled that module.
      if (typeof TutorHandoff !== 'undefined' && TutorHandoff.ready === true &&
          typeof TutorHandoff.open === 'function') {
        const handoff=h('button',{type:'button',class:'btn study-handoff-entry',text:'Open tutor handoff'});
        handoff.addEventListener('click',async()=>{
          if (!valid() || handoff.disabled || TutorHandoff.ready !== true) return;
          if (unconfirmedSaves.size || [...forms.querySelectorAll('textarea')].some(input=>input.value.trim())) {
            message.textContent='Save or clear typed observations before opening a handoff. Unconfirmed saves must be retried first.';
            return;
          }
          handoff.disabled=true;
          try {
            await TutorHandoff.open({planId:context.planId,checkpointId:cp.id});
          } catch (error) {
            if (valid()) message.textContent='Could not open tutor handoff: '+(error?.message || 'try again');
          } finally {handoff.disabled=false;}
        });
        detail.append(handoff);
      }
      fill(content,detail,
        h('p', {class:'study-note',text:
          'Only an explicit Save adds an event. Reading this screen never demonstrates mastery.'}),
        forms,amendmentSection(context));
      // A lost publication response may leave an approved local intent even
      // though its plan is now visible remotely. Keep that receipt retry
      // reachable after reload; never resubmit it automatically.
      if(typeof StudyPlan.listInitialPlanDrafts==='function') {
        Promise.resolve().then(()=>StudyPlan.listInitialPlanDrafts()).then(list=>{
          if(valid()&&list.length)content.append(h('details',{},
            h('summary',{text:'Resume local plan drafts or unconfirmed submissions'}),
            initialPlanSection(true)));
        }).catch(()=>{});
      }
    }
    Promise.resolve().then(async () => {
      if (!valid()) return;
      try {
        if (typeof StudyPlan === 'undefined' ||
            typeof StudyPlan.activeContext !== 'function')
          throw new Error('Study module unavailable');
        const context = await StudyPlan.activeContext({planId:params.planId,checkpointId:params.checkpointId});
        if (!valid()) return;
        if (!context?.checkpoint) {
          message.textContent='No published study checkpoint is available. Drafts are not approved plans.';
          if(typeof StudyPlan.saveInitialPlanDraft==='function')fill(content,initialPlanSection());
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
        if (valid()) {
          message.textContent='Cannot read approved study context: ' +
            (error?.message || 'try again when connected');
          // Local drafts/approved intents remain reachable offline. Never
          // infer that an unreadable cloud plan is absent or publish on load.
          if(typeof StudyPlan.saveInitialPlanDraft==='function')fill(content,initialPlanSection());
        }
      }
    });
    return root;
  }
  return {ready,render};
})();

