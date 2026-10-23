# Monster behaviours and encounter patterns

**Proposal v2, 2026-10-23.** All numbers below are starting values for playtesting, not statements about the current code. Existing monsters should keep their working implementations until their proposed changes are deliberately reviewed. Do not silently replace current boss tuning or reverse earlier owner decisions.

Units are world units and game-time seconds. HP is base HP before existing difficulty/perk multipliers. Unless specified otherwise, an attack needs line of sight, locks aim before execution, hits once, and cannot skip its recovery. The common state flow is `idle/patrol → notice → approach → prepare → commit → recover → approach`. Death cancels queued attacks, tethers and healing links.

## 1. Facility Entry

[Visuals: sheet 01](01-facility-entry-security.png). Theme: learn one movement decision at a time. No Ticker ambushes, Brute charges, armor puzzles or simultaneous support effects in the opener.

### Husk — close-range pressure

- **Body:** existing lean rust-red hunter, amber visor, long arms and dark claws. Keep its current scale and gait.
- **Start tuning:** 45 HP; speed 2.8; claw 10 damage, 1.6 reach.
- **Pattern:** approach → pull one claw behind shoulder for **0.65 s** → lock facing for the last **0.2 s** → one **0.15 s** forward rake → **0.9 s** exposed recovery. No repeated contact damage during the swing.
- **Counter:** step backward or sideways after the shoulder twist, then fire or bash while its arm is extended. It cannot rotate its committed strike to follow a dodge.
- **First encounter:** one Husk in a roomy corridor. The second can appear after the player has space to understand the first.

### Sentry Bud — stationary single-shot lesson

- **Body:** low fixed sensor base, tilting square cyan eye, two large protective lids. It stays bolted to the floor; it never floats like a Sentinel.
- **Start tuning:** 28 HP; bolt 6 damage at speed 7; range 9.
- **Pattern:** notice player → aim for **1.0 s** with lids opening → lock direction **0.25 s** before release → fire one visible slow bolt → **1.5 s** dim-lid recovery. At least **3.5 s** between shots.
- **Counter:** bait the shot, step aside, shoot the exposed head. No armor requirement: two normal pistol body hits can kill it.
- **First encounter:** one Bud at the far end of a short clear lane; introduce it alone before pairing it with a Husk. Never place it watching the arrival point.

**Sector pattern:** one melee lesson → one projectile lesson → a small room with one of each. Permit at most two simultaneous hostile windups in the opener; aim for one during the first lessons.

## 2. Security Floor

[Visuals: sheet 01](01-facility-entry-security.png). Theme: change angle while watching a ranged emitter.

### Clamp Guard — lateral close-range denial

- **Body:** squat slate armored biped, two large squared clamp jaws, amber shoulder pistons. Its defining feature is the open pincer silhouette, not a shield or rifle.
- **Start tuning:** 85 HP; speed 1.8; pinch 16 damage, reach 2.1; turning limited to 65 degrees/s while approaching.
- **Pattern:** advance → spread both jaws and plant feet for **0.9 s** → stop turning for the last **0.3 s** → close once across a fixed forward arc over **0.2 s** → jaws remain shut and piston exposed for **1.2 s**.
- **Counter:** move to its side, retreat beyond reach, or interrupt the exposed recovery with a bash. The whole body remains normally damageable; this is not a second armor puzzle before Carapace.
- **Placement:** a checkpoint with two routes around a central obstacle. Do not put the first Guard in a one-body-wide doorway.

### Arc Sentinel — mobile ranged pressure

- **Body:** existing hovering cube with four paddles, two shutters and a cyan optic. Its altitude is steady enough to aim at.
- **Start tuning:** 55 HP; one bolt of 10 damage at speed 9; preferred distance 5–9.
- **Pattern:** drift to a clear lane → spread paddles/open shutters for **0.8 s** → lock aim for **0.25 s** → release one bolt → **1.0 s** recovery before moving again.
- **Counter:** strafe after aim lock or use a real wall/closed door. Shots do not curve after launch.
- **Placement:** put it off the Guard's forward axis so the player chooses an angle, but leave cover and a clear escape lane.

**Sector pattern:** first show one Guard's jaws; then one Sentinel; then combine one of each. Keycard response uses this sector's roster, not Husks from sector 1.

## 3. Reactor Access

[Visuals: sheet 02](02-reactor-biofoundry.png). Theme: make large attacks commit, and remove a control threat before it can constrain movement.

### Brute — punish a committed charge

- **Body:** existing broad rust-red heavy, pale shoulders/chest, tusks and immense dark fists.
- **Start tuning:** 180 HP; charge 20 damage, speed 8, max travel 6; melee 18 damage inside 1.8.
- **Pattern:** shoulder down and feet planted for **1.0 s** → aim locks for the last **0.3 s** → straight charge up to **0.75 s** → **1.4 s** recovery; hitting a wall replaces that with **2.0 s** stunned recovery. Inside melee range, use a separate **0.8 s** backhand warning, one strike, then **1.1 s** recovery.
- **Counter:** sidestep into a prepared lane, let it hit solid architecture, then punish the stopped body. No steering after commitment, no damage every frame of contact.
- **Placement:** use a broad route with an actual wall to bait it into. Never demand a charge dodge on a tiny lift platform.

### Wire Leech — breakable short tether

- **Body:** low four-legged electrical parasite, broad dark chassis, large copper square coil and violet front emitter.
- **Start tuning:** 45 HP; tether range 7; move slow 25% for at most **0.8 s**; two 4-damage ticks at **0.4 / 0.8 s** if still attached; cooldown at least 4.5.
- **Pattern:** anchor feet/open coil for **1.1 s** → lock aim for **0.3 s** → one visible tether projectile → a hit can attach the short link → **1.5 s** folded-coil recovery.
- **Counter:** break line of sight, leave range, kill it, or deal 20 damage to its large exposed coil to cancel the link. The coil needs a real shootable hit region; visual-only targeting is insufficient.
- **Limits:** one link per player; slows do not stack. No root, jump disable, weapon lock, damage through walls or repeated reattachment in one cast. Detach if the target dies, owner dies, sector resets, LOS breaks or range is exceeded.

**Sector pattern:** one Brute with wall-bait space → one Leech behind modest cover → later one of each. Never start a first-time Brute charge at the same instant the first Leech link attaches.

## 4. Biofoundry

[Visuals: sheet 02](02-reactor-biofoundry.png). Theme: read an environmental release, then move around temporary landing zones.

### Vatborn — tank-bound heavy melee

- **Body:** existing pale mutant, olive stains, chest restraint, one huge right club arm. This is not a generic Brute painted white.
- **Start tuning:** 95 HP; club 18 damage, reach 2.2; speed 2.3.
- **Pattern:** dormant in a visible occupied tank → **1.2 s** agitation on a legitimate breach trigger → open a real collision gap → step out onto verified supported clear floor → **1.0 s** club windup → one **0.2 s** smash → **1.5 s** recovery with club on floor.
- **Counter:** leave the marked tank exit lane; circle away from its large arm during windup and attack during recovery. It neither spits nor explodes.
- **Limits:** one occupant per tank, one release per occupant, no second invisible spawn. Never wake all tanks from a distant single shot unless the intended noise rules actually reach them.

### Spitter — arcing acid and bounded ground patches

- **Body:** burgundy quadruped, square snout and two lime cheek reservoirs; preserve the earlier Spitter concept.
- **Start tuning:** 70 HP; glob 10 impact damage, speed 7; patch radius 0.8, lifetime 3 s, 3 damage every 0.5 s while standing in it.
- **Pattern:** seek a 5–10-unit lane → brighten reservoirs/lift snout for **1.0 s** → lock landing point for the last **0.3 s** → lob one arc → **1.4 s** empty-reservoir recovery. At least 4.5 s between lobs.
- **Counter:** leave the locked landing mark, intercept the shot with cover, or close during recovery. One interrupt is allowed during each charge; do not permit permanent flinch locking.
- **Limits:** one patch per Spitter, three across an encounter; replacing a patch retires its previous damage volume. Overlaps use the strongest tick, not additive ticks. Suppress a placement that would cover the only traversable doorway; relocate or skip the patch.

**Sector pattern:** one safe-to-observe tank → one isolated Spitter → one release with a Spitter in a side lane. Keep at least one dry route to cover.

## 5. Incubation

[Visuals: sheet 03](03-incubation-heat-exchangers.png). Theme: create openings through positioning and a repeatable boss cycle.

### Carapace — positional armor

- **Body:** squat burgundy biped with two large pale hinged chest plates and an orange core. Sides/back remain visibly uncovered.
- **Start tuning:** 120 HP; front closed plates receive 25% damage; side/back 100%; exposed core 200%; spike 8 damage each.
- **Pattern:** guarded slow advance/slow turn → plant feet and spread plates for **0.9 s** → lock facing → three slow spikes in a narrow horizontal fan → core exposed for **1.4 s** → close over **0.35 s**.
- **Counter:** flank its limited turn, dodge the fan, or fire into the real exposed core. Armor depends on hit location and plate state. All guns can damage it; splash still needs an unobstructed path to the body.
- **Placement:** first introduce one in a wide room with two approaches, before the boss. Never stack three armored fronts across the only route.

### Broodkeeper — boss with deliberate damage windows

- **Body:** existing fixed wall cradle, burgundy mass, green reservoirs, pale core doors, abdominal hatches and bracing arms. No walking legs or pursuit.
- **Start tuning:** 600 HP; acid 14 damage. Preserve the current armor/core/quad rules unless a deliberate tuning change is approved and tested; this pack does not silently override the working boss implementation.
- **Cycle:** **1.0 s** volley warning → three globs **0.35 s** apart → **2.4 s** exposed core → **1.0 s** hatch/side-incubator warning → release at most one Carapace from a clearly marked **side incubator** → **3.0 s** exposed core → repeat.
- **Sector identity:** use sector-5 Carapaces, not recycled sector-1 Husks, for the proposed boss adds. A full Carapace cannot emerge from the small abdominal hatch in the artwork; the hatch cues an off-body incubator opening instead.
- **Limits:** at most two living adds and four total add releases per attempt. If capped, skip the release and still give the core window. Below 40% HP, increase volley to five globs while retaining both windows and the same hazard caps. Never heal or resurrect the boss.
- **Defeat:** cancel queued attacks/releases, clear damaging boss acid and drop the key once. Surviving visible adds can be fought but must not gate the key or lift. Do not spawn a wave during an ad or pause.

**Sector pattern:** one Carapace lesson → supplies with a visible boss entrance → boss cycle. Test that the actual supplied ammunition can finish the fight without a special weapon.

## 6. Heat Exchangers

[Visuals: sheet 03](03-incubation-heat-exchangers.png). Theme: a moving dodge against a leaper, followed by a short precision window on a ranged enemy.

### Vent Stalker — leap at a locked position

- **Body:** existing low rust quadruped, basalt back ridge and orange seam.
- **Start tuning:** 55 HP; leap 18 damage, max range 6.
- **Pattern:** stalk using real walkable floor → compress legs/brighten seam for **0.8 s** → lock target for the last **0.25 s** → one committed **0.45 s** leap → **1.2 s** low recovery.
- **Counter:** move sideways after crouch/aim lock, then shoot its recovery. It cannot rotate in mid-air, retarget a landing or hit repeatedly as it slides past.
- **Placement:** wide dry bridges or connected floor. Do not leap across unsupported trenches or onto a blocked gallery.

### Kiln Drone — expose the furnace to fire

- **Body:** existing hovering furnace, teal shutters, three rectangular exhaust stacks and orange core.
- **Start tuning:** 75 HP; molten projectile 14 damage at speed 8; exposed core receives 2x hitscan damage.
- **Pattern:** hover at 6–10 units → open shutters for **1.1 s** → lock aim for **0.3 s** → release one large slow slug → keep core open for **1.2 s** → close before moving again.
- **Counter:** dodge the slug and aim at the bright core. Closed body remains damageable; no required weapon type.

**Sector pattern:** one leaper on a wide lane → one Drone → one pair, with the Drone aimed across a different lane from the leap.

## 7. Deep Core

[Visuals: sheet 04](04-deep-core-freight.png). Theme: vertical and lateral movement have different purposes.

### Cinder Hulk — jumpable ground ring

- **Body:** existing basalt heavy, immense hammer fists and exposed furnace chest. Keep it distinct from the bone-shouldered Brute.
- **Start tuning:** 180 HP; slam 22 damage; max radius 4; ring propagates at 7 units/s, hits each target at most once.
- **Pattern:** raise both fists for **1.2 s** with a clear expanding ground mark → slam once → a thin damage ring crosses supported floor → **1.6 s** planted-fist recovery with core open.
- **Counter:** jump so feet clear the ring's 0.35-unit height, leave its radius, or use valid blocking terrain. A floor below a gallery cannot damage a player several units above it. No full-height invisible sphere.

### Ash Weaver — temporary line of heat

- **Body:** broad low furnace crawler, four stout legs, three front square vent ports and an ash-gray exhaust box. Preserve the selected four-legged artwork.
- **Start tuning:** 70 HP; three heat spots of radius 0.65 at 3/5/7 units ahead; lifetime 1.5 s; strongest active spot deals 6 damage per 0.5 s.
- **Pattern:** brace → three ports light left-to-right over **1.2 s**, showing the complete floor line → lock the line for **0.35 s** → ignite the three spots → **1.4 s** open-port recovery.
- **Counter:** step to either side of the line. Jumping a Hulk ring is not permission to land in a heat spot: the visual footprints must make that distinction clear.
- **Limits:** one line per Weaver, one Weaver in the first combined encounter. Each spot checks supported reachable floor and stops at walls/doors; no attacks under a different floor or through the drill.

**Sector pattern:** isolated jump lesson → isolated line lesson → combine only with enough width to sidestep before jumping. Never create a mandatory jump landing with no safe floor.

## Freight Depot

[Visuals: sheet 04](04-deep-core-freight.png). Theme: cargo cover breaks links; a marked landing is different from an aimed projectile.

### Hook Hauler — interruptible harpoon pull

- **Body:** tall orange loader, asymmetric crane shoulder, square hook hand and blue-gray rear winch.
- **Start tuning:** 110 HP; hook 12 impact damage at speed 10; maximum pull 2 units; range 9; cooldown at least 4 s.
- **Pattern:** plant boots and draw hook for **1.0 s** → lock aim for **0.3 s** → launch one visible hook → on a hit, leave a **0.45 s** cable-cut window before a short pull → **1.5 s** reel-in recovery.
- **Counter:** dodge, hide behind a container, or deal 25 damage to the visibly exposed winch to break the attachment. The cable/coil cue must correspond to a real hittable region.
- **Limits:** stop immediately at collision, unsupported floor, a floor-height change, rail, moving lift or closed door. Never yank through cover, over a pit or off a gallery. Do not combine the first hook lesson with another forced-movement source. No repeated yank while the same hook remains attached.

### Pallet Stomper — one high cargo lob

- **Body:** squat cobalt four-wheel chassis, amber eye, two overhead fork arms and a single wooden cargo cube.
- **Start tuning:** 100 HP; cargo impact 14 damage; blast radius 1.8; at least 4.5 s between throws.
- **Pattern:** raise cargo for **1.1 s** → lock and mark its supported landing point for **0.4 s** → one high visible arc, resolving against the first real obstruction → **1.6 s** empty-fork recovery.
- **Counter:** leave the marked landing; a tall container can intercept the arc. An early collision moves the actual impact to that collision point and never damages through the obstruction.
- **Limits:** one cargo projectile per Stomper, no permanent crate/cover spawned by the attack. Scatter debris is cosmetic and pooled. It does not steal or respawn destructible world crates.

**Map pattern:** isolated hook lane with containers → separate lob lesson → one of each on staggered timers. Keep a cover route along both sides of the loading aisle.

## Deep Excavation

[Visuals: sheet 05](05-excavation-medical.png). Theme: read the floor to dodge an emergence, then use the rock pillars as actual beam cover.

### Seam Ripper — bounded burrow and emergence

- **Body:** long low cuboid basalt grub, four body segments and a broad blunt jaw head, ore flecks and amber eye. No humanoid limbs.
- **Start tuning:** 90 HP; bite 18 damage; emergence radius 0.9; hidden movement at most 0.6 s, followed by a visible 0.9 s emergence warning.
- **Pattern:** briefly burrow along a validated ground route with a moving crack/dust trail → lock a reachable emergence mark at least 2 units from the current player position → **0.9 s** warning → surface and snap once → remain fully exposed for **1.3 s** recovery.
- **Counter:** step away from the marked spot, then attack the surfaced body. Do not allow continuous hidden pursuit with no shot opportunity.
- **Limits:** no emergence under the player, in walls, behind a closed door, on a different floor, under a gallery deck or outside supported floor. On a gallery or invalid surface, stay above ground and crawl. If no valid emergence exists, cancel the attack. Use shootable segment hit boxes or a faithful body box; do not make the visible rear body immune.

### Surveyor — fixed-arc laser sweep

- **Body:** tall four-foot scanner platform as selected in the sheet, yellow rectangular lens housing and two side rangefinders; no humanoid gun pose.
- **Start tuning:** 90 HP; beam range 14; sweep arc 45 degrees over 1.2 s; damage 8 per 0.4 s while intersecting, max three ticks per cast.
- **Pattern:** brace feet/project a dotted harmless preview for **1.2 s** → freeze sweep origin, plane and endpoints for **0.35 s** → sweep the solid thin beam through that fixed arc for **1.2 s** → lens tilts down/dims for **1.4 s**.
- **Counter:** move beyond the arc or behind a real rock pillar, drill body or closed door. The preview must include the entire future arc, not just the first ray. No last-frame homing or instantaneous full rotation.
- **Limits:** raycast every damage segment against terrain and doors. A translucent effect never implies damage beyond the first solid hit. Do not aim through a gallery floor; validate all vertical targeting and cover.

**Map pattern:** one visible emergence in open floor → one Surveyor with two visible cover pillars → one pair, leaving a clear path from emergence mark to cover. At most one burrower hidden at once during the first encounter.

## Medical Wing

[Visuals: sheet 05](05-excavation-medical.png). Theme: read a burst cadence, then identify and interrupt the support unit.

### Suture Walker — locked three-dart rhythm

- **Body:** thin ivory biped, mint chest cassette, long legs and one large three-port injector forearm. No gore or realistic exposed needles.
- **Start tuning:** 65 HP; three darts, 6 damage each at speed 14; preferred range 4–10.
- **Pattern:** raise/bracket injector and light three indicators over **0.9 s** → lock facing for **0.3 s** → fire at **0 / 0.22 / 0.44 s**, with a narrow fixed left/center/right fan → **1.3 s** lowered-arm recovery.
- **Counter:** strafe out of the whole locked fan or take cover; one dodge should not be invalidated by retargeting the third dart. A large open chest cassette gives an obvious recovery target without granting invulnerability elsewhere.

### Orderly — finite, interruptible enemy healing

- **Body:** wheeled ivory/mint medical cabinet, cyan plus on a dark front face, two folding treatment arms. It stays on floor support; it is not a Kiln Drone recolor.
- **Start tuning:** 60 HP; one ally healed at 8 HP/s for at most 3 s, max 24 HP per channel, **48 HP total lifetime healing** per Orderly. Lone defensive bash: 8 damage after a 0.9 s warning and 1.2 s recovery.
- **Pattern:** seek a damaged ally within 6 units and clear LOS → point treatment arm/show target outline for **1.2 s** → channel one visible cyan link for up to **3 s** → **1.5 s** arms-folded recovery. Move between channels, not while channeling.
- **Counter:** break the healing beam with a privacy screen or cabinet, kill the Orderly, or interrupt with 20 damage within 0.25 s. An interrupted channel still enters recovery.
- **Limits:** one Orderly per first encounter. Never heal itself, another Orderly, any boss, dead enemies, or beyond max HP; no resurrection and no overheal shields. Interrupting does not reset the lifetime budget. If no ally is valid, stop channeling; it cannot sustain an infinite fight after the player runs out of ammo.

**Map pattern:** isolated Walker burst → visible Orderly healing a previously wounded Walker → one Orderly with at most two Walkers. Bed bays and privacy partitions must block both hostile projectiles and healing LOS consistently.

## Shared implementation and fairness rules

1. All warning durations use simulation time and survive 30/60/120 Hz consistently. Pausing/ads suspend attacks, projectiles, hazards and support channels together.
2. Keep preparation visibly different from commitment and recovery. A committed attack has no surprise retarget. Melee, charge and slam hits use per-cast hit sets so a low frame rate cannot multiply damage.
3. All shots and links respect voxels, closed/moving doors and vertical separation. Aiming, line effects and actual damage use the same endpoint. No attack can pass through the large mining drill, a bed partition or a container merely because its art is instanced.
4. Controllers (Leech, Hauler, Orderly) have a real break condition, a finite effect and a full recovery. No chained hard stuns. At most two controller species active together in advanced encounters; one in introductions.
5. Start with at most three persistent ground damage volumes per encounter, one healing beam and one player tether. Reuse pooled effects; do not allocate timers/meshes per frame. Patch overlap uses the strongest tick. Death/reset removes owned links immediately; temporary floor zones expire on their bounded timers, and all effects clear on retry/teardown. Boss death explicitly removes boss acid.
6. Validate spawn/landing points against supported floor, player clearance, enemy occupancy and closed doors. Never schedule an unseen instant attack from an arrival point. Spawn warnings must be observable from the current arena.
7. Preserve current authority routing: clients may display warnings, but the host decides hit events, healing, control effects, spawns and deaths. No double application on the client.
8. Every weapon remains useful. Armor has a legible opening or flank and still receives nonzero damage. No monster requires a secret weapon, a skin or a permanent upgrade to defeat.
9. Keep normal-map floor routes and the keycard → door → lift progression. Boss adds, burrowing state and healing links never gate the exit if something gets stuck.
10. Performance acceptance is a complete-scene draw count under 250 with the intended enemies awake, no new shader programs after warm-up, bounded projectiles/hazards, and mobile-readable warnings. Box count alone is not a draw-call guarantee.
