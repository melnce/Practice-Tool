// Core game state & card types. Adjust if your real state differs.
/**
 * @typedef {"blue" | "red"} Player
 */

/**
 * @typedef {Object} Effect
 * @property {string} op
 * @property {Object.<string, any>} [k]
 */

/**
 * @typedef {Object} KeywordEntry
 * @property {string} name
 * @property {number} [cost]
 * @property {Effect[]} [effects]
 */

/**
 * @typedef {Object} Card
 * @property {string} uid
 * @property {string} name
 * @property {"Follower" | "Amulet" | string} type
 * @property {string} [class]
 * @property {string[]} [tribes]
 * @property {string} [description]
 * @property {string} [base_image]
 * @property {string} [image]
 * @property {string} [evo_image]
 * @property {number|string} [cost]
 * @property {number|string} [attack]
 * @property {number|string} [defense]
 * @property {number|string} [base_attack]
 * @property {number|string} [base_defense]
 * @property {boolean} [can_attack]
 * @property {boolean} [hasAttacked]
 * @property {boolean} [justPlayed]
 * @property {boolean} [hasRush]
 * @property {boolean} [isRush]
 * @property {boolean} [hasWard]
 * @property {boolean} [hasIntimidate]
 * @property {boolean} [hasBane]
 * @property {boolean} [hasLastWords]
 * @property {number} [barrierCharges]
 * @property {boolean} [__uiFlashBarrier]
 * @property {boolean} [__uiPopBarrier]
 * @property {boolean} [hasEvolved]
 * @property {"normal"|"super"} [evoType]
 * @property {boolean} [hasCountdown]
 * @property {number|string} [countdown]
 * @property {boolean} [hasEngage]
 * @property {(string|KeywordEntry)[]} [keywords]
 * @property {Effect[]} [fanfare]
 * @property {{cost: number, effects?: Effect[]}[]} [enhanceTiers]
 * @property {number} [peak_defense]
 * @property {Object.<string, any>} [k]
 */

/**
 * @typedef {Object} UIElements
 * @property {HTMLElement} blueHP
 * @property {HTMLElement} redHP
 * @property {HTMLElement} bluePP
 * @property {HTMLElement} redPP
 * @property {HTMLElement} blueLeader
 * @property {HTMLElement} redLeader
 * @property {HTMLButtonElement} redBoost
 * @property {{blueNormalEvo: HTMLButtonElement, blueSuperEvo: HTMLButtonElement, redNormalEvo: HTMLButtonElement, redSuperEvo: HTMLButtonElement}} evoButtons
 * @property {HTMLElement} tooltip
 */

/**
 * @typedef {Object} GameState
 * @property {number} blueHP
 * @property {number} redHP
 * @property {number} bluePP
 * @property {number} redPP
 * @property {number} blueMaxPP
 * @property {number} redMaxPP
 * @property {number} roundCount
 * @property {boolean} isBlueTurn
 * @property {boolean} gameStarted
 * @property {Card[]} blueHand
 * @property {Card[]} redHand
 * @property {Card[]} blueBoard
 * @property {Card[]} redBoard
 * @property {Card[]} blueDeck
 * @property {Card[]} redDeck
 * @property {Card[]} blueGraveyard
 * @property {Card[]} redGraveyard
 * @property {number} [bluePlaysThisTurn]
 * @property {number} [redPlaysThisTurn]
 * @property {number} blueEvoCharges
 * @property {number} blueSuperEvoCharges
 * @property {number} redEvoCharges
 * @property {number} redSuperEvoCharges
 * @property {boolean} blueEvoUsedThisTurn
 * @property {boolean} redEvoUsedThisTurn
 * @property {boolean} [redBoostUsedLate]
 * @property {boolean} [redBoostUsedEarly]
 * @property {boolean} [redBoostPending]
 */
