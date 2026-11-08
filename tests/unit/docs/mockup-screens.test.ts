import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// docs/v6/screens holds the Owner's design mockup captures: the target the v6 app must match.
// N101 (#1297) overwrote them with app captures. App captures belong in docs/v6/release-captures.
const MOCKUPS: Record<string, string> = {
  'atlas-day.png': '2091f5dc3cd7fef3373bc047723245d9fd3926ba5ebf2b4b7242163b3062c365',
  'atlas-night.png': '578c9bf60f3e5e55e979228ced845163fae2fcbe6b2719fcd75ec23e26aff97a',
  'calendar-day.png': 'f8a49360788ba5fe59504ebebe22cb16460151664d74a851b53f183248b6b588',
  'calendar-night.png': 'c1dcd1dadf0d541ac1fce97b18378917f41c89c99239bc6399b5b649bda60b48',
  'cards-day.png': '129e247613e55509e9ebc079be2fa6d91a45e1bebe80f1a1a642bacfe1ecb503',
  'cards-night.png': '2933748975b427f8cbd7b8b86192892c6b8ccce981e033b1de84c121b4424bfd',
  'focus-day.png': '605a0a7e95719619ceb77f84f8367576657f2d5d4b7a3d03daca4649907a65eb',
  'inbox-day.png': '644eb1ccf3494465b5a39af404b39f06a9c068d6df521dc8e8f95de1a4bafd08',
  'inbox-night.png': '72e236f3286c3b9c7c40e07c7e46fbbee3f00dde7fa0fae0696c7a01191bc3cc',
  'paths-day.png': '795a428030c04282f0e4e83323e2458f99c96af4db33c88464232875a4619173',
  'paths-night.png': '5aba798d62bf56e5172ef24f19857ccf8efa20d78a8d13b5b20d380d5f0776f8',
  'progress-day.png': '619a0162c50c0aeafd4a783f7dd592f8c778bae0126a93574ff1270615f5a669',
  'progress-night.png': '9f2664b40a18a2d918ca79d79308296f099de9994d98961d6633197eb65d32e4',
  'review-day.png': '13ca036c921989b696a61c5dcb31c31978d3a07de8dd46e019c071553a1f3886',
  'review-night.png': 'f8bba2f71d40bc74fd1fa822f7d5575dada8591dc57786577b15adfc3501769f',
  'settings-day.png': '3603001edcc2e3e5f8157ca3692b8970d616523b5fb3522dbc435c355c344094',
  'settings-night.png': '758242ec034ab44a1cd975586cd1364c57a65cdef34053290401abb18db778b6',
  'today-day.png': '3917f3357e3336d25eb9e209af365779d5468a82fe7b394207521cd984018989',
  'today-night.png': 'b6ebfb187da378a89a6931617260f793adf763647bde8fcf83ae2e4e3b620413',
}

describe('v6 design mockup captures', () => {
  it('docs/v6/screens holds exactly the mockup PNGs, unchanged', () => {
    const pngs = readdirSync('docs/v6/screens').filter((f) => f.endsWith('.png')).sort()
    expect(pngs).toEqual(Object.keys(MOCKUPS).sort())
    for (const f of pngs) {
      const sha = createHash('sha256').update(readFileSync('docs/v6/screens/' + f)).digest('hex')
      expect(sha, f + ' is not the mockup image; put app captures in docs/v6/release-captures').toBe(MOCKUPS[f])
    }
  })
})
