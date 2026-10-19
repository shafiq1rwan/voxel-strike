# Red-key room exit lift redesign

[Mockup](exit-lift-red-room-v1.png) · [Generation prompt](exit-lift-red-room-v1-prompt.md)

Generated with the built-in image_gen tool on 2026-10-19. Implemented as a
procedural model and room surface/lighting pass; web review shortcut:
`?exitroom&seed=12345`. Ready/docked in-game captures are saved by
`scripts/exit-room-props.mjs` in `scripts/shots/exit-room-props-bottom.png`
and `scripts/shots/exit-room-props-top.png`.

This is the existing small lift behind the red-key door, not a freight
elevator. It preserves the two-by-two platform and three-unit rise to the
fixed upper exit pad. The two panels show boarding and upper docking from
the same viewpoint.

## Visual changes

- Two fixed square guide masts, overhead crossbrace, carriage blocks and a
  compact drive box give the platform a physical lifting mechanism.
- A steel grate deck, restrained hazard rim and one painted chevron mark
  where to stand, replacing the large translucent chevron column.
- Moving side guardrails leave the boarding and upper step-off edges open.
- Amber boarding lamps and green docked indicators show state.
- The green exit pad stays on the fixed upper ledge beyond the lift.

Implementation should keep the call-down, automatic boarding, rider carry,
retry and co-op behavior of `Elevator` in `src/entities/door.ts`. Room layouts
rotate the boarding axis, so decoration must follow `walkAxis`, preserve
clearance and avoid blocking either landing. The mockup depicts one facing.
The mast indicator should be fixed even though its position varies slightly
between the generated panels.
