import json
from PIL import Image, ImageDraw, ImageFont
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',26)
B=json.load(open('ann/boxes.json'))
RED=(255,40,60); YEL=(255,214,0)
def label(d,xy,text,anchor_w=740):
    x,y=xy; lines=text.split('\n'); h=34*len(lines)+10
    w=max(d.textlength(l,font=F) for l in lines)+20
    x=max(4,min(x,780-w-4)); y=max(4,min(y,1688-h-4))
    d.rectangle([x,y,x+w,y+h],fill=(0,0,0),outline=YEL,width=3)
    for i,l in enumerate(lines): d.text((x+10,y+6+34*i),l,fill=YEL,font=F)
def rect(d,b,color=RED,w=6,pad=4):
    x,y,ww,hh=b['x']*2,b['y']*2,b['width']*2,b['height']*2
    d.rectangle([x-pad,y-pad,x+ww+pad,y+hh+pad],outline=color,width=w)
def go(name,fn):
    im=Image.open(f'ann/{name}.png').convert('RGB'); d=ImageDraw.Draw(im); fn(d,B[name]); im.save(f'ann/{name}-annotated.png')
def off(d,b):
    dl=b['dialog']; rect(d,dl)
    y=dl['y']*2+dl['height']*2+40
    d.line([0,y,dl['x']*2,y],fill=YEL,width=6); d.line([(dl['x']+dl['width'])*2,y,780,y],fill=YEL,width=6)
    label(d,(20,y+20),f"left margin {round(dl['x'])}px  vs  right margin {390-round(dl['x']+dl['width'])}px\ntop margin {round(dl['y'])}px: dialog glued to the\ntop-left corner (not centred)")
go('A01-calendar-block-modal-off-centre',off)
go('A02-task-modal-off-centre',off)
def a03(d,b):
    rect(d,b['nav'],YEL,4,0); rect(d,b['target'])
    label(d,(20,1300),"“Create card” button is HERE,\nunderneath the bottom nav.\nA tap opens the Review tab.\nThe sheet does not scroll.")
go('A03-new-card-create-under-nav',a03)
def a04(d,b):
    rect(d,b['t1']); rect(d,b['t2'])
    label(d,(20,1000),"Cancel + Delete card are both\nhidden under the bottom nav.\nThe confirmation can't be answered.")
go('A04-delete-card-buttons-under-nav',a04)
def a05(d,b):
    rect(d,b['header'],YEL,5); rect(d,b['save'])
    label(d,(20,220),"Page header is drawn on top of\nthe sheet title (two titles overlap)")
    label(d,(20,1360),"“Save changes” sits under the nav")
go('A05-edit-card-sheet-under-header',a05)
def a06(d,b):
    rect(d,b['heading']); rect(d,b['input'])
    d.line([2,b['sheet']['y']*2,2,1688],fill=YEL,width=6); d.line([777,b['sheet']['y']*2,777,1688],fill=YEL,width=6)
    label(d,(20,560),"Sheet padding = 0px: title, label,\ninput and buttons touch the screen edge.\nTitle says “New project” on a “New path” page.")
go('A06-new-project-sheet-no-padding',a06)
def a07(d,b):
    rect(d,b['note']); rect(d,b['f1']); rect(d,b['f2'])
    label(d,(20,1150),"Users must edit UTC ISO instants by hand.\n02:30Z = 08:00 IST, already in the past\nat 13:43 when the plan was proposed.")
go('A07-planner-iso-utc-fields',a07)
def a08(d,b):
    rect(d,b['t1']); rect(d,b['t2'])
    label(d,(20,1250),"Raw LaTeX ($U_y$) and raw cloze\nsyntax {{c1::…}} shown to the user")
go('A08-inbox-raw-latex-cloze',a08)
print('ok')
