import {useLocation} from 'react-router';
import {useSignIn} from '../../../data/hooks';
import {getMode} from '../../../data/mode';
import {Button} from '../../../ui/v7/components';
import {Emblem} from '../../../ui/v7/Emblem';
import {useToast} from '../../../ui/Toast';
import './welcome.css';

/** PLAN §6.15 Sign-in: a full-height sky with a rose drawing itself behind the content, the ℓ mark, "Lemma" in Display, one
 *  primary ("Continue with Google") and a visible way into the example workspace. */
export default function SignInV7(){
 const signIn=useSignIn(),location=useLocation(),notify=useToast();
 const from=(location.state as {from?:string}|null)?.from??'/';
 const demo=getMode()==='demo';
 async function google(){
  if(demo){window.location.assign('?demo=0#/sign-in');return;}
  try{sessionStorage.setItem('lemma:sign-in-return',from);await signIn.mutateAsync();}
  catch{notify('Could not start Google sign-in.',{tone:'danger'});}
 }
 return <main id="main-content" className="v7-signin" aria-label="Sign in">
  <span className="v7-signin-rose" aria-hidden="true"><Emblem subject="Lemma" kind="compass" seed="lemma-sign-in" size={420} animate={false}/></span>
  <div className="v7-signin-content">
   <span className="v7-signin-mark" aria-hidden="true">ℓ</span>
   <h1 className="v7-display">Lemma</h1>
   <p className="v7-signin-tag">A geometer's notebook</p>
   <div className="v7-signin-actions">
    <Button variant="primary" loading={signIn.isPending} onClick={()=>{void google();}}>Continue with Google</Button>
    <a className="v7-button v7-ghost" href={demo?'#/':'?demo=1#/'}><span>Explore the example workspace</span></a>
   </div>
   {demo&&<p className="v7-meta">You are in the example workspace. Continue with Google to open your own record.</p>}
  </div>
 </main>;
}
