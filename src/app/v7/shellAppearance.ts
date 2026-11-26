import './shell.css';
import './responsive.css';
import '../../ui/v7/room.css';
import {applyPaper} from '../../ui/v7/paper';
import {isFlagOn} from '../../flags';
import '../../ui/v7/qed.css';

// N157 · U4 S14: the device's paper and sky (flag v7Paper) from the first paint of the shell.
applyPaper();
// N157 · U4 S2–S4: the ∎ as the one ending (flag v7Qed).
if(typeof document!=='undefined'&&isFlagOn('v7Qed'))document.documentElement.setAttribute('data-v7-qed','');
