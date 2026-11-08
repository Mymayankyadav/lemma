/* Document scrolling belongs to Agenda/Month and the surrounding planner.
   A session tick must never reset the learner's reading position. */
(()=>{let previous=location.hash;window.addEventListener('hashchange',()=>{const next=location.hash;if(next.startsWith('#/calendar')&&!previous.startsWith('#/calendar'))requestAnimationFrame(()=>window.scrollTo(0,0));previous=next;});})();
