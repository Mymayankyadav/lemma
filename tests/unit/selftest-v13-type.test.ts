import {expect,it} from 'vitest'
const n: number = 'not a number'
it('selftest type error only',()=>{expect(n).toBeTruthy()})
