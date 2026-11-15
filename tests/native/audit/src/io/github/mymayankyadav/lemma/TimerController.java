package io.github.mymayankyadav.lemma;
class TimerController{static TimerState state;static TimerState load(android.content.Context c){return state;}static void show(android.content.Context c,TimerState s){state=s;}static void clear(android.content.Context c){state=null;}}
