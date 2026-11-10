# Constellation delivery

Owner task: "Implement this plan on lemma repo. Don't implement in phase we just push it in one pr under owner setup."

Agent: owner-setup-v7 · Item: N122

The attached LEMMA-V7-PLAN.md is the product specification. The Owner's direct instruction replaces phased delivery, intermediate stop gates and per-phase NEXT items with one implementation branch and one reviewable PR. No separate phase PRs or feature splits will be opened.

Decisions: retain all deep links and five accessible main navigation links; immersive screens may hide that navigation visually. Use the specified Night/Day tokens, local fonts, deterministic mathematical emblems and creation-order subject identities. Implement capture, search, first run, insights and subject editing in this PR. Keep the existing database contracts and dependencies. Existing tests and protected CI paths remain intact.

Visual and device acceptance remain explicit review checks; automated execution cannot certify Owner approval or physical-device behavior. v6 remains available through the reversible v7Shell switch. Screenshot references belong under docs/v7/golden and do not modify docs/v6/screens.
