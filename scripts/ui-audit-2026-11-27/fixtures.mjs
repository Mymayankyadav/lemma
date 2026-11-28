// Reuse the browser tests' local account and native bridge. Provider requests never leave this context.
import {nativeFixture} from '../v7/approval-native.mjs';
import {BASE} from './lib.mjs';

export async function installFixture(page,scene){
  if(scene.native){
    await page.addInitScript({content:'('+nativeFixture.toString()+')();'+
      (scene.native==='welcome'?"localStorage.removeItem('lemma.android.welcomeSeen');":'')});
  }
  if(scene.account){
    const {tsImport}=await import('tsx/esm/api');
    const {prepareLiveTutor,liveTutorFixtureResponse}=await tsImport('../../tests/e2e/helpers/live-tutor.ts',import.meta.url);
    // Playwright runs the last registered matching handler first.
    await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(BASE).origin&&route.request().method()==='GET'?route.continue():route.abort());
    const {payload,threadId}=await prepareLiveTutor(page);
    const turnId='88888888-8888-4888-8888-888888888881',complete=scene.account==='complete';
    const form={id:'77777777-7777-4777-8777-777777777777',turnId,title:'Quick check',purpose:'diagnose',
      state:complete?'complete':'unseen',version:complete?1:0,answers:complete?{q1:'An inverse',q2:'Yes',q3:['Injective']}: {},
      questions:[{id:'q1',kind:'short',prompt:'What does a bijection admit?'},
        {id:'q2',kind:'mcq',prompt:'Is a bijection onto?',options:['Yes','No']},
        {id:'q3',kind:'msq',prompt:'Choose its properties.',options:['Injective','Surjective']}]};
    const turn={id:turnId,threadId,sequence:1,version:2,status:'completed',snapshot:{question:'What makes a bijection?',selectedContext:[]},
      finalReply:{turnId,messageId:'reply',body:'Try the quick check.',provenance:{kind:'connector',reportedHost:'claude',hostVerified:false},citations:[],suggestions:[]}};
    payload['rpc/tutor_thread_state']={head:{threadId,lastSequence:1,pendingTurnId:null},turns:[turn],recoveredDrafts:[],canSubmit:true,canConnect:true};
    payload['rpc/tutor_questionnaire_state']=[form];
    await page.route('**/rest/v1/**',route=>{
      const request=route.request(),path=new URL(request.url()).pathname.split('/rest/v1/')[1];
      if(path==='rpc/tutor_questionnaire_save'){
        const body=request.postDataJSON();
        if(form.state!=='complete'&&body.p_expected_version!==form.version)return route.fulfill({json:{status:'conflict',questionnaire:form}});
        if(form.state!=='complete'){form.state=body.p_submit?'complete':'started';form.version++;form.answers=body.p_answers??form.answers;}
        return route.fulfill({json:{status:form.state==='complete'?'submitted':'saved',questionnaire:form}});
      }
      return route.fulfill({json:liveTutorFixtureResponse(payload,path,request.headers().accept)});
    });
  }
}

// Exercise the page shown after a file selection using small local fixtures.
export function uploadFixture(accept){
  if(/pdf/i.test(accept))return 'tests/fixtures/sample.pdf';
  if(/image|png|jpeg/i.test(accept))return 'public/icons/lemma-192.png';
  if(/json/i.test(accept)){
    const notes={text:'A compact set',start:13,end:13,direction:'none'};
    const backup={format:'lemma-pad',version:1,notes,ink:{width:640,height:400,strokes:[]}};
    return {name:'example.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))};
  }
  return null;
}
