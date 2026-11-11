# Constellation kit 1.0.2 · Review corrections

This follow-up addresses the Owner's seven blocking findings and the accompanying polish review. The palette is unchanged. No local build, browser, unit test or contrast test was run; generation of token files is the only local source transformation.

1. Filled primary actions use their audited hover and pressed values without neutral overlays, including the forced-state specimens.
2. Neutral segmented choices have a default-border edge and a bold selected label. Theme/view choices expose radio groups; content tabs retain linked panel semantics.
3. Unselected tab labels use secondary text on rest and hover.
4. The mastery completion mark follows the track, alongside its explanatory badge.
5. Disabled Select triggers use transparent fills, subtle boundaries and disabled text, explain why, and explicitly use button type.
6. Token metadata declares directional foreground/background pairings, thresholds and decorative exceptions. Swatches and CI use this same contract.
7. Legacy kit styles are replaced by semantic shared controls and ordered cascade layers. Application base imports occupy a lower layer without changing their internal ordering. Retired severity aliases, gradients, dashed disabled chrome and switch hatching are removed.

Polish includes component-specific guidance, stepper arrow keys and a named live value, one theme control, ordered fold-out section navigation, the shared Select for density, collapsed references, consistent 24-hour time fields, a visibly broken error emblem, a 14-week square-cell calendar with labels and a today outline, plain status copy, visible foundation scales, and one statement-number sequence.

The screenshot workflow audits actual rendered hover/press backgrounds and contrast, segmented edges, tab hover, disabled Select, mastery placement, square heatmap cells, theme roles and keyboard stepper behavior before exporting images and the offline HTML. Existing tests retain their assertions while reflecting the new radio semantics and explicit 24-hour field anatomy.
