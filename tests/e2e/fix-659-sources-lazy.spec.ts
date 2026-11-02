import {test,expect} from '@playwright/test';

// FIX #659d: the Path tab must not evaluate the large PDF/transcription
// module merely to show the Project Route. The Sources tab must still work.
test('Project Path defers PDF sources and Sources tab remains usable',async({page})=>{
 const sourceChunkRequests:string[]=[];
 page.on('request',request=>{
  if(/SourcesPanel(?:-|\\.)/i.test(new URL(request.url()).pathname))
   sourceChunkRequests.push(request.url());
 });
 await page.setViewportSize({width:360,height:740});
 await page.goto('/lemma/?demo=stress&theme=graph#/p/real-analysis',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('region',{name:'Project timeline'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Stages'})).toBeVisible();
 expect(sourceChunkRequests,'Path should not request the SourcesPanel chunk').toEqual([]);
 const views=page.getByRole('group',{name:'Choose view'});
 await views.getByRole('button',{name:/Sources/}).click();
 await expect(page.getByRole('region',{name:'Sources'})).toBeVisible();
 await expect(page.getByRole('group',{name:'Source storage'})).toBeVisible();
 await expect(page.getByText(/Add sources/)).toBeVisible();
 await views.getByRole('button',{name:/Path/}).click();
 await expect(page.getByRole('region',{name:'Stages'})).toBeVisible();
});
