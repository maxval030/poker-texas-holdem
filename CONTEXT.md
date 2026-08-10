# Texas Hold'em Online

Browser play-money cash poker: solo against bots in a worker, or private online rooms with an authoritative table host.

## Language

### Hand lifecycle

**Hand**:
One deal from blinds through settlement and optional card reveal, until the next hand may start.
_Avoid_: Round (overloaded with betting round), game

**Betting round**:
One street of action (preflop, flop, turn, or river).
_Avoid_: Round alone, phase

**Reveal window**:
The fixed 8-second period after pots are awarded when eligible humans may Show or Muck once before the next hand. The result banner appears immediately with Chip deltas; Hand category fills in when a winner Shows. Show is irreversible for that hand.
_Avoid_: Showdown phase (conflicts with the street named showdown), reveal round

**Show**:
A player's choice to make their hole cards visible to the table after the hand is awarded.
_Avoid_: Flip, open, reveal (as a verb for the player action)

**Muck**:
A player's choice (or timeout default) to keep hole cards hidden after the hand is awarded.
_Avoid_: Fold (fold is mid-hand), hide, refuse

### Outcomes

**Fold win**:
A hand that ends with only one contesting player left; pots are awarded without comparing hands.
_Avoid_: Win by default, walkover

**Showdown**:
Comparing remaining hands when two or more players contest; may produce Showdown reveals only for seats that Show.
_Avoid_: Reveal (noun for the whole end state)

**Hand category**:
The ranked class of a poker hand (straight flush through high card), as a label only—not kicker detail. Used on the Result banner for winners who Showed, and as the label on the Made hand HUD.
_Avoid_: Hand name, poker hand (ambiguous with the deal)

**Made hand**:
The local seated viewer's current best hand from their own hole cards and the board so far, computed only on that client. When the viewer enables Made hand assist, it is shown from deal until they fold or the hand completes (Reveal window / Result banner takes over). Preflop uses the two hole cards alone; from the flop onward it is the best five among available hole+board cards (standard Texas selection, so unused hole cards mean playing the board). When several five-card sets tie for best score, Contributing cards are taken from the first set in a fixed combo order.
_Avoid_: Current hand, live strength, equity

**Made hand assist**:
A local viewer preference (browser localStorage) that turns the Made hand label and Contributing cards highlight on or off. First visit defaults to on; later visits restore the last choice. It does not change table rules, Result banner, or Hand chart availability.
_Avoid_: Trainer mode, HUD setting (too vague alone)

**Contributing cards**:
The subset of hole and board cards that form the Made hand's best five (or fewer preflop); cards not in that subset are not highlighted.
_Avoid_: Used cards, selected cards, winning cards (implies the pot)

**Hand chart**:
An optional on-table reference of Hand category ranks from strongest to weakest, opened and closed by the viewer (not always on screen).
_Avoid_: Odds table, strategy chart, range chart

**Chip delta**:
A player's net chip change for the completed hand: pot awards received minus that player's totalCommitted for the hand.
_Avoid_: Profit, P&L, winnings alone, stack difference (rebuy-sensitive)

### Actors

**Contesting player**:
A player still in the hand at settlement (not folded).
_Avoid_: Active (overloaded with whose turn it is)

**Eligible shower**:
A contesting seat whose controller is still human at settlement (fold-win: the winner only; showdown: every such contesting human) who may Show or Muck once during the Reveal window. Bot-controlled seats never Show. If no Eligible shower exists, the window is skipped. Disconnect during the window counts as Muck.
_Avoid_: Revealer

**Split winners**:
Two or more players who each receive a pot award in the same hand; the result banner names all of them.
_Avoid_: Tie alone (ties are one cause; side pots also create multiple winners)

**Result banner**:
Center-table summary after awards: Split winners or sole winner names, optional Hand category lines for winners who Showed, and Chip deltas for everyone who put chips in the hand. It appears as soon as pots are awarded and stays until the next hand starts, placed above the board so community cards stay visible. Leaving the table during the Reveal window does not dismiss it for others.
_Avoid_: Winner modal, end screen, toast
