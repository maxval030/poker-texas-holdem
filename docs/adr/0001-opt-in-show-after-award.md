# Opt-in Show after pots are awarded

Hole cards stay hidden at hand settlement until each eligible human Chooses Show (or the Reveal window times out as Muck). Bots never Show. We rejected auto-revealing every non-folded hand on `complete` (the previous `viewFor` behaviour) because players asked to choose, and rejected host-only filtering because failover/resync needs the choice in authoritative table state.
