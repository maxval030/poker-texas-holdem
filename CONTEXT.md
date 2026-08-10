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
The ranked class of a seven-card best hand (e.g. full house), shown as the category label only—not kicker detail—and only when that winner has Shown. Shown hole cards appear at the seat; the Result banner carries the category text.
_Avoid_: Hand name, poker hand (ambiguous with the deal)

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
Center-table summary after awards: Split winners or sole winner names, optional Hand category lines for winners who Showed, and Chip deltas for everyone who put chips in the hand. It appears as soon as pots are awarded and stays until the next hand starts. Leaving the table during the Reveal window does not dismiss it for others.
_Avoid_: Winner modal, end screen, toast
